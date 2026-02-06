const fetch = require("node-fetch");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs reported";

// Helper: Get checklists for a card
async function getChecklists(cardId) {
  const res = await fetch(
    `https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
  );
  return await res.json();
}

// Helper: Create checklist on a card
async function createChecklist(cardId, name) {
  const res = await fetch(
    `https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  return await res.json();
}

// Helper: Add item to checklist
async function addChecklistItem(checklistId, text) {
  const res = await fetch(
    `https://api.trello.com/1/checklists/${checklistId}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: text })
    }
  );
  return await res.json();
}

exports.handler = async (event) => {
  try {
    // 1️⃣ Handle Trello validation (HEAD request)
    if (event.httpMethod === "HEAD") {
      return { statusCode: 200 };
    }

    // 2️⃣ Only POST requests for Trello events
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 3️⃣ Parse Trello webhook payload safely
    const body = JSON.parse(event.body);
    const action = body.action;

    if (!action) {
      return { statusCode: 200, body: "No action" };
    }

    // Only handle comments added
    if (action.type !== "commentCard") {
      return { statusCode: 200, body: "Not a comment" };
    }

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // Check if comment starts with "Bug" followed by number
    const bugRegex = /^Bug\s*(\d+)/i;
    if (!bugRegex.test(commentText)) {
      return { statusCode: 200, body: "Comment does not match Bug pattern" };
    }

    // 4️⃣ Get or create "Bugs reported" checklist
    let checklists = await getChecklists(cardId);
    let bugChecklist = checklists.find((c) => c.name === BUG_CHECKLIST_NAME);

    if (!bugChecklist) {
      bugChecklist = await createChecklist(cardId, BUG_CHECKLIST_NAME);
    }

    // 5️⃣ Add the comment as a new checklist item
    await addChecklistItem(bugChecklist.id, commentText);

    return { statusCode: 200, body: "Bug added to checklist" };
  } catch (err) {
    console.error("Trello webhook error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};