// Client side of the staff accounts. The session itself lives in an httpOnly
// cookie the browser sends automatically, so nothing here holds a token —
// these calls just ask the server who is signed in.

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw Object.assign(new Error((data && data.error) || `http_${res.status}`), {
      status: res.status,
    });
  }
  return data;
}

// Who was signed in last time, so a reload with no connection reopens the register
// instead of a sign-in form nobody can answer. This is display state only: it grants
// nothing. The session is still the httpOnly cookie, the API still refuses without
// it, and the moment the server is reachable again it decides who this really is.
const CACHED_USER = "last-user-v1";

function rememberUser(user) {
  try {
    if (user) localStorage.setItem(CACHED_USER, JSON.stringify(user));
    else localStorage.removeItem(CACHED_USER);
  } catch {
    // Nothing to do; the app simply will not survive an offline reload.
  }
}

function lastUser() {
  try {
    const raw = localStorage.getItem(CACHED_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const isNetworkFailure = (err) => err instanceof TypeError || err?.name === "AbortError";

const auth = {
  // Is there an account yet? A fresh deployment has none and offers to create one.
  async state() {
    return request("/api/auth/state");
  },

  async me() {
    try {
      const user = (await request("/api/auth/me")).user;
      rememberUser(user);
      return user;
    } catch (err) {
      // Signed out for real: forget them, so the next offline start does not reopen
      // the register for someone the server has already turned away.
      if (err.status === 401) {
        rememberUser(null);
        return null;
      }
      // Could not ask. Fall back to whoever was here last, and let the reconnect
      // check settle it.
      if (isNetworkFailure(err)) {
        const cached = lastUser();
        if (cached) return { ...cached, offline: true };
      }
      throw err;
    }
  },

  async setup({ username, name, password }) {
    return (await request("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ username, name, password }),
    })).user;
  },

  async login({ username, password }) {
    const user = (await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })).user;
    rememberUser(user);
    return user;
  },

  async logout() {
    // Forgotten first: signing out has to hold even if the request itself fails.
    rememberUser(null);
    await request("/api/auth/logout", { method: "POST" });
  },

  async listUsers() {
    return (await request("/api/users")).users;
  },

  async createUser({ username, name, password, role }) {
    return (await request("/api/users", {
      method: "POST",
      body: JSON.stringify({ username, name, password, role }),
    })).user;
  },

  async setPassword(id, password) {
    return request(`/api/users/${encodeURIComponent(id)}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  async deactivateUser(id) {
    return request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// What each error code the server reports means, in plain words.
export const AUTH_ERRORS = {
  bad_credentials: "Wrong username or password.",
  username_taken: "That username is taken.",
  username_invalid:
    "Usernames are 3 to 32 characters: letters, numbers, dot, dash or underscore.",
  password_too_short: "Passwords need at least 6 characters.",
  name_required: "Enter the person's name.",
  already_set_up: "An account already exists. Sign in instead.",
  cannot_deactivate_self: "You can't remove your own account.",
  role_invalid: "Pick Staff or Manager.",
  owner_only: "Only the owner can do this.",
  unauthenticated: "Your session expired. Sign in again.",
};

export const authMessage = (err) =>
  AUTH_ERRORS[err && err.message] || "Something went wrong. Try again.";

export default auth;
