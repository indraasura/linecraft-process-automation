const fetch = require("node-fetch");

const BOARDS = [
  "64abdd627fd032c5d7ba02c5", // Replace with your real Trello board IDs
  // Add other board IDs here
];

exports.handler = async (event) => {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  const callbackURL =
    "https://workspaceautomation.netlify.app/.netlify/functions/trello-webhook";

  try {
    if (event.httpMethod === "GET") {
      const res = await fetch(
        `https://api.trello.com/1/tokens/${token}/webhooks?key=${key}`
      );
      const data = await res.json();
      return { statusCode: 200, body: JSON.stringify(data, null, 2) };
    }

    if (event.httpMethod === "POST") {
      const results = [];

      for (const boardId of BOARDS) {
        const res = await fetch(
          `https://api.trello.com/1/webhooks/?key=${key}&token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              callbackURL,
              idModel: boardId
            })
          }
        );

        const text = await res.text();

        results.push({
          boardId,
          status: res.status,
          response: text
        });
      }

      return { statusCode: 200, body: JSON.stringify(results, null, 2) };
    }

    return { statusCode: 405, body: "Method not allowed" };
  } catch (err) {
    console.error("Manage webhook error:", err);
    return { statusCode: 500, body: err.message };
  }
};
