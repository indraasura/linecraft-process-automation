const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
const gallery = document.getElementById('gallery');
const loader = document.getElementById('loader');

let capturedMedia = []; // Array of {id, data, type}
let mediaRecorder;
let recordedChunks = [];

/**
 * Initialize Boards and Cards
 */
async function init() {
  try {
    const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
    const boards = await res.json();
    boardSel.innerHTML = '<option value="">Select Board...</option>' + 
      boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  } catch (e) {
    boardSel.innerHTML = '<option>Error loading boards</option>';
  }
}

boardSel.addEventListener('change', async () => {
  cardSel.disabled = true;
  cardSel.innerHTML = '<option>Loading cards...</option>';
  try {
    const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
    const cards = await res.json();
    cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    cardSel.disabled = false;
  } catch (e) {
    cardSel.innerHTML = '<option>Error loading cards</option>';
  }
});

/**
 * Gallery Management
 */
function addToGallery(dataUrl, type) {
  const id = Date.now();
  capturedMedia.push({ id, data: dataUrl, type });
  renderGallery();
}

function renderGallery() {
  gallery.innerHTML = '';
  capturedMedia.forEach(item => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';
    const media = document.createElement(item.type === 'video' ? 'video' : 'img');
    media.src = item.data;
    if (item.type === 'video') media.setAttribute('muted', '');
    
    const del = document.createElement('div');
    del.className = 'del-btn';
    del.innerHTML = '&times;';
    del.onclick = () => {
      capturedMedia = capturedMedia.filter(m => m.id !== item.id);
      renderGallery();
    };
    
    wrap.appendChild(media);
    wrap.appendChild(del);
    gallery.appendChild(wrap);
  });
}

/**
 * Full Screenshot Capture
 */
document.getElementById('captureBtn').addEventListener('click', () => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
    if (url) addToGallery(url, 'image');
  });
});

/**
 * Full Screen Video Recording
 */
document.getElementById('recordBtn').addEventListener('click', async () => {
  const btn = document.getElementById('recordBtn');
  
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    btn.innerText = "🎥 Record";
    btn.classList.remove('btn-danger');
    return;
  }

  // Use desktopCapture to allow recording the ENTIRE SCREEN
  const streamId = await new Promise(resolve => {
    chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], resolve);
  });

  if (!streamId) return; // User cancelled

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { 
      mandatory: { 
        chromeMediaSource: "desktop", 
        chromeMediaSourceId: streamId 
      } 
    }
  });

  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const reader = new FileReader();
    reader.onloadend = () => addToGallery(reader.result, 'video');
    reader.readAsDataURL(blob);
    recordedChunks = [];
    stream.getTracks().forEach(track => track.stop());
  };

  mediaRecorder.start();
  btn.innerText = "⏹️ Stop";
  btn.classList.add('btn-danger');
});

/**
 * Submission Logic
 */
document.getElementById('submitBtn').addEventListener('click', async () => {
  const desc = document.getElementById('description').value;
  const prio = document.getElementById('prioritySelect').value;
  const targetCardId = cardSel.value;

  if (!desc.toLowerCase().startsWith("bug")) return alert("Description must start with 'Bug [number]'");
  if (!targetCardId) return alert("Please select a card.");

  loader.style.display = 'block';
  document.getElementById('submitBtn').disabled = true;

  try {
    const res = await fetch(`${NETLIFY_BASE}/trello-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isExtension: true,
        attachments: capturedMedia.map(m => m.data),
        action: { data: { text: `[${prio}] ${desc}`, card: { id: targetCardId } } }
      })
    });

    if (res.ok) {
      alert("✅ Report Submitted Successfully!");
      location.reload();
    } else {
      throw new Error("Trello sync failed");
    }
  } catch (err) {
    alert("Submission Error: " + err.message);
  } finally {
    loader.style.display = 'none';
    document.getElementById('submitBtn').disabled = false;
  }
});

init();