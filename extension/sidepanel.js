/**
 * sidepanel.js - Production Version
 * Handles Supabase Auth and Trello Bug Reporting
 * Updated: 2026-02-11
 */

// --- CONFIGURATION ---
const SUPABASE_URL = "https://qmwfucazmkolvyntjkfs.supabase.co";
const SUPABASE_KEY = "sb_publishable_w2Qm3nwHG4ighQ0PEl8R-g_dndzvz0W";
const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";

// Initialize Supabase Client
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DOM ELEMENTS ---
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
const prioritySel = document.getElementById('prioritySelect');
const gallery = document.getElementById('gallery');
const submitBtn = document.getElementById('submitBtn');
const loader = document.getElementById('loader');
const descriptionInput = document.getElementById('description');
const userDisplay = document.getElementById('userDisplay');

// State Management
let capturedMedia = []; // Array of {id, data, type}
let mediaRecorder;
let recordedChunks = [];
let isSignUp = false;

// --- 1. AUTHENTICATION LOGIC ---

/**
 * Checks for an existing session on startup.
 */
async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        showApp(session.user);
    } else {
        showAuth();
    }
}

function showApp(user) {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    userDisplay.innerText = user.email;
    initTrello(); 
}

function showAuth() {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
}

// Toggle: Sign In vs Sign Up
document.getElementById('toggleAuth').addEventListener('click', () => {
    isSignUp = !isSignUp;
    document.getElementById('authTitle').innerText = isSignUp ? "Create Account" : "Sign In";
    document.getElementById('authBtn').innerText = isSignUp ? "Sign Up" : "Sign In";
    document.getElementById('toggleAuth').innerText = isSignUp ? "Have an account? Login" : "Need an account? Sign Up";
});

// Handle Login/Signup Action
document.getElementById('authBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) return alert("Please fill in all fields.");

    if (isSignUp) {
        const { error } = await _supabase.auth.signUp({ email, password });
        if (error) alert(error.message);
        else alert("Verification email sent! Please check your inbox.");
    } else {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        else showApp(data.user);
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await _supabase.auth.signOut();
    location.reload();
});

// --- 2. TRELLO CONTEXT LOGIC ---

/**
 * Loads the allowed boards from the Netlify Manager.
 */
async function initTrello() {
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
        const boards = await res.json();
        boardSel.innerHTML = '<option value="">Select Board...</option>' + 
            boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    } catch (e) { 
        boardSel.innerHTML = '<option>Error loading boards</option>'; 
    }
}

/**
 * Chained dropdown: Loads cards when a board is selected.
 */
boardSel.addEventListener('change', async () => {
    if (!boardSel.value) {
        cardSel.disabled = true;
        cardSel.innerHTML = '<option>Select board first</option>';
        return;
    }
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

// --- 3. EVIDENCE CAPTURE & GALLERY ---

/**
 * Captures the current active tab as an image.
 */
document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
        if (url) addToGallery(url, 'image');
    });
});

/**
 * Captures the entire screen as a video.
 */
document.getElementById('recordBtn').addEventListener('click', async () => {
    const btn = document.getElementById('recordBtn');
    if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
        btn.innerText = "🎥 Record Screen";
        btn.classList.remove('btn-danger');
        return;
    }
    
    // Choose desktop media (Full Screen / Window)
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
    btn.innerText = "⏹️ Stop Recording";
    btn.classList.add('btn-danger');
});

function addToGallery(dataUrl, type) {
    const id = Date.now();
    capturedMedia.push({ id, data: dataUrl, type });
    renderGallery();
}

/**
 * Renders the evidence gallery with deletion capability.
 */
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

// --- 4. SECURE REPORT SUBMISSION ---

submitBtn.addEventListener('click', async () => {
    const desc = descriptionInput.value;
    const priority = prioritySel.value;
    const cardId = cardSel.value;

    // Validation
    if (!cardId) return alert("Please select a target card.");
    if (!desc.toLowerCase().startsWith("bug")) return alert("Description must start with 'Bug [number]'");
    
    loader.style.display = 'block';
    submitBtn.disabled = true;

    // 🔐 Secure Token Retrieval
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        alert("Session expired. Please log in again.");
        location.reload();
        return;
    }
    const token = session.access_token;

    try {
        const res = await fetch(`${NETLIFY_BASE}/trello-webhook`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Pass JWT for Netlify verification
            },
            body: JSON.stringify({
                isExtension: true,
                attachments: capturedMedia.map(m => m.data),
                action: { data: { text: `[${priority}] ${desc}`, card: { id: cardId } } }
            })
        });

        if (res.ok) {
            alert("✅ Bug Reported Successfully!");
            // Log to Supabase for User Audit Trail
            await _supabase.from('bug_reports').insert([
                { 
                    user_id: session.user.id, 
                    user_email: session.user.email,
                    trello_card_id: cardId,
                    priority: priority,
                    description: desc,
                    attachment_count: capturedMedia.length
                }
            ]);
            location.reload(); // Reset state
        } else {
            const errorText = await res.text();
            alert("Submission failed: " + errorText);
        }
    } catch (err) { 
        alert("Network Error: " + err.message); 
    } finally { 
        loader.style.display = 'none'; 
        submitBtn.disabled = false; 
    }
});

// Bootstrap application state
checkSession();