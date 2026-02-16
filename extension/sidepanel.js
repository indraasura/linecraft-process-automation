const SUPABASE_URL = "https://qmwfucazmkolvyntjkfs.supabase.co";
const SUPABASE_KEY = "sb_publishable_w2Qm3nwHG4ighQ0PEl8R-g_dndzvz0W";
const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DOM ELEMENTS ---
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const boardSel = document.getElementById('boardSelect');
const cardSearch = document.getElementById('cardSearch');
const cardSel = document.getElementById('cardSelect');
const gallery = document.getElementById('gallery');
const submitBtn = document.getElementById('submitBtn');
const loader = document.getElementById('loader');
const titleInput = document.getElementById('bugTitle');
const descInput = document.getElementById('description');
const captureBtn = document.getElementById('captureBtn');
const recordBtn = document.getElementById('recordBtn');

const tabReport = document.getElementById('tabReport');
const tabLeaderboard = document.getElementById('tabLeaderboard');
const viewReport = document.getElementById('viewReport');
const viewLeaderboard = document.getElementById('viewLeaderboard');
const leaderboardList = document.getElementById('leaderboardList');
const toggleLeague = document.getElementById('toggleLeague');
const badgesGrid = document.getElementById('badgesGrid');
const myScoreDisplay = document.getElementById('myScoreDisplay');
const myBugCount = document.getElementById('myBugCount');

// Editor Elements
const imageEditor = document.getElementById('imageEditor');
const canvas = document.getElementById('screenshotCanvas');
const ctx = canvas.getContext('2d');
const toolBtns = document.querySelectorAll('.editor-btn[id^="tool"]');
const btnSaveEdit = document.getElementById('btnSaveEdit');
const btnCancelEdit = document.getElementById('btnCancelEdit');

// --- STATE ---
let capturedMedia = [];
let mediaRecorder;
let recordedChunks = [];
let isSignUp = false;
let fullCardList = [];
let currentUserEmail = "";

// Editor State
let currentTool = 'crop'; // 'crop', 'highlight', 'text'
let isDrawing = false;
let startX, startY;
let savedCanvasState = null;


// ==========================================
// 1. AUTH & TRELLO INIT (Unchanged)
// ==========================================
async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUserEmail = session.user.email;
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        document.getElementById('userDisplay').innerText = currentUserEmail;
        initTrello();
        initGamification();
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
}

document.getElementById('authBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return alert("Please fill in both fields.");
    if (!email.toLowerCase().endsWith('@linecraft.ai')) return alert("Access Denied: Only @linecraft.ai allowed.");

    const { data, error } = isSignUp ? await _supabase.auth.signUp({ email, password }) : await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else if (data.user) { if (isSignUp) alert("Account created! Logging you in..."); checkSession(); }
});

document.getElementById('toggleAuth').addEventListener('click', () => {
    isSignUp = !isSignUp;
    document.getElementById('authTitle').innerText = isSignUp ? "Create Account" : "Sign In";
    document.getElementById('authBtn').innerText = isSignUp ? "Sign Up" : "Sign In";
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await _supabase.auth.signOut();
    location.reload();
});

async function initTrello() {
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
        const boards = await res.json();
        boardSel.innerHTML = '<option value="">Select Board...</option>' + boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    } catch (e) { boardSel.innerHTML = '<option>Error loading boards</option>'; }
}

boardSel.addEventListener('change', async () => {
    if (!boardSel.value) { cardSel.disabled = true; cardSearch.disabled = true; return; }
    cardSel.innerHTML = '<option>Loading...</option>';
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
        fullCardList = await res.json();
        populateCards(fullCardList);
        cardSearch.disabled = false;
        cardSel.disabled = false;
        cardSearch.value = "";
    } catch (e) { cardSel.innerHTML = '<option>Error loading cards</option>'; }
});

function populateCards(cards) {
    if (cards.length === 0) { cardSel.innerHTML = '<option value="">No cards found</option>'; return; }
    cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

cardSearch.addEventListener('input', () => {
    const query = cardSearch.value.toLowerCase();
    populateCards(fullCardList.filter(c => c.name.toLowerCase().includes(query)));
});


// ==========================================
// 2. MEDIA CAPTURE & IMAGE EDITOR
// ==========================================

// Map mouse position to real canvas coordinates (handles CSS scaling)
function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// Open the Image Editor
captureBtn.addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
        if (chrome.runtime.lastError) return alert("Capture Failed: " + chrome.runtime.lastError.message);
        if (url) {
            imageEditor.classList.remove('hidden');
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            };
            img.src = url;
        }
    });
});

// Editor Toolbar
toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        toolBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentTool = e.target.id.replace('tool', '').toLowerCase();
    });
});

