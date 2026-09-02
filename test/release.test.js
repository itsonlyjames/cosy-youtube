const assert = require("node:assert/strict");
const { access, readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

async function readProjectFile(file) {
  return readFile(path.join(projectRoot, file), "utf8");
}

test("manifest has release-safe permissions, version, and resources", async () => {
  const manifest = JSON.parse(await readProjectFile("manifest.json"));
  const packageMetadata = JSON.parse(await readProjectFile("package.json"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(packageMetadata.version, manifest.version);

  const versionParts = manifest.version.split(".");
  assert.ok(versionParts.length >= 1 && versionParts.length <= 4);
  for (const part of versionParts) {
    assert.match(part, /^(0|[1-9]\d*)$/);
    assert.ok(Number(part) <= 65535);
  }

  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["*://*.youtube.com/*"]);
  assert.equal(manifest.action.default_popup, "popup.html");

  const youtubeScript = manifest.content_scripts.find(({ matches }) =>
    matches.includes("*://*.youtube.com/*"),
  );
  assert.ok(youtubeScript, "YouTube content script is registered");
  assert.deepEqual(youtubeScript.css, ["styles.css"]);
  assert.deepEqual(youtubeScript.js, ["content.js"]);
  assert.equal(youtubeScript.run_at, "document_start");

  const referencedFiles = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...youtubeScript.css,
    ...youtubeScript.js,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  await Promise.all(
    [...new Set(referencedFiles)].map((file) => access(path.join(projectRoot, file))),
  );
});

test("popup exposes a labelled native switch with consistent product copy", async () => {
  const popup = await readProjectFile("popup.html");

  assert.match(popup, /<div class="header">Cosy YouTube<\/div>/);
  assert.match(
    popup,
    /<button[\s\S]*?id="styleToggle"[\s\S]*?type="button"[\s\S]*?role="switch"[\s\S]*?aria-checked="false"[\s\S]*?aria-labelledby="styleToggleLabel"/,
  );
  assert.doesNotMatch(popup, /<div[^>]+id="styleToggle"/);
});

function createPopupHarness(storedValue) {
  const classes = new Set();
  const attributes = new Map([["aria-checked", "false"]]);
  const elementListeners = new Map();
  const documentListeners = new Map();
  const storageWrites = [];

  const toggle = {
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener: (event, listener) => elementListeners.set(event, listener),
    getAttribute: (name) => attributes.get(name),
    setAttribute: (name, value) => attributes.set(name, value),
  };

  const document = {
    addEventListener: (event, listener) => documentListeners.set(event, listener),
    getElementById: (id) => {
      assert.equal(id, "styleToggle");
      return toggle;
    },
  };

  const chrome = {
    storage: {
      sync: {
        get: async () =>
          storedValue === undefined ? {} : { stylesEnabled: storedValue },
        set: async (value) => storageWrites.push(value),
      },
    },
  };

  return {
    chrome,
    document,
    storageWrites,
    toggle,
    async load() {
      await documentListeners.get("DOMContentLoaded")();
    },
    async click() {
      await elementListeners.get("click")();
    },
  };
}

async function runPopup(storedValue) {
  const harness = createPopupHarness(storedValue);
  const source = await readProjectFile("popup.js");
  vm.runInNewContext(source, {
    chrome: harness.chrome,
    document: harness.document,
  });
  await harness.load();
  return harness;
}

test("popup restores enabled storage state and writes the disabled state", async () => {
  const popup = await runPopup(true);

  assert.equal(popup.toggle.classList.contains("active"), true);
  assert.equal(popup.toggle.getAttribute("aria-checked"), "true");

  await popup.click();

  assert.equal(popup.storageWrites.length, 1);
  assert.equal(popup.storageWrites[0].stylesEnabled, false);
  assert.equal(popup.toggle.classList.contains("active"), false);
  assert.equal(popup.toggle.getAttribute("aria-checked"), "false");
});

test("popup treats missing storage as disabled and can enable it", async () => {
  const popup = await runPopup(undefined);

  assert.equal(popup.toggle.classList.contains("active"), false);
  assert.equal(popup.toggle.getAttribute("aria-checked"), "false");

  await popup.click();

  assert.equal(popup.storageWrites.length, 1);
  assert.equal(popup.storageWrites[0].stylesEnabled, true);
  assert.equal(popup.toggle.classList.contains("active"), true);
  assert.equal(popup.toggle.getAttribute("aria-checked"), "true");
});

async function runBackgroundInstall(storedValue) {
  let installListener;
  const storageWrites = [];
  const source = await readProjectFile("background.js");

  vm.runInNewContext(source, {
    chrome: {
      runtime: {
        onInstalled: {
          addListener: (listener) => {
            installListener = listener;
          },
        },
      },
      storage: {
        sync: {
          get: async () => ({ stylesEnabled: storedValue }),
          set: async (value) => storageWrites.push(value),
        },
      },
    },
  });

  await installListener();
  return storageWrites;
}

test("installation initializes only a missing preference", async () => {
  const missingPreferenceWrites = await runBackgroundInstall(undefined);
  assert.equal(missingPreferenceWrites.length, 1);
  assert.equal(missingPreferenceWrites[0].stylesEnabled, false);

  assert.equal((await runBackgroundInstall(true)).length, 0);
  assert.equal((await runBackgroundInstall(false)).length, 0);
});

async function createContentScriptInstance(
  initialValue,
  storageListeners,
  initialPathname = "/",
) {
  const attributes = new Set();
  const resizeEvents = [];
  const documentListeners = new Map();
  const location = { pathname: initialPathname };
  const source = await readProjectFile("content.js");

  vm.runInNewContext(source, {
    Boolean,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    chrome: {
      storage: {
        onChanged: {
          addListener: (listener) => storageListeners.push(listener),
        },
        sync: {
          get: async () => ({ stylesEnabled: initialValue }),
        },
      },
    },
    document: {
      addEventListener: (event, listener) =>
        documentListeners.set(event, listener),
      documentElement: {
        removeAttribute: (name) => attributes.delete(name),
        setAttribute: (name) => attributes.add(name),
      },
    },
    location,
    requestAnimationFrame: (callback) => callback(),
    window: {
      dispatchEvent: (event) => resizeEvents.push(event.type),
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  return {
    attributes,
    resizeEvents,
    navigate(pathname) {
      location.pathname = pathname;
      documentListeners.get("yt-navigate-finish")();
    },
  };
}

test("video-only styles follow YouTube single-page navigation", async () => {
  const storageListeners = [];
  const tab = await createContentScriptInstance(true, storageListeners, "/");

  assert.equal(tab.attributes.has("cosy-youtube"), true);
  assert.equal(tab.attributes.has("cosy-youtube-video"), false);

  tab.navigate("/watch");
  assert.equal(tab.attributes.has("cosy-youtube-video"), true);

  tab.navigate("/");
  assert.equal(tab.attributes.has("cosy-youtube-video"), false);
});

test("a sync change updates every running content-script instance", async () => {
  const storageListeners = [];
  const firstTab = await createContentScriptInstance(false, storageListeners);
  const secondTab = await createContentScriptInstance(false, storageListeners);

  assert.equal(firstTab.attributes.has("cosy-youtube"), false);
  assert.equal(secondTab.attributes.has("cosy-youtube"), false);
  assert.equal(storageListeners.length, 2);

  for (const listener of storageListeners) {
    listener(
      { stylesEnabled: { oldValue: false, newValue: true } },
      "sync",
    );
  }

  assert.equal(firstTab.attributes.has("cosy-youtube"), true);
  assert.equal(secondTab.attributes.has("cosy-youtube"), true);
  assert.equal(firstTab.resizeEvents.length, 3);
  assert.equal(secondTab.resizeEvents.length, 3);
});
