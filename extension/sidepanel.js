const BASE = "https://workspaceautomation.netlify.app/.netlify/functions";
const boardSel = document.getElementById('boardSelect');
const cardSel = document.getElementById('cardSelect');

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
    document.getElementById('preview').src = url;
    document.getElementById('preview').style.display = 'block';
  });
});

document.getElementById('submitBtn').addEventListener('click', async () => {
  const desc = document.getElementById('description').value;
  if (!desc.toLowerCase().startsWith("bug")) return alert("Must start with 'Bug [number]'");

  document.getElementById('loader').style.display = 'block';
  await fetch(`${BASE}/trello-webhook`, {
    method: 'POST',
    body: JSON.stringify({
      action: {
        data: {
          text: desc,
          card: { id: cardSel.value },
          attachment: document.getElementById('preview').src
        }
      }
    })
  });
  alert("Success!");
  location.reload();
});

load();