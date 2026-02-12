const SUPABASE_URL = "https://qmwfucazmkolvyntjkfs.supabase.co";
const SUPABASE_KEY = "sb_publishable_w2Qm3nwHG4ighQ0PEl8R-g_dndzvz0W";
const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
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

// State
let capturedMedia = []; 
let mediaRecorder;
let recordedChunks = [];
let isSignUp = false;
let fullCardList = []; 

// --- 1. AUTHENTICATION & RESTRICTION ---
async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        document.getElementById('userDisplay').innerText = session.user.email;
        initTrello();
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
}

document.getElementById('authBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    if (!email || !password) return alert("Please fill in both fields.");

    // 🔒 DOMAIN LOCK: Only allow Linecraft emails
    if (!email.toLowerCase().endsWith('@linecraft.ai')) {
        return alert("Access Denied: Only @linecraft.ai email addresses are allowed.");
    }

    const { data, error } = isSignUp 
        ? await _supabase.auth.signUp({ email, password }) 
        : await _supabase.auth.signInWithPassword({ email, password });
    
    if (error) alert(error.message);
    else if (data.user) {
        if (isSignUp) alert("Account created! Logging you in...");
        checkSession();
    }
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

// --- 2. TRELLO INTEGRATION ---
async function initTrello() {
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
        const boards = await res.json();
        boardSel.innerHTML = '<option value="">Select Board...</option>' + 
            boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    } catch (e) { boardSel.innerHTML = '<option>Error loading boards</option>'; }
}

boardSel.addEventListener('change', async () => {
    if (!boardSel.value) {
        cardSel.disabled = true;
        cardSearch.disabled = true;
        return;
    }
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
    if (cards.length === 0) {
        cardSel.innerHTML = '<option value="">No cards found</option>';
        return;
    }
    cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

cardSearch.addEventListener('input', () => {
    const query = cardSearch.value.toLowerCase();
    populateCards(fullCardList.filter(c => c.name.toLowerCase().includes(query)));
});

// --- 3. SCREENSHOT CAPTURE ---
captureBtn.addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
        if (chrome.runtime.lastError) {
            return alert("Capture Failed: " + chrome.runtime.lastError.message);
        }
        if (url) {
            capturedMedia.push({ id: Date.now(), data: url, type: 'image' });
            renderGallery();
        }
    });
});

// --- 4. VIDEO RECORDING ---
recordBtn.addEventListener('click', async () => {
    // STOP Logic
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }

    // START Logic
    try {
        const streamId = await new Promise((resolve, reject) => {
            chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], (id) => {
                if (!id) reject(new Error("Cancelled by user"));
                else resolve(id);
            });
        });

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
        
        // Collect Data
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        // Save on Stop
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                capturedMedia.push({ id: Date.now(), data: reader.result, type: 'video' });
                renderGallery();
            };
            reader.readAsDataURL(blob);
            
            // Cleanup
            recordedChunks = [];
            stream.getTracks().forEach(track => track.stop()); // Kills the "Sharing" bar
            recordBtn.innerText = "🎥 Record";
        };

        // Handle "Stop Sharing" from Chrome UI
        stream.getVideoTracks()[0].onended = () => {
            if (mediaRecorder.state === "recording") mediaRecorder.stop();
        };

        mediaRecorder.start();
        recordBtn.innerText = "⏹ Stop";

    } catch (err) {
        console.error(err);
        if (err.message !== "Cancelled by user") {
            alert("Recording Error: " + err.message);
        }
    }
});

// --- 5. GALLERY RENDER ---
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

// --- 6. SUBMISSION ---
submitBtn.addEventListener('click', async () => {
    const titleVal = titleInput.value.trim();
    const descVal = descInput.value.trim();
    const priority = document.getElementById('prioritySelect').value;

    if (!cardSel.value) return alert("Please select a Trello card.");
    if (!titleVal || !descVal) return alert("Title and Description are mandatory.");
    if (!/^bug\s*\d+/i.test(titleVal)) return alert("Title must start with 'Bug [number]'");

    loader.style.display = 'block';
    submitBtn.disabled = true;

    const { data: { session } } = await _supabase.auth.getSession();
    
    const payload = {
        isExtension: true,
        bugTitle: `[${priority}] ${titleVal}`, 
        bugDescription: descVal,              
        cardId: cardSel.value,
        attachments: capturedMedia.map(m => m.data)
    };

    try {
        const res = await fetch(`${NETLIFY_BASE}/trello-webhook`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            alert("✅ Bug Reported!");
            location.reload(); // Reset form
        } else {
            const err = await res.text();
            alert("Submission Error: " + err);
        }
    } catch (e) { alert("Network Error: " + e.message); }
    finally { loader.style.display = 'none'; submitBtn.disabled = false; }
});

// Start App
checkSession();