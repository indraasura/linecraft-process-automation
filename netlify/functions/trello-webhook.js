const fetch = require("node-fetch");
const FormData = require("form-data");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

/**
 * Uploads a base64 image as an attachment to a Trello card.
 */
async function uploadAttachment(cardId, base64Image, description) {
  try {
    // Remove header from base64 string and convert to buffer
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    const form = new FormData();
    form.append("file", buffer, { 
      filename: "bug-screenshot.png", 
      contentType: "image/png" 
    });
    form.append("name", `Reported Attachment: ${new Date().toISOString()}`);

    const res = await fetch(
      `https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        body: form,
        headers: form.getHeaders()
      }
    );
    return await res.json();
  } catch (err) {
    console.error("Critical: Attachment upload failed:", err);
    return null;
  }
}

// Trello API Helpers
async function getChecklists(cardId) {
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
  return res.json();
}

async function createChecklist(cardId, name) {
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return res.json();
}

async function addChecklistItem(checklistId, text) {
  const res = await fetch(`https://api.trello.com/1/checklists/${checklistId}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: text })
  });
  return res.json();
}

async function getChecklistItems(checklistId) {
  const res = await fetch(`https://api.trello.com/1/checklists/${checklistId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
  return res.json();
}

exports.handler = async (event) => {
  try {
    // Webhook validation for Trello
    if (event.httpMethod === "HEAD") return { statusCode: 200 };
    if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

    const body = JSON.parse(event.body);
    const action = body.action;

    // Ensure we are dealing with a comment action
    if (!action || action.type !== "commentCard") {
      return { statusCode: 200, body: "Not a commentCard action" };
    }

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // 1️⃣ Handle Extension Media (if present in the payload)
    if (action.data.attachment) {
      await uploadAttachment(cardId, action.data.attachment, commentText);
    }

    // 2️⃣ Match comments starting with "Bug <number>"
    const bugMatch = commentText.match(/^\s*bug\s*(\d+)/i);
    if (!bugMatch) {
      return { statusCode: 200, body: "Comment does not match Bug pattern" };
    }

    const bugNumber = bugMatch[1];

    // 3️⃣ Manage Checklist: Get, Create, or Update
    let checklists = await getChecklists(cardId);
    let bugChecklist = checklists.find((c) => c.name === BUG_CHECKLIST_NAME);

    if (!bugChecklist) {
      bugChecklist = await createChecklist(cardId, BUG_CHECKLIST_NAME);
    }

    // 4️⃣ Deduplication Check
    const checklistData = await getChecklistItems(bugChecklist.id);
    const existing = checklistData.checkItems.find((item) =>
      new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(item.name)
    );

    if (existing) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: `Bug ${bugNumber} already exists` })
      };
    }

    // 5️⃣ Add item to checklist
    const addedItem = await addChecklistItem(bugChecklist.id, commentText);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        bugNumber,
        item: addedItem
      }, null, 2)
    };
  } catch (err) {
    console.error("Webhook processing error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};