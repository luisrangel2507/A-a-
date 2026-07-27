// Persistence adapter backed by the server's /api/kv/:key endpoint
// (see server/index.js), which stores everything in Postgres. This
// mirrors the get/set/delete shape the app already used for localStorage,
// so App.jsx only ever calls storage.get(key) / storage.set(key, value)
// and doesn't care that the data now lives in a shared database instead
// of the browser — multiple registers/tablets pointed at the same
// deployment now see the same inventory and sales.

// A 401 means the session is gone, which the app has to handle by sending the
// person back to the sign-in screen — it is not the same as a failed save.
export class SessionExpiredError extends Error {
  constructor() {
    super("unauthenticated");
    this.name = "SessionExpiredError";
  }
}

const storage = {
  async get(key) {
    const res = await fetch(`/api/kv/${encodeURIComponent(key)}`, {
      credentials: "same-origin",
    });
    if (res.status === 401) throw new SessionExpiredError();
    if (res.status === 404) {
      throw new Error(`No value found for key: ${key}`);
    }
    if (!res.ok) {
      throw new Error(`Failed to load ${key}: ${res.status}`);
    }
    const data = await res.json();
    return { key: data.key, value: data.value, shared: true };
  },

  async set(key, value) {
    const res = await fetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) {
      throw new Error(`Failed to save ${key}: ${res.status}`);
    }
    const data = await res.json();
    return { key: data.key, value: data.value, shared: true };
  },

  async delete(key) {
    const res = await fetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) {
      throw new Error(`Failed to delete ${key}: ${res.status}`);
    }
    return { key, deleted: true, shared: true };
  },
};

export default storage;
