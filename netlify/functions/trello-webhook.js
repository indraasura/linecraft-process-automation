const fetch = require("node-fetch");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

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

// Get items in a checklist
async function getChecklistItems(checklistId) {
  const res = await fetch(
    `https://api.trello.com/1/checklists/${checklistId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
  );
  return res.json();
}

exports.handler = async (event) => {
  try {
    // HEAD request for Trello webhook validation
    if (event.httpMethod === "HEAD") return { statusCode: 200 };

    if (event.httpMethod !== "POST") {
      return { statusCode: 200, body: "OK" };
    }

    const body = JSON.parse(event.body);
    const action = body.action;

    if (!action || action.type !== "commentCard") {
      return { statusCode: 200, body: "Not a commentCard action" };
    }

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // Match comments starting with "Bug <number>"
    const bugMatch = commentText.match(/^\s*bug\s*(\d+)/i);
    if (!bugMatch) {
      return { statusCode: 200, body: "Comment does not match Bug pattern" };
    }

    const bugNumber = bugMatch[1];

    // 1️⃣ Get all checklists on the card
    let checklists = await getChecklists(cardId);
    let bugChecklist = checklists.find(
      (c) => c.name === BUG_CHECKLIST_NAME
    );

    // 2️⃣ Create checklist only if it does NOT exist
    if (!bugChecklist) {
      await createChecklist(cardId, BUG_CHECKLIST_NAME);

      // Refresh checklist list
      checklists = await getChecklists(cardId);
      bugChecklist = checklists.find(
        (c) => c.name === BUG_CHECKLIST_NAME
      );
    }

    if (!bugChecklist) {
      throw new Error("Failed to create or find Bugs Reported checklist");
    }

    // 3️⃣ Check if this bug number already exists in checklist
    const checklistData = await getChecklistItems(bugChecklist.id);

    const existing = checklistData.checkItems.find((item) =>
      new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(item.name)
    );

    if (existing) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Bug ${bugNumber} already exists — ignoring comment`,
          checklistId: bugChecklist.id,
          existingItem: existing.name
        })
      };
    }

    // 4️⃣ Add comment to checklist
    const addedItem = await addChecklistItem(
      bugChecklist.id,
      commentText
    );

    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          message: "Bug added to checklist",
          checklistId: bugChecklist.id,
          checklistName: bugChecklist.name,
          bugNumber,
          comment: commentText,
          item: addedItem
        },
        null,
        2
      )
    };
  } catch (err) {
    console.error("Trello webhook error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
