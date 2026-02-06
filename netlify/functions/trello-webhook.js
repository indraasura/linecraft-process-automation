const fetch = require("node-fetch");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs reported";

// Get checklists for a card
async function getChecklists(cardId) {
  const res = await fetch(
    `https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
  );
  return res.json();
}

// Create a checklist
async function createChecklist(cardId, name) {
  const res = await fetch(
    `https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }
  );
  return res.json();
}

// Add item to checklist
async function addChecklistItem(checklistId, text) {
  const res = await fetch(
    `https://api.trello.com/1/checklists/${checklistId}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: text })
    }
  );
  return res.json();
}

exports.handler = async (event) => {
  try {
    // HEAD request for Trello validation
    if (event.httpMethod === "HEAD") return { statusCode: 200 };

    if (event.httpMethod !== "POST") return { statusCode: 200, body: "OK" };

    const body = JSON.parse(event.body);
    const action = body.action;

    if (!action || action.type !== "commentCard") {
      return { statusCode: 200, body: "Not a commentCard action" };
    }

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // Robust regex: matches "Bug1", "Bug 1", "Bug 1:", etc.
    const bugRegex = /^Bug\s*\d+/i;
    if (!bugRegex.test(commentText)) {
      return { statusCode: 200, body: "Comment does not match Bug pattern" };
    }

    // Get or create Bugs reported checklist
    let checklists = await getChecklists(cardId);
    let bugChecklist = checklists.find((c) => c.name === BUG_CHECKLIST_NAME);

    if (!bugChecklist) {
      const created = await createChecklist(cardId, BUG_CHECKLIST_NAME);
      bugChecklist = created;
    }

    // Add comment as a new checklist item
    const addedItem = await addChecklistItem(bugChecklist.id, commentText);

    // Return detailed info for UI
    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          message: "Bug added to checklist",
          comment: commentText,
          checklistId: bugChecklist.id,
          checklistName: bugChecklist.name,
          item: addedItem
        },
        null,
        2
      )
    };
  } catch (err) {
    console.error("Trello webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};