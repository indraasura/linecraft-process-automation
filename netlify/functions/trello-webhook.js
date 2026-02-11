const fetch = require("node-fetch");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const BUG_CHECKLIST_NAME = "Bugs Reported";

// HELPER: Upload Media
async function uploadMedia(cardId, mediaArray) {
  const urls = [];
  for (const [i, data] of mediaArray.entries()) {
    try {
      const isVideo = data.includes("video/webm");
      const buffer = Buffer.from(data.split(",")[1], 'base64');
      const form = new FormData();
      form.append("file", buffer, { 
          filename: `bug-evidence-${i}.${isVideo ? 'webm' : 'png'}`, 
          contentType: isVideo ? 'video/webm' : 'image/png' 
      });
      
      const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", body: form, headers: form.getHeaders()
      });
      const result = await res.json();
      if (result.url) urls.push(result.url);
    } catch (err) { console.error("Media Upload Failed:", err); }
  }
  return urls;
}

// HELPER: Sync Checklist
async function syncChecklist(cardId, bugTitle) {
    // Looks for "Bug 123" anywhere in the string
    const bugMatch = bugTitle.match(/bug\s*(\d+)/i);
    if (!bugMatch) return; 

    const bugNumber = bugMatch[1]; // Extracts the digits

    // Get all checklists
    const resL = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resL.json();
    
    let listId;
    const existingList = checklists.find(c => c.name === BUG_CHECKLIST_NAME);
    
    if (existingList) {
        listId = existingList.id;
    } else {
        // Create the checklist if it doesn't exist
        const resNew = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
        });
        const newList = await resNew.json();
        listId = newList.id;
    }

    // Check for duplicates before adding
    const resItems = await fetch(`https://api.trello.com/1/checklists/${listId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checkData = await resItems.json();
    
    const exists = checkData.checkItems.some(i => new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(i.name));
    
    if (!exists) {
        await fetch(`https://api.trello.com/1/checklists/${listId}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: bugTitle })
        });
    }
}

// MAIN HANDLER
exports.handler = async (event) => {
  const headers = { 
      "Access-Control-Allow-Origin": "*", 
      "Access-Control-Allow-Headers": "Content-Type, Authorization" 
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers, body: "Unauthorized - Missing Token" };
  
  try {
    const user = jwt.verify(auth.replace("Bearer ", ""), SUPABASE_JWT_SECRET);
    const body = JSON.parse(event.body);
    
    // 🚀 FLAT PAYLOAD ROUTING: Explicitly for extension
    if (body.isExtension) {
      const { extTitle, extDescription, extCardId, attachments } = body;

      // 1. Upload Media
      const urls = await uploadMedia(extCardId, attachments || []);
      
      // 2. Trello Comment (Description + Media URLs)
      const finalComment = `${extDescription}\n\n**Reporter:** ${user.email}\n**Evidence:**\n${urls.join("\n")}`;
      
      await fetch(`https://api.trello.com/1/cards/${extCardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: finalComment })
      });

      // 3. Checklist Item (Title Only)
      await syncChecklist(extCardId, extTitle);

      return { statusCode: 200, headers, body: "Extension Request Completed" };
    }

    // Default return for anything else
    return { statusCode: 200, headers, body: "Ignored" };
  } catch (err) { 
    return { statusCode: 500, headers, body: err.message }; 
  }
};