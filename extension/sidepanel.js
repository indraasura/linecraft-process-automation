const BASE = "https://workspaceautomation.netlify.app/.netlify/functions";
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');
let capturedImages = [];

async function load() {
  const res = await fetch(`${BASE}/manage-webhooks`);
  const boards = await res.json();
  boardSel.innerHTML = '<option value="">Select Board...</option>' + 
    boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

boardSel.addEventListener('change', async () => {
  cardSel.disabled = true;
  cardSel.innerHTML = '<option>Loading...</option>';
  const res = await fetch(`${BASE}/manage-webhooks?boardId=${boardSel.value}`, { method: 'POST' });
  const cards = await res.json();
  cardSel.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  cardSel.disabled = false;
});

document.getElementById('captureBtn').addEventListener('click', () => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
    capturedImages.push(url);
    const img = document.createElement('img');
    img.src = url;
    img.style.width = "60px";
    img.style.borderRadius = "4px";
    document.getElementById('gallery').appendChild(img);
  });
});

document.getElementById('submitBtn').addEventListener('click', async () => {
  const desc = document.getElementById('description').value;
  const cardId = document.getElementById('cardSelect').value;
  
  document.getElementById('loader').style.display = 'block';

  const payload = {
    isExtension: true, // Flag to identify the source
    attachments: capturedImages,
    action: {
      data: {
        text: desc,
        card: { id: cardId }
      }
    }
  };

  await fetch("https://workspaceautomation.netlify.app/.netlify/functions/trello-webhook", {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  alert("Report Sent!");
  location.reload(); // Clears screenshots and state
});