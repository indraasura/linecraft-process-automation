const fetch = require("node-fetch");
const FormData = require("form-data");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

/**
 * Uploads an array of base64 media (images or videos) to Trello.
 * Returns the hosted URLs for inclusion in the comment.
 */
async function uploadMedia(cardId, mediaArray) {
  const urls = [];
  for (const [index, data] of mediaArray.entries()) {
    try {
      const isVideo = data.includes("video/webm");
      const base64Data = data.split(",")[1];
      const buffer = Buffer.from(base64Data, 'base64');
      
      const form = new FormData();
      form.append("file", buffer, { 
        filename: `attachment-${index}.${isVideo ? 'webm' : 'png'}`, 
        contentType: isVideo ? 'video/webm' : 'image/png' 
      });

      const res = await fetch(
        `https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
        { method: "POST", body: form, headers: form.getHeaders() }
      );
      const result = await res.json();
      if (result.url) urls.push(result.url);
    } catch (err) {
      console.error("Media upload failed:", err);
    }
  }
  return urls;
}

/**
 * Posts a Trello comment.
 */
async function postComment(cardId, text, mediaUrls) {
  let finalBody = text;
  if (mediaUrls.length > 0) {
    finalBody += "\n\n**Attachments:**\n" + mediaUrls.join("\n");
  }

  const res = await fetch(
    `https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: finalBody })
    }
  );
  return res.json();
}

exports.handler = async (event) => {
  const headers = { 
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  try {
    const body = JSON.parse(event.body);
    const isExtension = body.isExtension === true;
    const action = body.action || { data: body.data };
    
    if (!action || !action.data) return { statusCode: 200, headers, body: "Invalid payload" };

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // 1️⃣ HANDLE EXTENSION REQUEST: Upload media and post comment
    if (isExtension) {
      const urls = await uploadMedia(cardId, body.attachments || []);
      await postComment(cardId, commentText, urls);
      // We return here; the resulting Trello Webhook "echo" will trigger Step 2 below
      return { statusCode: 200, headers, body: "Extension report processed" };
    }

    // 2️⃣ SHARED LOGIC: Checklist Automation (Triggered by comment)
    const bugMatch = commentText.match(/^\s*(\[[^\]]+\]\s*)?bug\s*(\d+)/i);
    if (!bugMatch) return { statusCode: 200, headers, body: "No bug pattern found" };

    const bugNumber = bugMatch[2];

    // Get or Create Checklist
    const resChecklists = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resChecklists.json();
    let bugList = checklists.find(c => c.name === BUG_CHECKLIST_NAME);

    if (!bugList) {
      const resNew = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
      });
      bugList = await resNew.json();
    }

    // Deduplication check
    const resItems = await fetch(`https://api.trello.com/1/checklists/${bugList.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklistData = await resItems.json();
    const exists = checklistData.checkItems.some(item => new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(item.name));

    if (exists) return { statusCode: 200, headers, body: "Bug already in checklist" };

    // Add Item
    await fetch(`https://api.trello.com/1/checklists/${bugList.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: commentText })
    });

    return { statusCode: 200, headers, body: "Checklist updated" };
  } catch (err) {
    console.error("Worker Error:", err);
    return { statusCode: 500, headers, body: err.message };
  }
};