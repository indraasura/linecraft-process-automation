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
const btnDelete = document.getElementById('btnDelete');

// --- STATE ---
let capturedMedia = []; 
let mediaRecorder;
let recordedChunks = [];
let isSignUp = false;
let fullCardList = [];
let currentUserEmail = "";

// ==========================================
// 1. AUTH & TRELLO INIT 
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
// 2. NEW: OBJECT-BASED IMAGE EDITOR
// ==========================================

let baseImage = null;       // Base screenshot pixel data
let overlays = [];          // Array of drawn shapes/text
let currentTool = 'select'; // select, crop, rect, circle, text
let activeOverlay = null;   // currently selected/dragged shape
let isDragging = false;
let startX, startY;         // Mouse start coords
let cropArea = null;        // temporary crop box data

// Update Tool UI
toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        toolBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentTool = e.target.id.replace('tool', '').toLowerCase();
        
        // Deselect object if switching tools
        if (currentTool !== 'select') {
            activeOverlay = null;
            btnDelete.style.display = 'none';
        }
        canvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
        redrawCanvas();
    });
});

// Delete selected shape
btnDelete.addEventListener('click', () => {
    if (activeOverlay) {
        overlays = overlays.filter(o => o !== activeOverlay);
        activeOverlay = null;
        btnDelete.style.display = 'none';
        redrawCanvas();
    }
});

// Convert screen mouse click to internal canvas coordinates
function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// Master Render Loop (Draws Base Image -> Then draws all shapes on top)
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw Background
    if (baseImage) ctx.putImageData(baseImage, 0, 0);

    // 2. Draw Crop Preview
    if (cropArea && currentTool === 'crop') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.clearRect(cropArea.x, cropArea.y, cropArea.w, cropArea.h);
        ctx.strokeStyle = '#0079bf';
        ctx.lineWidth = 2;
        ctx.strokeRect(cropArea.x, cropArea.y, cropArea.w, cropArea.h);
    }

    // 3. Draw Objects (Shapes/Text)
    overlays.forEach(obj => {
        ctx.save();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ff0000'; // Red highlight color
        ctx.fillStyle = '#ff0000';

        if (obj.type === 'rect') {
            ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        } 
        else if (obj.type === 'circle') {
            const radius = Math.abs(obj.w / 2);
            ctx.beginPath();
            ctx.arc(obj.x + obj.w/2, obj.y + obj.h/2, radius, 0, Math.PI * 2);
            ctx.stroke();
        } 
        else if (obj.type === 'text') {
            ctx.font = "bold 40px Arial";
            ctx.textBaseline = 'top';
            // Text shadow for readability on mixed backgrounds
            ctx.shadowColor = "white"; 
            ctx.shadowBlur = 8;
            ctx.fillText(obj.text, obj.x, obj.y);
            
            // Recalculate width for hit detection
            obj.w = ctx.measureText(obj.text).width;
            obj.h = 40; // rough font height
            ctx.shadowBlur = 0;
        }

        // Draw Selection Bounding Box
        if (obj === activeOverlay && currentTool === 'select') {
            ctx.strokeStyle = '#0079bf';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            // Give bounding box a slight padding
            ctx.strokeRect(
                Math.min(obj.x, obj.x + obj.w) - 5, 
                Math.min(obj.y, obj.y + obj.h) - 5, 
                Math.abs(obj.w) + 10, 
                Math.abs(obj.h) + 10
            );
        }
        ctx.restore();
    });
}

// Find if mouse clicked inside a shape bounding box
function getObjectAtPos(x, y) {
    // Search in reverse so top-most layers are clicked first
    for (let i = overlays.length - 1; i >= 0; i--) {
        const o = overlays[i];
        const minX = Math.min(o.x, o.x + o.w);
        const maxX = Math.max(o.x, o.x + o.w);
        const minY = Math.min(o.y, o.y + o.h);
        const maxY = Math.max(o.y, o.y + o.h);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) return o;
    }
    return null;
}

