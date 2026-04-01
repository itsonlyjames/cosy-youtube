let stylesEnabled = false;
let styleElement = null;

initialize();

async function initialize() {
  const result = await chrome.storage.sync.get(["stylesEnabled"]);
  stylesEnabled = result.stylesEnabled;

  await injectStyles();
  updateHtmlAttribute(stylesEnabled);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleStyles") {
    console.log("test action", message);
    stylesEnabled = message.enabled;
    updateHtmlAttribute(stylesEnabled);
    sendResponse({ success: true });
  }
});

async function injectStyles() {
  removeStyles();

  try {
    const response = await fetch(chrome.runtime.getURL("styles.css"));
    const cssText = await response.text();

    styleElement = document.createElement("style");
    styleElement.id = "cosy-youtube-styles";
    styleElement.textContent = cssText;

    document.head.appendChild(styleElement);
  } catch (error) {
    console.error("Failed to load styles.css:", error);
  }

  triggerResize();
}

function updateHtmlAttribute(enabled) {
  const htmlEl = document.documentElement;
  if (enabled) {
    htmlEl.setAttribute("cosy-youtube", "");
  } else {
    htmlEl.removeAttribute("cosy-youtube");
  }
  triggerResize();
}

function removeStyles() {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
  const existingStyles = document.getElementById("cosy-youtube-styles");
  if (existingStyles) existingStyles.remove();
}

function triggerResize() {
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

// Handle YouTube SPA navigation
let currentUrl = location.href;
new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    setTimeout(() => {
      updateHtmlAttribute(stylesEnabled);
    }, 500); // small delay for DOM updates
  }
}).observe(document, { subtree: true, childList: true });
