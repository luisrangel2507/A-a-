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
    "DATABASE_URL is not set. Point it at a Postgres connection string " +
      "(Railway sets this automatically once you add a Postgres plugin to the project)."
  );
  process.exit(1);
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
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
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
