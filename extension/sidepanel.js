// sidepanel.js
let capturedImages = [];

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