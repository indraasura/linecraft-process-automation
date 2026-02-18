// Define the CORS headers to allow cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allows your local server and the extension
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // 1. HANDLE CORS PREFLIGHT (The Bouncer)
  // Chrome sends an 'OPTIONS' request before the real request. We must approve it immediately.
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // 2. EXTRACT PARAMETERS
  const { action, boardId, cardId } = event.queryStringParameters || {};

  // 3. GRAB TRELLO CREDENTIALS FROM NETLIFY SETTINGS
  const TRELLO_KEY = process.env.TRELLO_KEY;
  const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

  if (!TRELLO_KEY || !TRELLO_TOKEN) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing Trello API keys in Netlify Environment Variables." })
    };
  }

  const authParams = `key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;

  try {
    // ==========================================
    // ROUTE 1: FETCH LATEST BUG NUMBERS (For the Yellow Pill)
    // ==========================================
    if (action === 'getBugNumbers' && cardId) {

      // Ping Trello for both Comments and Checklist items concurrently for speed
      const commentsReq = fetch(`https://api.trello.com/1/cards/${cardId}/actions?filter=commentCard&${authParams}`);
      const checklistsReq = fetch(`https://api.trello.com/1/cards/${cardId}/checklists?${authParams}`);

      const [commentsRes, checklistsRes] = await Promise.all([commentsReq, checklistsReq]);

      const commentsData = await commentsRes.json();
      const checklistsData = await checklistsRes.json();

      let allTextToSearch = [];

      // Extract text from comments
      if (Array.isArray(commentsData)) {
        commentsData.forEach(action => {
          if (action.data && action.data.text) allTextToSearch.push(action.data.text);
        });
      }

      // Extract text from checklists
      if (Array.isArray(checklistsData)) {
        checklistsData.forEach(checklist => {
          if (checklist.checkItems) {
            checklist.checkItems.forEach(item => allTextToSearch.push(item.name));
          }
        });
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(allTextToSearch)
      };
    }

    // ==========================================
    // ROUTE 2: FETCH CARDS (When a Board is selected)
    // ==========================================
    else if (boardId) {
      const response = await fetch(`https://api.trello.com/1/boards/${boardId}/cards?${authParams}`);
      if (!response.ok) throw new Error(`Trello API Error: ${response.statusText}`);

      const cards = await response.json();

      // Format strictly to what the frontend expects to keep the payload light
      const formattedCards = cards.map(c => ({ id: c.id, name: c.name }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(formattedCards)
      };
    }

    // ==========================================
    // ROUTE 3: FETCH BOARDS (Initial Load)
    // ==========================================
    else {
      const response = await fetch(`https://api.trello.com/1/members/me/boards?fields=id,name&${authParams}`);
      if (!response.ok) throw new Error(`Trello API Error: ${response.statusText}`);

      const boards = await response.json();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(boards)
      };
    }

  } catch (error) {
    console.error("Netlify Function Error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders, // Even errors need CORS headers, or the browser hides the real error!
      body: JSON.stringify({ error: error.message || "Internal Server Error" })
    };
  }
};