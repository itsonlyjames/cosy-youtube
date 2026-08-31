document.addEventListener("DOMContentLoaded", async () => {
  const toggleSwitch = document.getElementById("styleToggle");

  const result = await chrome.storage.sync.get(["stylesEnabled"]);
  const isEnabled = result.stylesEnabled === true;

  updateToggleState(isEnabled);

  toggleSwitch.addEventListener("click", async () => {
    const newState = !toggleSwitch.classList.contains("active");

    await chrome.storage.sync.set({ stylesEnabled: newState });
    updateToggleState(newState);
  });

  function updateToggleState(enabled) {
    toggleSwitch.classList.toggle("active", enabled);
    toggleSwitch.setAttribute("aria-checked", String(enabled));
  }
});