// Mouse Handlers
canvas.addEventListener('mousedown', (e) => {
    const { x, y } = getCoords(e);
    startX = x; startY = y;
    isDragging = true;

    if (currentTool === 'select') {
        activeOverlay = getObjectAtPos(x, y);
        btnDelete.style.display = activeOverlay ? 'block' : 'none';
        
        // Calculate drag offset so the shape doesn't snap to the mouse center
        if (activeOverlay) {
            activeOverlay.dragOffsetX = x - activeOverlay.x;
            activeOverlay.dragOffsetY = y - activeOverlay.y;
        }
    } 
    else if (currentTool === 'rect' || currentTool === 'circle') {
        activeOverlay = { type: currentTool, x, y, w: 0, h: 0 };
        overlays.push(activeOverlay);
        btnDelete.style.display = 'block';
    } 
    else if (currentTool === 'text') {
        const textStr = prompt("Enter text:");
        if (textStr) {
            activeOverlay = { type: 'text', text: textStr, x, y, w: 100, h: 40 };
            overlays.push(activeOverlay);
            btnDelete.style.display = 'block';
            isDragging = false; // text is placed immediately
        }
    }
    redrawCanvas();
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const { x, y } = getCoords(e);

    if (currentTool === 'select' && activeOverlay) {
        // Move object
        activeOverlay.x = x - activeOverlay.dragOffsetX;
        activeOverlay.y = y - activeOverlay.dragOffsetY;
    } 
    else if (currentTool === 'rect' || currentTool === 'circle') {
        // Resize object
        activeOverlay.w = x - startX;
        activeOverlay.h = y - startY;
    }
    else if (currentTool === 'crop') {
        // Draw Crop box
        cropArea = { 
            x: Math.min(startX, x), 
            y: Math.min(startY, y), 
            w: Math.abs(x - startX), 
            h: Math.abs(y - startY) 
        };
    }
    redrawCanvas();
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;

    if (currentTool === 'crop' && cropArea && cropArea.w > 20) {
        // Execute Crop
        const croppedImg = ctx.getImageData(cropArea.x, cropArea.y, cropArea.w, cropArea.h);
        canvas.width = cropArea.w;
        canvas.height = cropArea.h;
        baseImage = croppedImg; // Replace background with cropped version
        
        // Shift all existing overlays so they stay in the same visual place relative to crop
        overlays.forEach(o => {
            o.x -= cropArea.x;
            o.y -= cropArea.y;
        });
        
        cropArea = null; // Clear crop box
        
        // Switch back to select tool for safety
        document.getElementById('toolSelect').click();
    }
    // Cleanup accident clicks (shapes with near 0 width)
    else if (activeOverlay && (activeOverlay.type === 'rect' || activeOverlay.type === 'circle')) {
        if (Math.abs(activeOverlay.w) < 5 || Math.abs(activeOverlay.h) < 5) {
            overlays = overlays.filter(o => o !== activeOverlay);
            activeOverlay = null;
            btnDelete.style.display = 'none';
        }
    }
    redrawCanvas();
});

// OPEN EDITOR
captureBtn.addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
        if (chrome.runtime.lastError) return alert("Capture Failed: " + chrome.runtime.lastError.message);
        if (url) {
            // Reset Editor State
            overlays = [];
            activeOverlay = null;
            document.getElementById('toolSelect').click();
            btnDelete.style.display = 'none';

            imageEditor.classList.remove('hidden');
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                // Save original screenshot as pixel data
                ctx.drawImage(img, 0, 0);
                baseImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
                redrawCanvas();
            };
            img.src = url;
        }
    });
});

// SAVE/CANCEL
btnSaveEdit.addEventListener('click', () => {
    // Deselect before saving so bounding boxes aren't in the final image
    activeOverlay = null; 
    redrawCanvas();
    
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
        return `<div class="leader-row ${isMe ? 'highlight-me' : ''}"><div class="rank">${rank}</div><div class="user-info">${u.user_email.split('@')[0]} ${isMe ? '(You)' : ''}</div><div class="score"><span class="pts">${u.score} pts</span><span class="sub">${u.bugs_count} bugs</span></div></div>`;
    }).join('');
}

async function loadUserStats() {
    const { data: bugs } = await _supabase.from('bug_reports').select('*').eq('user_email', currentUserEmail);
    if (!bugs) return;

    const totalBugs = bugs.length;
    const score = bugs.reduce((acc, b) => acc + (b.priority === 'Critical' ? 10 : b.priority === 'High' ? 5 : b.priority === 'Medium' ? 3 : 1), 0);
    myScoreDisplay.innerText = `${score} pts`; myBugCount.innerText = `${totalBugs} bugs`;

    const badges = [];
    if (totalBugs >= 1) badges.push({ icon: '🐣', title: 'Newbie', desc: 'First bug reported' });
    if (totalBugs >= 10) badges.push({ icon: '🏹', title: 'Hunter', desc: '10 bugs reported' });
    if (totalBugs >= 50) badges.push({ icon: '🤖', title: 'Exterminator', desc: '50 bugs reported' });
    if (totalBugs >= 100) badges.push({ icon: '💯', title: 'Centurion', desc: '100 bugs reported' });

    const criticals = bugs.filter(b => b.priority === 'Critical').length;
    if (criticals >= 1) badges.push({ icon: '🎯', title: 'Sniper', desc: 'First Critical found' });
    if (criticals >= 5) badges.push({ icon: '🚒', title: 'Firefighter', desc: '5 Criticals found' });
    if (criticals >= 20) badges.push({ icon: '☢️', title: 'Prepper', desc: '20 Criticals found' });

    if (bugs.filter(b => { const h = new Date(b.created_at).getHours(); return h >= 0 && h < 5; }).length > 0) badges.push({ icon: '🦉', title: 'Night Owl', desc: 'Logged 12AM-5AM' });
    if (bugs.filter(b => { const d = new Date(b.created_at).getDay(); return d === 0 || d === 6; }).length > 0) badges.push({ icon: '⚔️', title: 'Warrior', desc: 'Logged on Weekend' });

    badgesGrid.innerHTML = badges.map(b => `<div class="badge" title="${b.desc}"><span class="badge-icon">${b.icon}</span></div>`).join('');
    const remaining = 10 - badges.length;
    for(let i=0; i<remaining; i++) badgesGrid.innerHTML += `<div class="badge locked"><span class="badge-icon">🔒</span></div>`;
}

checkSession();