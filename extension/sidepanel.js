const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";
let capturedMedia = []; // Array of {id, data, type}
let mediaRecorder;
let recordedChunks = [];

const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
const gallery = document.getElementById('gallery');

async function init() {
  try {
    const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
    const boards = await res.json();
    boardSel.innerHTML = '<option value="">Select Board...</option>' + 
      boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  } catch (e) { boardSel.innerHTML = '<option>Error loading boards</option>'; }
}

boardSel.addEventListener('change', async () => {
  cardSel.disabled = true;
  cardSel.innerHTML = '<option>Loading...</option>';
  const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
  const cards = await res.json();
  cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  cardSel.disabled = false;
});

// Media Handling
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

// Captures
document.getElementById('captureBtn').addEventListener('click', () => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => addToGallery(url, 'image'));
});

document.getElementById('partialBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: "start-selection" });
});

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === "capture-partial") {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = req.area.w; canvas.height = req.area.h;
        canvas.getContext('2d').drawImage(img, req.area.x, req.area.y, req.area.w, req.area.h, 0, 0, req.area.w, req.area.h);
        addToGallery(canvas.toDataURL(), 'image');
      };
      img.src = url;
    });
  }
});

// Video
document.getElementById('recordBtn').addEventListener('click', async () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    document.getElementById('recordBtn').innerText = "🎥 Record";
    return;
  }
  const streamId = await new Promise(r => chrome.desktopCapture.chooseDesktopMedia(["tab"], r));
  const stream = await navigator.mediaDevices.getUserMedia({ 
    video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } } 
  });
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => {
    const reader = new FileReader();
    reader.onloadend = () => addToGallery(reader.result, 'video');
    reader.readAsDataURL(new Blob(recordedChunks, { type: 'video/webm' }));
    recordedChunks = [];
    stream.getTracks().forEach(t => t.stop());
  };
  mediaRecorder.start();
  document.getElementById('recordBtn').innerText = "⏹️ Stop";
});

// Submission
document.getElementById('submitBtn').addEventListener('click', async () => {
  const desc = document.getElementById('description').value;
  const prio = document.getElementById('prioritySelect').value;
  if (!desc.toLowerCase().startsWith("bug")) return alert("Must start with 'Bug [number]'");
  
  document.getElementById('loader').style.display = 'block';
  document.getElementById('submitBtn').disabled = true;

  try {
    await fetch(`${NETLIFY_BASE}/trello-webhook`, {
      method: 'POST',
      body: JSON.stringify({
        isExtension: true,
        attachments: capturedMedia.map(m => m.data),
        action: { data: { text: `[${prio}] ${desc}`, card: { id: cardSel.value } } }
      })
    });
    alert("Report Submitted!");
    location.reload();
  } catch (e) { alert("Submission failed"); }
  finally { 
    document.getElementById('loader').style.display = 'none';
    document.getElementById('submitBtn').disabled = false;
  }
});

init();