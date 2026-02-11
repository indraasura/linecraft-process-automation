const fetch = require("node-fetch");
const FormData = require("form-data");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

async function uploadMedia(cardId, mediaArray) {
  const urls = [];
  for (const [i, data] of mediaArray.entries()) {
    try {
      const isVideo = data.includes("video/webm");
      const buffer = Buffer.from(data.split(",")[1], 'base64');
      const form = new FormData();
      form.append("file", buffer, { filename: `bug-${i+1}.${isVideo ? 'webm' : 'png'}`, contentType: isVideo ? 'video/webm' : 'image/png' });
      const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", body: form, headers: form.getHeaders()
      });
      const result = await res.json();
      if (result.url) urls.push(result.url);
    } catch (err) { console.error(err); }
  }
  return urls;
}

exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  try {
    const body = JSON.parse(event.body);
    const isExt = body.isExtension === true;
    const action = body.action || { data: body.data };
    const text = action.data.text;
    const cardId = action.data.card.id;

    if (isExt) {
      const urls = await uploadMedia(cardId, body.attachments || []);
      const finalComment = `${text}\n\n**Visual Proof:**\n${urls.join("\n")}`;
      await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: finalComment })
      });
      return { statusCode: 200, headers, body: "Done" };
    }

    const match = text.match(/^\s*(\[[^\]]+\]\s*)?bug\s*(\d+)/i);
    if (!match) return { statusCode: 200, headers, body: "Ignore" };

    const resL = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resL.json();
    let list = checklists.find(c => c.name === BUG_CHECKLIST_NAME) ||
      await (await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
      })).json();

    const resI = await fetch(`https://api.trello.com/1/checklists/${list.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checkData = await resI.json();
    if (!checkData.checkItems.some(i => new RegExp(`\\bbug\\s*${match[2]}\\b`, "i").test(i.name))) {
      await fetch(`https://api.trello.com/1/checklists/${list.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: text })
      });
    }

    return { statusCode: 200, headers, body: "Synced" };
  } catch (err) { return { statusCode: 500, headers, body: err.message }; }
};