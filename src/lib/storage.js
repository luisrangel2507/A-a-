// Simple persistence adapter for standalone deployment.
//
// This mirrors the get/set shape used by the Claude.ai artifact `window.storage`
// API so the rest of the app didn't need to change. Right now it's backed by
// the browser's localStorage, which is fine for a single-register/single-device
// setup. When you're ready for multi-device sync (e.g. two tablets sharing
// live inventory), swap this file for one that calls your own API
// (Railway + Postgres, Neon, etc.) — the rest of the app only ever calls
// storage.get(key) / storage.set(key, value) and doesn't care how it's stored.

const storage = {
  async get(key) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      throw new Error(`No value found for key: ${key}`);
    }
    return { key, value: raw, shared: false };
  },

  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value, shared: false };
  },

  async delete(key) {
    window.localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },

  async list(prefix = "") {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

export default storage;
