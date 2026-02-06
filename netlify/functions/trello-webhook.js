const fetch = require("node-fetch");

/**
 * Boards allowed to be processed
 */
const SUPPORTED_BOARDS = [
  "w7bbkm3U",
  "neexo829",
  "VA2rVL0Q",
  "4hAcq4Yf",
  "9pCNwdKL"
];

/**
 * Bug comment format:
 * Bug123
 * Bug 123
 */
const BUG_REGEX = /^Bug\s?\d+/i;

exports.handler = async (event) => {
  /**
   * Trello sends a HEAD request when validating webhook
   */
  if (event.httpMethod === "HEAD") {
    return { statusCode: 200 };
  }

  try {
    const payload = JSON.parse(event.body);
    const action = payload.action;

    /**
     * Only process comment events
     */
    if (!action || action.type !== "commentCard") {
      return { statusCode: 200 };
    }

    const boardId = payload.model.id;

    /**
     * Ignore unsupported boards
     */
    if (!SUPPORTED_BOARDS.includes(boardId)) {
      return { statusCode: 200 };
    }

    const commentText = action.data.text;

    /**
     * Ignore comments not starting with Bug<number>
     */
    if (!BUG_REGEX.test(commentText)) {
      return { statusCode: 200 };
    }

    const cardId = action.data.card.id;
    const key = process.env.TRELLO_KEY;
    const token = process.env.TRELLO_TOKEN;

    /**
     * Get all checklists on the card
     */
    const checklistRes = await fetch(
      `https://api.trello.com/1/cards/${cardId}/checklists?key=${key}&token=${token}`
    );
    const checklists = await checklistRes.json();

    /**
     * Find or create "Bugs reported" checklist
     */
    let bugsChecklist = checklists.find(
      (cl) => cl.name === "Bugs reported"
    );

    if (!bugsChecklist) {
      const createChecklistRes = await fetch(
        `https://api.trello.com/1/cards/${cardId}/checklists?key=${key}&token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Bugs reported"
          })
        }
      );
      bugsChecklist = await createChecklistRes.json();
    }

    /**
     * Add new checklist item with full comment text
     */
    await fetch(
      `https://api.trello.com/1/checklists/${bugsChecklist.id}/checkItems?key=${key}&token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: commentText
        })
      }
    );

    return { statusCode: 200 };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500 };
  }
};