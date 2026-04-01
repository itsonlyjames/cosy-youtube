// Background service worker for the YouTube extension
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    stylesEnabled: false,
  });
});

// Listen for tab updates to ensure styles persist
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com")
  ) {
    const result = await chrome.storage.sync.get(["stylesEnabled"]);
    const stylesEnabled = result.stylesEnabled;

    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "toggleStyles",
        enabled: stylesEnabled,
      });
    } catch (error) {
      console.log("Could not send message to content script:", error);
    }
  }
});

// Handle storage changes (if user changes settings in another tab)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.stylesEnabled) {
    console.log("Styles preference changed:", changes.stylesEnabled.newValue);
  }
});
