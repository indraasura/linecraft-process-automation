// Replace with your actual deployed Netlify URL
const NETLIFY_URL = "https://your-app-name.netlify.app/.netlify/functions/trello-webhook";

/**
 * Sends the bug report to the Netlify worker.
 */
async function submitReport() {
  const cardId = document.getElementById('cardSelect').value;
  const description = document.getElementById('description').value;
  const imagePreview = document.getElementById('preview');
  const loader = document.getElementById('loader');
  const submitBtn = document.getElementById('submitBtn');

  if (!cardId || !description) {
    alert("Please select a card and enter a description starting with 'Bug [number]'");
    return;
  }

  // Visual Feedback
  loader.style.display = 'block';
  submitBtn.disabled = true;

  const payload = {
    action: {
      type: "commentCard",
      data: {
        text: description,
        card: { id: cardId },
        attachment: imagePreview.src !== "" ? imagePreview.src : null
      }
    }
  };

  try {
    const response = await fetch(NETLIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      alert(`Success! Bug added to checklist.`);
      // Reset Form
      document.getElementById('description').value = "";
      imagePreview.src = "";
      imagePreview.style.display = "none";
    } else {
      throw new Error("Failed to send report");
    }
  } catch (error) {
    console.error("Submission error:", error);
    alert("Error submitting report. Check console.");
  } finally {
    loader.style.display = 'none';
    submitBtn.disabled = false;
  }
}

// Event Listeners
document.getElementById('submitBtn').addEventListener('click', submitReport);

document.getElementById('captureBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Captures the current visible tab as a data URL
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  const preview = document.getElementById('preview');
  preview.src = dataUrl;
  preview.style.display = 'block';
});