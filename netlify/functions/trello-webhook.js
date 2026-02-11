const fetch = require("node-fetch");
const FormData = require("form-data");
const jwt = require("jsonwebtoken"); // You'll need to run: npm install jsonwebtoken

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET; // Found in Supabase API settings
const BUG_CHECKLIST_NAME = "Bugs Reported";

/**
 * Verifies that the request is coming from a logged-in Supabase user.
 */
function verifyUser(token) {
  try {
    return jwt.verify(token, SUPABASE_JWT_SECRET);
  } catch (err) {
    return null;
  }
}

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
    } catch (err) { console.error("Upload err:", err); }
  }
  return urls;
}

exports.handler = async (event) => {
  const headers = { 
    "Access-Control-Allow-Origin": "*", 
    "Access-Control-Allow-Headers": "Content-Type, Authorization" 
  };
  
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  // 1. Authenticate Request
  const authHeader = event.headers.authorization;
  if (!authHeader) return { statusCode: 401, headers, body: "Missing Authorization" };
  
  const token = authHeader.replace("Bearer ", "");
  const user = verifyUser(token);
  if (!user) return { statusCode: 403, headers, body: "Invalid Token" };

  try {
    const body = JSON.parse(event.body);
    const isExt = body.isExtension === true;
    const action = body.action || { data: body.data };
    const text = action.data.text;
    const cardId = action.data.card.id;

    if (isExt) {
      const urls = await uploadMedia(cardId, body.attachments || []);
      const finalComment = `${text}\n\n**Reporter:** ${user.email}\n**Visual Proof:**\n${urls.join("\n")}`;
      
      await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ text: finalComment })
      });
      return { statusCode: 200, headers, body: "Success" };
    }

    // Standard Webhook logic for checklist creation remains exactly the same...
    // [Insert your existing Regex and Checklist code here]

    return { statusCode: 200, headers, body: "Synced" };
  } catch (err) { 
    return { statusCode: 500, headers, body: err.message }; 
  }
};