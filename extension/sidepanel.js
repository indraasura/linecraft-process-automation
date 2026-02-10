/**
 * sidepanel.js
 * Comprehensive logic for Trello Bug Reporter Extension
 */

// 1. Configuration: Update this with your actual Netlify site URL
const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";

// 2. Element Selectors
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
const captureBtn = document.getElementById('captureBtn');
const submitBtn = document.getElementById('submitBtn');
const descriptionInput = document.getElementById('description');
const loader = document.getElementById('loader');
const gallery = document.getElementById('gallery');
const previewImg = document.getElementById('preview');

// State management for multiple screenshots
let capturedImages = [];

/**
 * Phase 1: Initial Load
 * Fetches the list of boards defined in your Netlify Manager
 */
async function initializeApp() {
  try {
    const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    
    const boards = await res.json();
    
    // Populate Board Dropdown
    boardSel.innerHTML = '<option value="">Select Board...</option>' + 
      boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      
  } catch (err) {
    console.error("Failed to load boards:", err);
    boardSel.innerHTML = '<option>Error: Check CORS/Netlify Logs</option>';
  }
}

/**
 * Phase 2: Chained Dropdown
 * Fetches cards specifically for the selected board
 */
boardSel.addEventListener('change', async () => {
  const boardId = boardSel.value;
  if (!boardId) {
    cardSel.disabled = true;
    cardSel.innerHTML = '<option>Select board first...</option>';
    return;
  }

  cardSel.disabled = true;
  cardSel.innerHTML = '<option>Loading cards...</option>';

  try {
    // We use a POST request to your manager to fetch cards for a specific boardId
    const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardId}`, { 
      method: 'POST' 
    });
    
    if (!res.ok) throw new Error("Failed to fetch cards");
    
    const cards = await res.json();
    
    cardSel.innerHTML = cards.length > 0 
      ? cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="">No cards found in this board</option>';
      
    cardSel.disabled = false;
  } catch (err) {
    console.error("Failed to load cards:", err);
    cardSel.innerHTML = '<option>Error loading cards</option>';
  }
});

/**
 * Phase 3: Screen Capture
 * Captures the current active tab and adds it to the local gallery
 */
captureBtn.addEventListener('click', () => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      alert("Capture failed: " + chrome.runtime.lastError.message + "\nTry refreshing the page.");
      return;
    }

    // Store image in array
    capturedImages.push(dataUrl);

    // Update Gallery UI
    const imgContainer = document.createElement('div');
    imgContainer.style.position = "relative";
    
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = "70px";
    img.style.height = "70px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "6px";
    img.style.border = "1px solid #dfe1e6";
    
    imgContainer.appendChild(img);
    gallery.appendChild(imgContainer);
    
    // Show the most recent one in the main preview if needed, 
    // or just rely on the gallery list
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
  });
});

/**
 * Phase 4: Data Submission
 * Sends the payload to trello-webhook.js
 */
submitBtn.addEventListener('click', async () => {
  const description = descriptionInput.value;
  const targetCardId = cardSel.value;

  // Validation
  if (!targetCardId) {
    alert("Please select a target Trello card.");
    return;
  }
  if (!description.toLowerCase().startsWith("bug")) {
    alert("Requirement: Description must start with 'Bug [number]'");
    return;
  }

  // UI State: Loading
  submitBtn.disabled = true;
  loader.style.display = 'block';

  /**
   * Payload Construction
   * We send 'isExtension: true' so the worker knows to manually 
   * upload attachments and post the comment.
   */
  const payload = {
    isExtension: true, 
    attachments: capturedImages,
    action: {
      data: {
        text: description,
        card: { id: targetCardId }
      }
    }
  };

  try {
    const response = await fetch(`${NETLIFY_BASE}/trello-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      alert("✅ Bug Reported!\nComment posted & checklist updated.");
      
      // Reset Form and State
      descriptionInput.value = "";
      capturedImages = [];
      gallery.innerHTML = "";
      previewImg.style.display = 'none';
      
      // Optional: Close sidepanel or reload
      // window.close(); 
    } else {
      const errorText = await response.text();
      throw new Error(errorText || "Submission failed");
    }
  } catch (err) {
    console.error("Submission Error:", err);
    alert("Critical Error: " + err.message);
  } finally {
    submitBtn.disabled = false;
    loader.style.display = 'none';
  }
});

// Run Init
initializeApp();