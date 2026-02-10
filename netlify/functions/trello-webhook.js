const fetch = require("node-fetch");
const FormData = require("form-data");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

async function uploadMedia(cardId, mediaArray) {
  const urls = [];
  for (const [i, data] of mediaArray.entries()) {
    const isVideo = data.includes("video/webm");
    const buffer = Buffer.from(data.split(",")[1], 'base64');
    const form = new FormData();
    form.append("file", buffer, { filename: `bug-${i}.${isVideo?'webm':'png'}`, contentType: isVideo?'video/webm':'image/png' });
    const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
      method: "POST", body: form, headers: form.getHeaders()
    });
    const result = await res.json();
    if (result.url) urls.push(result.url);
  }
  return urls;
}

exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  try {
    const body = JSON.parse(event.body);
    const isExtension = body.isExtension === true;
    const action = body.action || { data: body.data };
    const commentText = action.data.text;
    const cardId = action.data.card.id;

    if (isExtension) {
      const urls = await uploadMedia(cardId, body.attachments || []);
      const finalComment = `${commentText}\n\n**Proof:**\n${urls.join("\n")}`;
      await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: finalComment })
      });
      return { statusCode: 200, headers, body: "Extension Processed" };
    }

    const match = commentText.match(/^\s*(\[[^\]]+\]\s*)?bug\s*(\d+)/i);
    if (!match) return { statusCode: 200, headers, body: "Ignore" };

    const resChecklists = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resChecklists.json();
    let list = checklists.find(c => c.name === BUG_CHECKLIST_NAME);
    if (!list) {
      list = await (await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
      })).json();
    }

    const checkRes = await fetch(`https://api.trello.com/1/checklists/${list.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checkData = await checkRes.json();
    if (checkData.checkItems.some(i => new RegExp(`\\bbug\\s*${match[2]}\\b`, "i").test(i.name))) return { statusCode: 200, headers };

    await fetch(`https://api.trello.com/1/checklists/${list.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: commentText })
    });

    return { statusCode: 200, headers, body: "Checklist Sync" };
  } catch (err) { return { statusCode: 500, headers, body: err.message }; }
};