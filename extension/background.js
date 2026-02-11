// background.js - Production Version
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("SidePanel Setup Error:", error));

// Optional: Listener for service worker installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("Trello Bug Reporter Pro Installed.");
});