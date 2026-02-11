const fetch = require("node-fetch");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const BUG_CHECKLIST_NAME = "Bugs Reported";

async function uploadMedia(cardId, mediaArray) {
  const urls = [];
  for (const [i, data] of mediaArray.entries()) {
    try {
      const isVideo = data.includes("video/webm");
      const buffer = Buffer.from(data.split(",")[1], 'base64');
      const form = new FormData();
      form.append("file", buffer, { filename: `bug-${i}.${isVideo?'webm':'png'}`, contentType: isVideo?'video/webm':'image/png' });
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
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers, body: "Unauthorized" };
  
  try {
    const user = jwt.verify(auth.replace("Bearer ", ""), SUPABASE_JWT_SECRET);
    const body = JSON.parse(event.body);
    const action = body.action || { data: body.data };
    
    // Split the incoming data
    const title = action.data.title; 
    const description = action.data.description;
    const cardId = action.data.card.id;

    if (body.isExtension) {
      // 1. Upload Media
      const urls = await uploadMedia(cardId, body.attachments || []);
      
      // 2. Post the DESCRIPTION and media links as a COMMENT
      const finalComment = `${description}\n\n**Reporter:** ${user.email}\n**Proof:**\n${urls.join("\n")}`;
      await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: finalComment })
      });

      // 3. Post the TITLE to the CHECKLIST (Manual trigger for extension requests)
      // Note: We call the checklist logic directly here for extension reports
      await syncChecklist(cardId, title);

      return { statusCode: 200, headers, body: "Success" };
    }

    // Standard webhook "echo" logic if needed (optional since Extension handles both now)
    return { statusCode: 200, headers };
  } catch (err) { return { statusCode: 500, headers, body: err.message }; }
};

async function syncChecklist(cardId, title) {
    const bugMatch = title.match(/^\s*(\[[^\]]+\]\s*)?bug\s*(\d+)/i);
    if (!bugMatch) return;

    const resL = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resL.json();
    let list = checklists.find(c => c.name === BUG_CHECKLIST_NAME);
    
    if (!list) {
      list = await (await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
      })).json();
    }

    const resI = await fetch(`https://api.trello.com/1/checklists/${list.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checkData = await resI.json();
    
    const bugNumber = bugMatch[2];
    if (!checkData.checkItems.some(i => new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(i.name))) {
      await fetch(`https://api.trello.com/1/checklists/${list.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: title })
      });
    }
}