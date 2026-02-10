const fetch = require("node-fetch");
const FormData = require("form-data");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

// Helper: Upload Base64 image to Trello Card
async function uploadAttachment(cardId, base64Image) {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const form = new FormData();
    form.append("file", buffer, { filename: "bug-screenshot.png", contentType: "image/png" });

    await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
      method: "POST",
      body: form,
      headers: form.getHeaders()
    });
  } catch (err) {
    console.error("Attachment upload failed:", err);
  }
}

// NEW Helper: Manually post a comment to a Trello Card
async function postComment(cardId, text) {
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
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
    
    // Determine if this is a direct call from the Extension or a Webhook from Trello
    const isExtensionRequest = body.action && body.action.data && body.action.data.attachment !== undefined;
    const action = body.action || (body.data ? { data: body.data, type: "commentCard" } : null);

    if (!action) return { statusCode: 200, headers, body: "No valid action" };

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // 1️⃣ EXTENSION-ONLY LOGIC: Post media and comment
    if (isExtensionRequest) {
      if (action.data.attachment) {
        await uploadAttachment(cardId, action.data.attachment);
      }
      // Post the actual comment to Trello (this makes it visible in the card activity)
      await postComment(cardId, commentText);
    }

    // 2️⃣ SHARED LOGIC: Match comments starting with "Bug <number>"
    const bugMatch = commentText.match(/^\s*bug\s*(\d+)/i);
    if (!bugMatch) return { statusCode: 200, headers, body: "No bug pattern" };

    const bugNumber = bugMatch[1];

    // 3️⃣ Existing Checklist Automation
    const resChecklists = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resChecklists.json();
    let bugChecklist = checklists.find(c => c.name === BUG_CHECKLIST_NAME);

    if (!bugChecklist) {
      const resNew = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
      });
      bugChecklist = await resNew.json();
    }

    // 4️⃣ Deduplication
    const resItems = await fetch(`https://api.trello.com/1/checklists/${bugChecklist.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklistData = await resItems.json();
    const existing = checklistData.checkItems.find(item => new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(item.name));

    if (existing) return { statusCode: 200, headers, body: "Bug already exists" };

    // 5️⃣ Add Item to Checklist
    await fetch(`https://api.trello.com/1/checklists/${bugChecklist.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: commentText })
    });

    return { statusCode: 200, headers, body: "Success" };
  } catch (err) {
    return { statusCode: 500, headers, body: err.message };
  }
};