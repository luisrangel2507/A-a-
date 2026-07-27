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

const auth = {
  // Is there an account yet? A fresh deployment has none and offers to create one.
  async state() {
    return request("/api/auth/state");
  },

  async me() {
    try {
      return (await request("/api/auth/me")).user;
    } catch (err) {
      if (err.status === 401) return null;
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
    return (await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })).user;
  },

  async logout() {
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
