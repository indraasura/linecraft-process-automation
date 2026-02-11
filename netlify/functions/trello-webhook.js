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
      form.append("file", buffer, { 
          filename: `bug-${i}.${isVideo ? 'webm' : 'png'}`, 
          contentType: isVideo ? 'video/webm' : 'image/png' 
      });
      const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", body: form, headers: form.getHeaders()
      });
      const result = await res.json();
      if (result.url) urls.push(result.url);
    } catch (err) { console.error("Upload Error:", err); }
  }
  return urls;
}

async function syncChecklist(cardId, title) {
    // Regex matches the [Priority] Bug 123 pattern
    const bugMatch = title.match(/^\s*(\[[^\]]+\]\s*)?bug\s*(\d+)/i);
    if (!bugMatch) return;

    const resL = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resL.json();
    let list = checklists.find(c => c.name === BUG_CHECKLIST_NAME);
    
    if (!list) {
      const resNew = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
      });
      list = await resNew.json();
    }

    const resI = await fetch(`https://api.trello.com/1/checklists/${list.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checkData = await resI.json();
    
    const bugNumber = bugMatch[2];
    const exists = checkData.checkItems.some(i => new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(i.name));
    
    if (!exists) {
      await fetch(`https://api.trello.com/1/checklists/${list.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: title })
      });
    }
}

exports.handler = async (event) => {
  const headers = { 
      "Access-Control-Allow-Origin": "*", 
      "Access-Control-Allow-Headers": "Content-Type, Authorization" 
  };
  
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers, body: "Unauthorized" };
  
  try {
    const user = jwt.verify(auth.replace("Bearer ", ""), SUPABASE_JWT_SECRET);
    const body = JSON.parse(event.body);
    
    // CRITICAL FIX: Ensure we extract the right fields from the payload
    const actionData = body.action.data;
    const title = actionData.title; 
    const description = actionData.description;
    const cardId = actionData.card.id;

    if (body.isExtension) {
      // 1. Upload Media
      const urls = await uploadMedia(cardId, body.attachments || []);
      
      // 2. Post Comment (Description + Media)
      // We check if description is present to avoid "undefined" text
      const descText = description || "No description provided.";
      const finalComment = `${descText}\n\n**Reporter:** ${user.email}\n**Proof:**\n${urls.join("\n")}`;
      
      await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: finalComment })
      });

      // 3. Update Checklist (Title)
      await syncChecklist(cardId, title);

      return { statusCode: 200, headers, body: "Success" };
    }

    return { statusCode: 200, headers, body: "Webhook processed" };
  } catch (err) { 
    return { statusCode: 500, headers, body: err.message }; 
  }
};