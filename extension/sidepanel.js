const SUPABASE_URL = "https://qmwfucazmkolvyntjkfs.supabase.co";
const SUPABASE_KEY = "sb_publishable_w2Qm3nwHG4ighQ0PEl8R-g_dndzvz0W";
const NETLIFY_BASE = "https://workspaceautomation.netlify.app/.netlify/functions";

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Elements
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
let isSignUp = false;
let fullCardList = []; 

// --- AUTH ---
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
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = isSignUp 
        ? await _supabase.auth.signUp({ email, password }) 
        : await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else if (data.user) checkSession();
});

document.getElementById('toggleAuth').addEventListener('click', () => {
    isSignUp = !isSignUp;
    document.getElementById('authTitle').innerText = isSignUp ? "Create Account" : "Sign In";
    document.getElementById('authBtn').innerText = isSignUp ? "Sign Up" : "Sign In";
});

// --- TRELLO ---
async function initTrello() {
    try {
        const res = await fetch(`${NETLIFY_BASE}/manage-webhooks`);
        const boards = await res.json();
        boardSel.innerHTML = '<option value="">Select Board...</option>' + 
            boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    } catch (e) { boardSel.innerHTML = '<option>Error loading boards</option>'; }
}

boardSel.addEventListener('change', async () => {
    if (!boardSel.value) return;
    cardSel.innerHTML = '<option>Loading...</option>';
    const res = await fetch(`${NETLIFY_BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
    fullCardList = await res.json();
    populateCards(fullCardList);
    cardSearch.disabled = false;
    cardSel.disabled = false;
});

function populateCards(cards) {
    cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

cardSearch.addEventListener('input', () => {
    const query = cardSearch.value.toLowerCase();
    populateCards(fullCardList.filter(c => c.name.toLowerCase().includes(query)));
});

// --- CAPTURE ---
document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
        if (url) {
            capturedMedia.push({ id: Date.now(), data: url, type: 'image' });
            renderGallery();
        }
    });
});

function renderGallery() {
    gallery.innerHTML = '';
    capturedMedia.forEach(item => {
        const wrap = document.createElement('div');
        wrap.className = 'thumb-wrap';
        const img = document.createElement('img');
        img.src = item.data;
        const del = document.createElement('div');
        del.className = 'del-btn'; del.innerHTML = '&times;';
        del.onclick = () => { 
            capturedMedia = capturedMedia.filter(m => m.id !== item.id); 
            renderGallery(); 
        };
        wrap.appendChild(img); wrap.appendChild(del); gallery.appendChild(wrap);
    });
}

// --- SUBMIT ---
submitBtn.addEventListener('click', async () => {
    const titleVal = titleInput.value.trim();
    const descVal = descInput.value.trim();
    const priority = document.getElementById('prioritySelect').value;

    if (!cardSel.value) return alert("Select a card.");
    if (!titleVal || !descVal) return alert("Title and Description are mandatory.");
    if (!/^bug\s*\d+/i.test(titleVal)) return alert("Title must start with 'Bug [number]'");

    loader.style.display = 'block';
    submitBtn.disabled = true;

    const { data: { session } } = await _supabase.auth.getSession();
    
    // SIMPLE PAYLOAD
    const payload = {
        isExtension: true,
        bugTitle: `[${priority}] ${titleVal}`,  // Goes to Checklist
        bugDescription: descVal,               // Goes to Comment
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
            alert("✅ Reported!");
            location.reload();
        } else {
            const err = await res.text();
            alert("Error: " + err);
        }
    } catch (e) { alert("Network Error: " + e.message); }
    finally { loader.style.display = 'none'; submitBtn.disabled = false; }
});

checkSession();