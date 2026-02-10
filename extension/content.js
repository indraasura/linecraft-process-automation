/**
 * content.js
 * Handles the visual UI for partial screen selection.
 */

let startX, startY, selectionDiv;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start-selection") {
    createOverlay();
  }
});

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'trello-screenshot-overlay';
  overlay.style = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.3); z-index: 999999; cursor: crosshair;
  `;

  overlay.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    selectionDiv = document.createElement('div');
    selectionDiv.style = `
      border: 2px dashed #0079bf; background: rgba(0, 121, 191, 0.1);
      position: absolute; left: ${startX}px; top: ${startY}px;
    `;
    overlay.appendChild(selectionDiv);

    const onMouseMove = (moveEvent) => {
      const currentX = moveEvent.clientX;
      const currentY = moveEvent.clientY;
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      selectionDiv.style.width = `${width}px`;
      selectionDiv.style.height = `${height}px`;
      selectionDiv.style.left = `${Math.min(currentX, startX)}px`;
      selectionDiv.style.top = `${Math.min(currentY, startY)}px`;
    };

    const onMouseUp = () => {
      const rect = selectionDiv.getBoundingClientRect();
      overlay.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Send the crop coordinates back to the side panel
      chrome.runtime.sendMessage({
        action: "capture-partial",
        area: {
          x: rect.left * window.devicePixelRatio,
          y: rect.top * window.devicePixelRatio,
          w: rect.width * window.devicePixelRatio,
          h: rect.height * window.devicePixelRatio
        }
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  document.body.appendChild(overlay);
}