// Canvas Interactions
canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const { x, y } = getCoords(e);
    startX = x; startY = y;

    // Save state before drawing so we can render live previews (like crop box)
    savedCanvasState = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (currentTool === 'highlight') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);

    if (currentTool === 'crop') {
        ctx.putImageData(savedCanvasState, 0, 0); // Restore original
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height); // Darken all
        ctx.clearRect(startX, startY, x - startX, y - startY); // Reveal selection
        ctx.strokeStyle = '#0079bf';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, x - startX, y - startY); // Draw border
    }
    else if (currentTool === 'highlight') {
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255, 235, 59, 0.4)'; // Yellow highlighter
        ctx.lineWidth = 30; // Thick stroke
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const { x, y } = getCoords(e);

    if (currentTool === 'crop') {
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        if (width > 20 && height > 20) {
            // Apply Crop
            ctx.putImageData(savedCanvasState, 0, 0); // Remove dark overlay
            const cropX = Math.min(startX, x);
            const cropY = Math.min(startY, y);
            const croppedImg = ctx.getImageData(cropX, cropY, width, height);

            canvas.width = width;
            canvas.height = height;
            ctx.putImageData(croppedImg, 0, 0);
        } else {
            // Clicked without dragging, cancel crop preview
            ctx.putImageData(savedCanvasState, 0, 0);
        }
    }
    else if (currentTool === 'text') {
        const text = prompt("Enter text to add:");
        if (text) {
            ctx.putImageData(savedCanvasState, 0, 0);
            ctx.font = "bold 40px Arial";
            ctx.fillStyle = "#ff0000";
            ctx.shadowColor = "white"; // Outline for readability
            ctx.shadowBlur = 5;
            ctx.fillText(text, startX, startY);
            ctx.shadowBlur = 0; // reset
        }
    }
});

// Save or Cancel Edits
btnSaveEdit.addEventListener('click', () => {
    capturedMedia.push({ id: Date.now(), data: canvas.toDataURL('image/png'), type: 'image' });
    renderGallery();
    imageEditor.classList.add('hidden');
});

btnCancelEdit.addEventListener('click', () => {
    imageEditor.classList.add('hidden');
});


// ==========================================
// 3. VIDEO RECORDING (Unchanged)
// ==========================================
recordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") { mediaRecorder.stop(); return; }
    try {
        const streamId = await new Promise((resolve, reject) => {
            chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], (id) => {
                if (!id) reject(new Error("Cancelled")); else resolve(id);
            });
        });
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } }
        });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                capturedMedia.push({ id: Date.now(), data: reader.result, type: 'video' });
                renderGallery();
            };
            reader.readAsDataURL(blob);
            recordedChunks = [];
            stream.getTracks().forEach(track => track.stop());
            recordBtn.innerText = "🎥 Record";
        };
        stream.getVideoTracks()[0].onended = () => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); };
        mediaRecorder.start();
        recordBtn.innerText = "⏹ Stop";
    } catch (err) { if (err.message !== "Cancelled") alert("Recording Error: " + err.message); }
});

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


// ==========================================
// 4. SUBMISSION (Unchanged)
// ==========================================
submitBtn.addEventListener('click', async () => {
    const titleVal = titleInput.value.trim();
    const descVal = descInput.value.trim();
    const priority = document.getElementById('prioritySelect').value;

    if (!cardSel.value) return alert("Please select a Trello card.");
    if (!titleVal || !descVal) return alert("Title and Description are mandatory.");
    if (!/^bug\s*\d+/i.test(titleVal)) return alert("Title must start with 'Bug [number]'");

    loader.style.display = 'block'; submitBtn.disabled = true;
    const { data: { session } } = await _supabase.auth.getSession();

    const payload = { isExtension: true, bugTitle: `[${priority}] ${titleVal}`, bugDescription: descVal, cardId: cardSel.value, attachments: capturedMedia.map(m => m.data) };

    try {
        const res = await fetch(`${NETLIFY_BASE}/trello-webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify(payload)
        });
        if (res.ok) {
            await _supabase.from('bug_reports').insert([{ user_id: session.user.id, user_email: session.user.email, trello_card_id: cardSel.value, priority: priority, description: titleVal, attachment_count: capturedMedia.length }]);
            alert("✅ Reported! +Points added."); location.reload();
        } else alert("Submission Error: " + await res.text());
    } catch (e) { alert("Network Error: " + e.message); }
    finally { loader.style.display = 'none'; submitBtn.disabled = false; }
});


// ==========================================
// 5. GAMIFICATION (Unchanged)
// ==========================================
function initGamification() { loadUserStats(); fetchLeaderboard('monthly'); }

tabReport.addEventListener('click', () => { viewReport.classList.remove('hidden'); viewLeaderboard.classList.add('hidden'); tabReport.classList.add('active'); tabLeaderboard.classList.remove('active'); });
tabLeaderboard.addEventListener('click', () => { viewReport.classList.add('hidden'); viewLeaderboard.classList.remove('hidden'); tabLeaderboard.classList.add('active'); tabReport.classList.remove('active'); fetchLeaderboard(toggleLeague.checked ? 'all_time' : 'monthly'); });
toggleLeague.addEventListener('change', (e) => fetchLeaderboard(e.target.checked ? 'all_time' : 'monthly'));

async function fetchLeaderboard(mode) {
    leaderboardList.innerHTML = '<div style="padding:20px; text-align:center; color:#6b778c;">Loading...</div>';
    const table = mode === 'monthly' ? 'view_monthly_league' : 'view_hall_of_fame';
    const { data, error } = await _supabase.from(table).select('*').order('score', { ascending: false }).limit(10);
    if (error) return leaderboardList.innerHTML = '<div style="color:red; text-align:center;">Failed to load.</div>';
    if (!data || data.length === 0) return leaderboardList.innerHTML = '<div style="padding:20px; text-align:center; color:#6b778c;">No bugs reported yet!</div>';

    leaderboardList.innerHTML = data.map((u, i) => {
        const isMe = u.user_email === currentUserEmail;
        const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        return `<div class="leader-row ${isMe ? 'highlight-me' :