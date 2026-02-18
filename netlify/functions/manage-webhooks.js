const fetch = require("node-fetch");
const BOARDS = ["68e4e8e2007c3a7003bcc1bf", "64ad254fa293a6e863b6436d", "64aba8a268ebd9d0b07835c2", "687de71a54155a2c409b0aaf", "657842fda2700f8aaffb40e1"];

// Add this inside your Netlify function handler

const action = event.queryStringParameters.action;
const cardId = event.queryStringParameters.cardId;

if (action === 'getBugNumbers' && cardId) {
  try {
    const TRELLO_AUTH = `key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;

    // 1. Fetch Comments
    const commentsReq = fetch(`https://api.trello.com/1/cards/${cardId}/actions?filter=commentCard&${TRELLO_AUTH}`);

    // 2. Fetch Checklists
    const checklistsReq = fetch(`https://api.trello.com/1/cards/${cardId}/checklists?${TRELLO_AUTH}`);

    const [commentsRes, checklistsRes] = await Promise.all([commentsReq, checklistsReq]);

    const commentsData = await commentsRes.json();
    const checklistsData = await checklistsRes.json();

    let allTextToSearch = [];

    // Extract text from comments
    if (Array.isArray(commentsData)) {
      commentsData.forEach(action => {
        if (action.data && action.data.text) {
          allTextToSearch.push(action.data.text);
        }
      });
    }

    // Extract text from checklist items
    if (Array.isArray(checklistsData)) {
      checklistsData.forEach(checklist => {
        checklist.checkItems.forEach(item => {
          allTextToSearch.push(item.name);
        });
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify(allTextToSearch)
    };

  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
}

exports.handler = async (event) => {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  try {
    // GET: Load Boards
    if (event.httpMethod === "GET") {
      const boards = await Promise.all(BOARDS.map(async id => {
        const r = await fetch(`https://api.trello.com/1/boards/${id}?key=${key}&token=${token}&fields=name`);
        return r.json();
      }));
      return { statusCode: 200, headers, body: JSON.stringify(boards) };
    }

    // POST: Load Cards for a board
    if (event.httpMethod === "POST") {
      const boardId = event.queryStringParameters.boardId;
      const r = await fetch(`https://api.trello.com/1/boards/${boardId}/cards?key=${key}&token=${token}&fields=name`);
      const cards = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify(cards) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: err.message };
  }
};