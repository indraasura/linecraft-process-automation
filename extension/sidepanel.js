const SUPABASE_URL = "https://qmwfucazmkolvyntjkfs.supabase.co";
const SUPABASE_KEY = "sb_publishable_w2Qm3nwHG4ighQ0PEl8R-g_dndzvz0W";
const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

let capturedMedia = []; 
let mediaRecorder;
let recordedChunks = [];
let isSignUp = false;
let fullCardList = []; 

// --- AUTH LOGIC ---
async function checkSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) showApp(session.user);
    else showAuth();
}

function showApp(user) {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    document.getElementById('userDisplay').innerText = user.email;
    initTrello();
}

function showAuth() {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
}

document.getElementById('toggleAuth').addEventListener('click', () => {
    isSignUp = !isSignUp;
    document.getElementById('authTitle').innerText = isSignUp ? "Create Account" : "Sign In";
    document.getElementById('authBtn').innerText = isSignUp ? "Sign Up" : "Sign In";
});

document.getElementById('authBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) return alert("Please fill in both fields.");
    
    const { data, error } = isSignUp 
        ? await _supabase.auth.signUp({ email, password }) 
        : await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else if (data.user) showApp(data.user);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await _supabase.auth.signOut();
    location.reload();
});

// --- TRELLO & SEARCH LOGIC ---
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
    cardSel.disabled = true;
    cardSearch.disabled = true;
    cardSel.innerHTML = '<option>Loading...</option>';
    
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
        fullCardList = await res.json();
        populateCards(fullCardList);
        cardSel.disabled = false;
        cardSearch.disabled = false;
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
    const filtered = fullCardList.filter(card => card.name.toLowerCase().includes(query));
    populateCards(filtered);
});

// --- CAPTURE LOGIC ---
document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => { if (url) addToGallery(url, 'image'); });
});

document.getElementById('recordBtn').addEventListener('click', async () => {
    const btn = document.getElementById('recordBtn');
    if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
        btn.innerText = "🎥 Record";
        return;
    }
    const streamId = await new Promise(r => chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], r));
    if (!streamId) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } } });
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
    btn.innerText = "⏹ Stop";
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

// --- SECURE SUBMISSION LOGIC ---
submitBtn.addEventListener('click', async () => {
    const titleVal = titleInput.value.trim();
    const descVal = descInput.value.trim();
    const priority = document.getElementById('prioritySelect').value;

    // MANDATORY FIELD VALIDATION
    if (!cardSel.value) return alert("Please select a Trello card.");
    if (!titleVal || !descVal) return alert("Both Title and Description are mandatory.");
    
    // STRICT "Bug [number]" VALIDATION
    const titleRegex = /^bug\s*\d+/i;
    if (!titleRegex.test(titleVal)) return alert("Bug Title MUST start with 'Bug [number]' (e.g. Bug 123)");
    if (!titleRegex.test(descVal)) return alert("Bug Description MUST start with 'Bug [number]' (e.g. Bug 123)");

    loader.style.display = 'block';
    submitBtn.disabled = true;

    const { data: { session } } = await _supabase.auth.getSession();
    
    // 🚀 FLAT PAYLOAD: Bypasses legacy nested logic completely
    const payload = {
        isExtension: true,
        attachments: capturedMedia.map(m => m.data),
        extTitle: `[${priority}] ${titleVal}`, 
        extDescription: descVal,              
        extCardId: cardSel.value
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
            alert("✅ Reported Successfully!");
            await _supabase.from('bug_reports').insert([{ 
                user_id: session.user.id, 
                user_email: session.user.email, 
                trello_card_id: cardSel.value, 
                priority: priority, 
                description: titleVal, 
                attachment_count: capturedMedia.length 
            }]);
            location.reload();
        } else {
            const errorMsg = await res.text();
            alert("Submission Error: " + errorMsg);
        }
    } catch (err) { alert("Network Error: " + err.message); }
    finally { loader.style.display = 'none'; submitBtn.disabled = false; }
});

checkSession();