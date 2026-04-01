document.addEventListener("DOMContentLoaded", async () => {
  const toggleSwitch = document.getElementById("styleToggle");
  // const status = document.getElementById('status');

  // Load current state
  const result = await chrome.storage.sync.get(["stylesEnabled"]);
  const isEnabled = result.stylesEnabled;

  // Update UI
  updateToggleState(isEnabled);
  // updateStatus(isEnabled);

  // Add click handler
  toggleSwitch.addEventListener("click", async () => {
    const newState = !toggleSwitch.classList.contains("active");

    // Save state
    await chrome.storage.sync.set({ stylesEnabled: newState });

    // Update UI
    updateToggleState(newState);
    // updateStatus(newState);

    // Send message to content script
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab.url.includes("youtube.com")) {
        chrome.tabs.sendMessage(tab.id, {
          action: "toggleStyles",
          enabled: newState,
        });
      }
    } catch (error) {
      console.log("Could not send message to content script:", error);
    }
  });

  function updateToggleState(enabled) {
    if (enabled) {
      toggleSwitch.classList.add("active");
    } else {
      toggleSwitch.classList.remove("active");
    }
  }

  // function updateStatus(enabled) {
  //   status.textContent = enabled ? 'Styles Active' : 'Styles Disabled';
  // }
});
