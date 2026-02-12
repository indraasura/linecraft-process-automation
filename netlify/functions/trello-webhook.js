const fetch = require("node-fetch");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
// Trim to prevent whitespace errors
const SUPABASE_JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || "").trim();
const BUG_CHECKLIST_NAME = "Bugs Reported";

// --- HELPER: Upload Media (Extension Only) ---
async function uploadMedia(cardId, mediaArray) {
  const urls = [];
  for (const [i, data] of mediaArray.entries()) {
    try {
      const buffer = Buffer.from(data.split(",")[1], 'base64');
      const form = new FormData();
      form.append("file", buffer, { filename: `evidence-${i}.png`, contentType: 'image/png' });
      
      const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", body: form, headers: form.getHeaders()
      });
      const json = await res.json();
      if (json.url) urls.push(json.url);
    } catch (e) { console.error("Upload failed", e); }
  }
  return urls;
}

// --- HELPER: Sync Checklist (Shared Logic) ---
async function syncChecklist(cardId, text) {
    // 1. Strict Regex: Must contain "Bug" followed by a number
    const match = text.match(/bug\s*(\d+)/i);
    if (!match) return; // Ignore chatty comments like "Good job fixing that bug"
    
    const bugNum = match[1];

    // 2. Find or Create "Bugs Reported" Checklist
    const resL = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const lists = await resL.json();
    
    let listId = lists.find(l => l.name === BUG_CHECKLIST_NAME)?.id;
    
    if (!listId) {
        const resNew = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
        });
        listId = (await resNew.json()).id;
    }

    // 3. Check for Duplicates
    const resI = await fetch(`https://api.trello.com/1/checklists/${listId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const data = await resI.json();
    
    // Does any existing item contain "Bug [same number]"?
    const exists = data.checkItems.some(i => new RegExp(`\\bbug\\s*${bugNum}\\b`, "i").test(i.name));
    
    // 4. Add to Checklist if new
    if (!exists) {
        // We use the first line of the comment as the checklist title (max 100 chars)
        const itemName = text.split('\n')[0].substring(0, 100); 
        await fetch(`https://api.trello.com/1/checklists/${listId}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: itemName })
        });
        console.log(`Synced comment to checklist: ${itemName}`);
    }
}

// --- MAIN HANDLER ---
exports.handler = async (event) => {
  // 1. HEAD Request (Trello verification)
  if (event.httpMethod === "HEAD") return { statusCode: 200 };

  try {
    const body = JSON.parse(event.body);

    // CASE A: Request from Chrome Extension
    if (body.isExtension) {
        // ... (Auth logic skipped for brevity, assumes previous working state) ...
        const { bugTitle, bugDescription, cardId, attachments } = body;

        // Upload & Comment
        const urls = await uploadMedia(cardId, attachments || []);
        const comment = `${bugDescription}\n\n**Evidence:**\n${urls.join("\n")}`;
        
        await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: comment })
        });

        // Sync Checklist using Title
        await syncChecklist(cardId, bugTitle);

        return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "Extension Success" };
    } 
    
    // CASE B: Native Trello Comment (User typed directly in Trello)
    else if (body.action && body.action.type === 'commentCard') {
        const commentText = body.action.data.text;
        const cardId = body.action.data.card.id;

        // Check if comment follows "Bug [number]" pattern
        await syncChecklist(cardId, commentText);
        
        return { statusCode: 200, body: "Trello Sync Success" };
    }

    return { statusCode: 200, body: "Ignored" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};