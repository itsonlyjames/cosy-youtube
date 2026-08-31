const DEFAULT_PREFERENCES = {
  stylesEnabled: false,
};

// Initialise missing preferences without overwriting values restored by sync.
chrome.runtime.onInstalled.addListener(async () => {
  const { stylesEnabled } = await chrome.storage.sync.get(["stylesEnabled"]);

  if (stylesEnabled === undefined) {
    await chrome.storage.sync.set(DEFAULT_PREFERENCES);
  }
});
