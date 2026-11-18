/* Safe wrappers around browser storage: private windows or blocked storage never break the app. */

function read(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function write(storage, key, value) {
  try { storage.setItem(key, value); } catch { /* storage unavailable */ }
}

function remove(storage, key) {
  try { storage.removeItem(key); } catch { /* storage unavailable */ }
}

function getStorage(name) {
  try { return window[name]; } catch { return null; }
}

function makeStore(name) {
  return {
    get: (key) => { const s = getStorage(name); return s ? read(s, key) : null; },
    set: (key, value) => { const s = getStorage(name); if (s) write(s, key, String(value)); },
    remove: (key) => { const s = getStorage(name); if (s) remove(s, key); },
    getJson(key, fallback) {
      const s = getStorage(name);
      const raw = s ? read(s, key) : null;
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    setJson: (key, value) => { const s = getStorage(name); if (s) write(s, key, JSON.stringify(value)); },
  };
}

export const local = makeStore("localStorage");
export const session = makeStore("sessionStorage");
