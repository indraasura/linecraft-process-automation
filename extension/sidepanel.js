const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
const gallery = document.getElementById('gallery');
const loader = document.getElementById('loader');

let capturedMedia = []; // Array of Base64 strings (images or videos)
let mediaRecorder;
let recordedChunks = [];

/**
 * 1. Initialize Boards and Cards
 */
async function init() {
  const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
  const boards = await res.json();
  boardSel.innerHTML = '<option value="">Select Board...</option>' + 
    boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

boardSel.addEventListener('change', async () => {
  cardSel.disabled = true;
  cardSel.innerHTML = '<option>Loading cards...</option>';
  const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
  const cards = await res.json();
  cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  cardSel.disabled = false;
});

/**
 * 2. Capture Suite: Images
 */
document.getElementById('captureBtn').addEventListener('click', () => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    addToGallery(dataUrl, 'image');
  });
});

// Partial Capture (Requires content script to handle UI selection)
document.getElementById('partialBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // This triggers a message to the content script to start the selection box
  chrome.tabs.sendMessage(tab.id, { action: "start-selection" });
});

/**
 * 3. Capture Suite: Video Recording
 */
document.getElementById('recordBtn').addEventListener('click', async () => {
  const btn = document.getElementById('recordBtn');
  
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.innerText = "🎥 Record";
    return;
  }

  // Choose screen/window to record
  const streamId = await new Promise(resolve => {
    chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], resolve);
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } }
  });

  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const reader = new FileReader();
    reader.onloadend = () => {
      capturedMedia.push(reader.result);
      addToGallery(reader.result, 'video');
    };
    reader.readAsDataURL(blob);
    recordedChunks = [];
    stream.getTracks().forEach(track => track.stop());
  };

  mediaRecorder.start();
  btn.innerText = "⏹️ Stop";
});

/**
 * 4. DevTools: API/Network Logging
 */
document.getElementById('devToolsBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.debugger.attach({ tabId: tab.id }, "1.2", () => {
    chrome.debugger.sendCommand({ tabId: tab.id }, "Network.enable");
    alert("🛠️ API Logger Enabled. Network requests will be appended to description.");
    
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (method === "Network.requestWillBeSent") {
        const log = `\n[API] ${params.request.method} ${params.request.url.substring(0, 50)}...`;
        document.getElementById('description').value += log;
      }
    });
  });
});

/**
 * 5. Submission with Priority
 */
document.getElementById('submitBtn').addEventListener('click', async () => {
  const priority = document.getElementById('prioritySelect').value;
  const description = `[${priority}] ` + document.getElementById('description').value;
  const targetCardId = cardSel.value;

  if (!description.toLowerCase().includes("bug")) return alert("Description must include 'Bug [number]'");

  loader.style.display = 'block';

  const payload = {
    isExtension: true,
    attachments: capturedMedia,
    data: {
      text: description,
      card: { id: targetCardId }
    }
  };

  try {
    await fetch(`${NETLIFY_BASE}/trello-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    alert("✅ Success! Check Trello for the comment and checklist.");
    location.reload();
  } catch (err) {
    alert("Submission Error: " + err.message);
  } finally {
    loader.style.display = 'none';
  }
});

function addToGallery(src, type) {
  capturedMedia.push(src);
  const container = document.createElement('div');
  const media = document.createElement(type === 'video' ? 'video' : 'img');
  media.src = src;
  media.style = "width: 70px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd;";
  if (type === 'video') media.controls = true;
  container.appendChild(media);
  gallery.appendChild(container);
}

/**
 * Add this listener to your existing sidepanel.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture-partial") {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      cropImage(dataUrl, request.area);
    });
  }
});

/**
 * Crops the full screenshot to the selected area.
 */
function cropImage(dataUrl, area) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = area.w;
    canvas.height = area.h;
    const ctx = canvas.getContext('2d');
    
    // Draw only the selected portion of the image onto the canvas
    ctx.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
    
    const croppedDataUrl = canvas.toDataURL('image/png');
    addToGallery(croppedDataUrl, 'image'); // Existing helper function
  };
  img.src = dataUrl;
}

init();