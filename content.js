let stylesEnabled = false;

updatePageAttribute();
initialize();

document.addEventListener("yt-navigate-finish", updatePageAttribute);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.stylesEnabled) return;

  stylesEnabled = Boolean(changes.stylesEnabled.newValue);
  updateHtmlAttribute(stylesEnabled);
});

async function initialize() {
  const result = await chrome.storage.sync.get(["stylesEnabled"]);
  stylesEnabled = Boolean(result.stylesEnabled);

  updateHtmlAttribute(stylesEnabled);
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

function updatePageAttribute() {
  const htmlEl = document.documentElement;
  if (location.pathname === "/watch") {
    htmlEl.setAttribute("cosy-youtube-video", "");
  } else {
    htmlEl.removeAttribute("cosy-youtube-video");
  }
  triggerResize();
}

function triggerResize() {
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}
