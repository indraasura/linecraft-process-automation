const fetch = require("node-fetch");
const FormData = require("form-data");

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const BUG_CHECKLIST_NAME = "Bugs Reported";

// Helper: Upload Base64 images to Trello and return their URLs
async function uploadAttachments(cardId, images) {
  const urls = [];
  for (const [index, base64] of images.entries()) {
    try {
      const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const form = new FormData();
      form.append("file", buffer, { filename: `bug-${index}.png`, contentType: "image/png" });

      const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
        method: "POST",
        body: form,
        headers: form.getHeaders()
      });
      const data = await res.json();
      if (data.url) urls.push(data.url);
    } catch (err) { console.error("Upload failed:", err); }
  }
  return urls;
}

// Helper: Post comment with links to screenshots
async function postComment(cardId, text, attachmentUrls) {
  let finalBody = text;
  if (attachmentUrls.length > 0) {
    finalBody += "\n\n**Attachments:**\n" + attachmentUrls.join("\n");
  }
  
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: finalBody })
  });
  return res.json();
}

exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  try {
    const body = JSON.parse(event.body);
    
    // Check if this is a direct call from the Extension (has 'isExtension' flag)
    const isFromExtension = body.isExtension === true;
    const action = body.action || { data: body.data };

    const commentText = action.data.text;
    const cardId = action.data.card.id;

    // ISSUE 2 FIX: If this is a Trello Webhook "echo" of a comment we JUST posted from the extension, ignore it.
    // Trello webhooks usually include 'memberCreator'. If it's YOUR token's owner, you can skip.
    // For now, we skip if the extension already handled the logic.
    if (!isFromExtension && event.headers["user-agent"]?.includes("TrelloWebhooks")) {
      // If the comment was just created by this script, Trello will send a webhook back.
      // We check the comment text for the bug pattern.
      // To prevent double checklist items, we rely on the Deduplication logic in Step 4.
    }

    // 1️⃣ EXTENSION LOGIC: Upload media -> Post Comment -> Exit
    if (isFromExtension) {
      const urls = await uploadAttachments(cardId, body.attachments || []);
      await postComment(cardId, commentText, urls);
      // We don't add to checklist here; we let the Trello Webhook "echo" trigger the shared logic below.
      return { statusCode: 200, headers, body: "Extension report initiated" };
    }

    // 2️⃣ SHARED WEBHOOK LOGIC: (Triggered by Trello Webhook when comment appears)
    const bugMatch = commentText.match(/^\s*bug\s*(\d+)/i);
    if (!bugMatch) return { statusCode: 200, headers, body: "Not a bug" };

    const bugNumber = bugMatch[1];

    // 3️⃣ Manage Checklist
    const resChecklists = await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklists = await resChecklists.json();
    let bugList = checklists.find(c => c.name === BUG_CHECKLIST_NAME) || 
                  await (await fetch(`https://api.trello.com/1/cards/${cardId}/checklists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: BUG_CHECKLIST_NAME })
                  })).json();

    // 4️⃣ Deduplication (Prevents Issue #2)
    const resItems = await fetch(`https://api.trello.com/1/checklists/${bugList.id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const checklistData = await resItems.json();
    const exists = checklistData.checkItems.some(item => new RegExp(`\\bbug\\s*${bugNumber}\\b`, "i").test(item.name));

    if (exists) return { statusCode: 200, headers, body: "Already in list" };

    // 5️⃣ Add Item
    await fetch(`https://api.trello.com/1/checklists/${bugList.id}/checkItems?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: commentText })
    });

    return { statusCode: 200, headers, body: "Checklist updated" };
  } catch (err) {
    return { statusCode: 500, headers, body: err.message };
  }
};