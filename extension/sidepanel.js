const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
const gallery = document.getElementById('gallery');
const loader = document.getElementById('loader');

let capturedMedia = []; // Array of {id, data, type}
let mediaRecorder;
let recordedChunks = [];

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
    cardSel.innerHTML = '<option>Loading cards...</option>';
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
        const cards = await res.json();
        cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        cardSel.disabled = false;
    } catch (e) { cardSel.innerHTML = '<option>Error loading cards</option>'; }
});

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
        del.className = 'del-btn'; del.innerHTML = '&times;';
        del.onclick = () => { capturedMedia = capturedMedia.filter(m => m.id !== item.id); renderGallery(); };
        wrap.appendChild(media); wrap.appendChild(del); gallery.appendChild(wrap);
    });
}

document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => { if (url) addToGallery(url, 'image'); });
});

document.getElementById('recordBtn').addEventListener('click', async () => {
    const btn = document.getElementById('recordBtn');
    if (mediaRecorder?.state === "recording") { mediaRecorder.stop(); btn.innerText = "🎥 Record Screen"; btn.classList.remove('btn-danger'); return; }

    const streamId = await new Promise(r => chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], r));
    if (!streamId) return;

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } }
    });

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
    mediaRecorder.onstop = () => {
        const reader = new FileReader();
        reader.onloadend = () => addToGallery(reader.result, 'video');
        reader.readAsDataURL(new Blob(recordedChunks, { type: 'video/webm' }));
        recordedChunks = [];
        stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    btn.innerText = "⏹️ Stop"; btn.classList.add('btn-danger');
});

document.getElementById('submitBtn').addEventListener('click', async () => {
    const desc = document.getElementById('description').value;
    const prio = document.getElementById('prioritySelect').value;
    if (!desc.toLowerCase().startsWith("bug")) return alert("Must start with 'Bug [number]'");

    loader.style.display = 'block';
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
        alert("✅ Success!"); location.reload();
    } catch (err) { alert("Error: " + err.message); }
    finally { loader.style.display = 'none'; document.getElementById('submitBtn').disabled = false; }
});

init();