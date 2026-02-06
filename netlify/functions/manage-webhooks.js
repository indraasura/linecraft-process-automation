const fetch = require("node-fetch");

const BOARDS = [
  "64abdd627fd032c5d7ba02c5", // Add all your board IDs
];

exports.handler = async (event) => {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  const callbackURL =
    "https://workspaceautomation.netlify.app/.netlify/functions/trello-webhook";

  try {
    // GET: list existing webhooks
    if (event.httpMethod === "GET") {
      const res = await fetch(
        `https://api.trello.com/1/tokens/${token}/webhooks?key=${key}`
      );
      const data = await res.json();
      return { statusCode: 200, body: JSON.stringify(data, null, 2) };
    }

    // POST: create webhooks for all boards (if not exists)
    if (event.httpMethod === "POST") {
      const results = [];
      const existingRes = await fetch(
        `https://api.trello.com/1/tokens/${token}/webhooks?key=${key}`
      );
      const existingWebhooks = await existingRes.json();

      for (const boardId of BOARDS) {
        const exists = existingWebhooks.some(
          (w) => w.idModel === boardId && w.callbackURL === callbackURL
        );

        if (exists) {
          results.push({
            boardId,
            status: 200,
            response: "Webhook already exists for this board"
          });
          continue;
        }

        const res = await fetch(
          `https://api.trello.com/1/webhooks/?key=${key}&token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ callbackURL, idModel: boardId })
          }
        );

        const text = await res.text();
        results.push({ boardId, status: res.status, response: text });
      }

      return { statusCode: 200, body: JSON.stringify(results, null, 2) };
    }

    // DELETE: remove webhook by id (send ?id=WEBHOOK_ID)
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) return { statusCode: 400, body: "Missing webhook ID" };

      const res = await fetch(
        `https://api.trello.com/1/webhooks/${id}?key=${key}&token=${token}`,
        { method: "DELETE" }
      );

      if (res.status === 200) {
        return { statusCode: 200, body: `Webhook ${id} deleted successfully` };
      } else {
        const text = await res.text();
        return { statusCode: res.status, body: text };
      }
    }

    return { statusCode: 405, body: "Method not allowed" };
  } catch (err) {
    console.error("Manage webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
