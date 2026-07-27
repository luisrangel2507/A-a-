// Staff accounts and sessions.
//
// One account per employee, so a sale can say who rang it up. Passwords are
// stored as scrypt hashes with a per-password salt — never in plain text, and
// no dependency beyond node's own crypto. Sessions are opaque random tokens
// kept in the database and handed to the browser in an httpOnly cookie, so a
// script on the page cannot read them.

import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30;
export const COOKIE = "acai_session";

export async function ensureAuthSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);`);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, SCRYPT, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return resolve(false);
    const [, N, r, p, saltB64, keyB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N: Number(N), r: Number(r), p: Number(p) },
      (err, key) => {
        if (err) return resolve(false);
        // Constant-time compare, so a wrong password can't be narrowed down by timing.
        resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
      }
    );
  });
}

const newId = () => crypto.randomBytes(9).toString("base64url");

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function countUsers(pool) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE active");
  return rows[0].n;
}

export async function createUser(pool, { username, name, password, role = "employee" }) {
  const clean = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(clean)) {
    throw Object.assign(new Error("username_invalid"), { status: 400 });
  }
  if (String(password || "").length < 6) {
    throw Object.assign(new Error("password_too_short"), { status: 400 });
  }
  if (!String(name || "").trim()) {
    throw Object.assign(new Error("name_required"), { status: 400 });
  }
  const hash = await hashPassword(String(password));
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, name, role, active`,
      [newId(), clean, String(name).trim(), hash, role === "owner" ? "owner" : "employee"]
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") throw Object.assign(new Error("username_taken"), { status: 409 });
    throw err;
  }
}

export async function login(pool, username, password) {
  const clean = String(username || "").trim().toLowerCase();
  const { rows } = await pool.query(
    "SELECT id, username, name, role, password_hash, active FROM users WHERE username = $1",
    [clean]
  );
  const user = rows[0];
  // Verify against a dummy hash when the user is missing, so a valid username
  // isn't revealed by answering faster.
  const stored = user ? user.password_hash : "scrypt$16384$8$1$AAAA$AAAA";
  const ok = await verifyPassword(String(password || ""), stored);
  if (!user || !user.active || !ok) return null;

  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await pool.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [
    token,
    user.id,
    expires,
  ]);
  return {
    token,
    expires,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  };
}

export async function userForToken(pool, token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now() AND u.active`,
    [token]
  );
  return rows[0] || null;
}

export async function logout(pool, token) {
  if (token) await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function listUsers(pool) {
  const { rows } = await pool.query(
    "SELECT id, username, name, role, active FROM users ORDER BY role DESC, name ASC"
  );
  return rows;
}

// Deactivating rather than deleting keeps past sales attributable to the person
// who rang them up. Their sessions are dropped so access ends immediately.
export async function deactivateUser(pool, id) {
  await pool.query("UPDATE users SET active = FALSE WHERE id = $1", [id]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
}

export async function setPassword(pool, id, password) {
  if (String(password || "").length < 6) {
    throw Object.assign(new Error("password_too_short"), { status: 400 });
  }
  const hash = await hashPassword(String(password));
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, id]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
}

export async function pruneExpiredSessions(pool) {
  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");
}
