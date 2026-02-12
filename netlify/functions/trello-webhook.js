const fetch = require("node-fetch");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const BUG_CHECKLIST_NAME = "Bugs Reported";

if (!SUPABASE_JWT_SECRET) {
  console.error("CRITICAL ERROR: SUPABASE_JWT_SECRET is missing.");
}

// --- HELPER: Upload Media ---
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

// --- HELPER: Sync Checklist ---
async function syncChecklist(cardId, bugTitle) {
    const bugMatch = bugTitle.match(/bug\s*(\d+)/i);
    if (!bugMatch) return; 

    const bugNumber = bugMatch[1]; 

    // 1. Get Lists
    const resL = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resL.json();
    
    let targetListId;
    const existingList = checklists.find(c => c.name === BUG_CHECKLIST_NAME);
    
    if (existingList) {
        targetListId = existingList.id;
    } else {
        // 2. Create List
        const resNew = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
        });
        const newList = await resNew.json();
        targetListId = newList.id;
    }

    // 3. Check for Duplicate
    const resItems = await fetch(`https://api.trello.com/1/checklists/${targetListId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checkData = await resItems.json();
    
    const isDuplicate = checkData.checkItems.some(item => {
        const regex = new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i");
        return regex.test(item.name);
    });
    
    if (!isDuplicate) {
        await fetch(`https://api.trello.com/1/checklists/${targetListId}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: bugTitle })
        });
    }
}

// --- MAIN HANDLER ---
exports.handler = async (event) => {
  const headers = { 
      "Access-Control-Allow-Origin": "*", 
      "Access-Control-Allow-Headers": "Content-Type, Authorization" 
  };
  
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers, body: "Unauthorized - Missing Token" };
  
  try {
    // FIX: Force HS256 algorithm to match Supabase
    const token = auth.replace("Bearer ", "");
    const user = jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
    
    const body = JSON.parse(event.body);
    
    if (body.isExtension) {
      const { extTitle, extDescription, extCardId, attachments } = body;

      if (!extTitle || !extDescription || !extCardId) {
          return { statusCode: 400, headers, body: "Missing mandatory fields." };
      }

      // 1. Upload Media
      const urls = await uploadMedia(extCardId, attachments || []);
      
      // 2. Post Comment
      const finalComment = `${extDescription}\n\n**Reporter:** ${user.email}\n**Evidence:**\n${urls.join("\n")}`;
      await fetch(`https://api.trello.com/1/cards/${extCardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: finalComment })
      });

      // 3. Sync Checklist
      await syncChecklist(extCardId, extTitle);

      return { statusCode: 200, headers, body: "Report Processed" };
    }

    return { statusCode: 200, headers, body: "Ignored" };

  } catch (err) { 
    return { statusCode: 500, headers, body: err.message }; 
  }
};