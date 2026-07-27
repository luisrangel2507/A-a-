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

// Spanish-language messages for the errors the server reports by code.
export const AUTH_ERRORS = {
  bad_credentials: "Usuario o contraseña incorrectos.",
  username_taken: "Ese usuario ya existe.",
  username_invalid: "El usuario debe tener 3 a 32 caracteres: letras, números, punto, guion o guion bajo.",
  password_too_short: "La contraseña debe tener al menos 6 caracteres.",
  name_required: "Escribe el nombre de la persona.",
  already_set_up: "Ya existe una cuenta. Inicia sesión.",
  cannot_deactivate_self: "No puedes desactivar tu propia cuenta.",
  role_invalid: "Elige Empleado o Gerente.",
  owner_only: "Solo el dueño puede hacer esto.",
  unauthenticated: "Tu sesión expiró. Inicia sesión otra vez.",
};

export const authMessage = (err) =>
  AUTH_ERRORS[err && err.message] || "Algo falló. Inténtalo de nuevo.";

export default auth;
