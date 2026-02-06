const fetch = require("node-fetch");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs reported";

// Helper: get checklists for a card
async function getChecklists(cardId) {
  const res = await fetch(
    `https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
  );const fetch = require("node-fetch");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs reported";

// Get checklists on a card
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
    // HEAD requests (Trello validation)
    if (event.httpMethod === "HEAD") {
      return { statusCode: 200 };
    }

    // Only POST requests
    if (event.httpMethod !== "POST") {
      return { statusCode: 200, body: "OK" };
    }

    const body = JSON.parse(event.body);
    const action = body.action;

    if (!action) return { statusCode: 200, body: "No action" };

    // Only handle commentCard
    if (action.type !== "commentCard") return { statusCode: 200, body: "Not a comment" };

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // Match comments starting with Bug + number
    const bugRegex = /^Bug\s*(\d+)/i;
    if (!bugRegex.test(commentText)) {
      return { statusCode: 200, body: "Comment does not match Bug pattern" };
    }

    // Get or create Bugs reported checklist
    let checklists = await getChecklists(cardId);
    let bugChecklist = checklists.find((c) => c.name === BUG_CHECKLIST_NAME);

    if (!bugChecklist) {
      bugChecklist = await createChecklist(cardId, BUG_CHECKLIST_NAME);
    }

    // Add the comment as a new checklist item
    await addChecklistItem(bugChecklist.id, commentText);

    return { statusCode: 200, body: "Bug added to checklist" };
  } catch (err) {
    console.error("Trello webhook error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};

  return await res.json();
}

// Helper: create a checklist
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

// Helper: add item to checklist
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
    // ✅ Handle Trello validation
    if (event.httpMethod === "HEAD") {
      return { statusCode: 200 };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 200, body: "OK" }; // Return 200 for anything else
    }

    const body = JSON.parse(event.body);
    const action = body.action;

    if (!action) return { statusCode: 200, body: "No action" };

    // Only handle commentCard
    if (action.type !== "commentCard") return { statusCode: 200, body: "Not a comment" };

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // Check if comment starts with Bug + number
    const bugRegex = /^Bug\s*(\d+)/i;
    if (!bugRegex.test(commentText)) {
      return { statusCode: 200, body: "Comment does not match Bug pattern" };
    }

    // Get or create Bugs reported checklist
    let checklists = await getChecklists(cardId);
    let bugChecklist = checklists.find((c) => c.name === BUG_CHECKLIST_NAME);

    if (!bugChecklist) {
      bugChecklist = await createChecklist(cardId, BUG_CHECKLIST_NAME);
    }

    await addChecklistItem(bugChecklist.id, commentText);

    return { statusCode: 200, body: "Bug added to checklist" };
  } catch (err) {
    console.error("Trello webhook error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};