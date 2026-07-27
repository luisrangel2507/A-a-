import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    [
      "DATABASE_URL is not set — the server needs a Postgres connection string to start.",
      "",
      "On Railway: adding a Postgres database does not hand its URL to this service;",
      "variables are per-service. Open this service's Variables tab and add:",
      "",
      "    DATABASE_URL=${{Postgres.DATABASE_URL}}",
      "",
      "(use the database service's name if you renamed it from 'Postgres').",
      "",
      "Locally: copy .env.example to .env and point DATABASE_URL at your database.",
    ].join("\n")
  );
  process.exit(1);
}

// Postgres reached over a loopback or private network speaks plaintext, and
// forcing SSL there fails with "The server does not support SSL connections".
// Railway's database lives on *.railway.internal, so it belongs in that group;
// anything else (a public host like Neon or Railway's TCP proxy) gets SSL.
const { dbHost, dbPort } = (() => {
  try {
    const u = new URL(connectionString);
    return { dbHost: u.hostname, dbPort: u.port || "5432" };
  } catch {
    return { dbHost: "", dbPort: "5432" };
  }
})();
const isPrivateHost =
  dbHost === "localhost" ||
  dbHost === "127.0.0.1" ||
  dbHost === "::1" ||
  dbHost.endsWith(".internal");
const sslDisabledInUrl = /[?&]sslmode=disable(&|$)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isPrivateHost || sslDisabledInUrl ? false : { rejectUnauthorized: false },
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// Generic key/value store backing src/lib/storage.js's get/set/delete —
// the app only ever persists two keys today (shop data, menu config),
// but the endpoint doesn't need to know that.
app.get("/api/kv/:key", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT value FROM kv_store WHERE key = $1", [req.params.key]);
    if (rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json({ key: req.params.key, value: rows[0].value });
  } catch (err) {
    next(err);
  }
});

app.put("/api/kv/:key", async (req, res, next) => {
  try {
    const { value } = req.body;
    if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });
    await pool.query(
      `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, value]
    );
    res.json({ key: req.params.key, value });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/kv/:key", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM kv_store WHERE key = $1", [req.params.key]);
    res.json({ key: req.params.key, deleted: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

// Serve the built frontend in production (Railway runs `npm run build` then `npm start`).
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = process.env.PORT || 4000;
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`Açaí Control server listening on :${port}`));
  })
  .catch((err) => {
    if (err.code === "ECONNREFUSED" && isPrivateHost && dbHost !== "") {
      console.error(
        [
          `Could not reach Postgres at ${dbHost}:${dbPort} — nothing is listening there.`,
          "",
          "If this is a deployment, DATABASE_URL is pointing at the app's own container",
          "instead of the database. The value from .env.example is a local placeholder;",
          "don't copy it into Railway. Set the app service's variable to a reference:",
          "",
          "    DATABASE_URL=${{Postgres.DATABASE_URL}}",
          "",
          "Railway substitutes the real internal host at deploy time.",
        ].join("\n")
      );
      process.exit(1);
    }
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
