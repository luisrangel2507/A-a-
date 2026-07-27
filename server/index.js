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

// An unresolved Railway reference arrives as the literal "${{Service.VAR}}" text.
// Catch it here: pg-connection-string would otherwise parse that string into the
// bogus host "base" (the letters inside "DATABASE"), and the resulting DNS error
// points nowhere near the real problem.
if (/^\$\{\{.*\}\}$/.test(connectionString.trim())) {
  console.error(
    [
      `DATABASE_URL still holds the literal text ${connectionString.trim()}.`,
      "",
      "Railway leaves a variable reference unsubstituted when it cannot resolve it,",
      "which means the service it names does not exist in this project. Check:",
      "",
      "  1. A Postgres database is actually part of this project",
      "     (New -> Database -> Add PostgreSQL).",
      "  2. The name inside the reference matches that service exactly, including",
      "     capitalisation — a database shown as 'postgres' needs",
      "     ${{postgres.DATABASE_URL}}.",
      "",
      "You can sidestep references entirely: open the database service's Variables",
      "tab and copy its DATABASE_URL value straight into this service.",
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

// Echoed on connection failure so the logs show which value actually arrived —
// misconfigured deploys are otherwise indistinguishable from network trouble.
// The password is never printed.
function describeConnection() {
  try {
    const u = new URL(connectionString);
    const user = u.username ? `${u.username}:***@` : "";
    return `postgres://${user}${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    const looksLikeReference = /^\$\{\{.*\}\}$/.test(connectionString.trim());
    return looksLikeReference
      ? `${connectionString.trim()}  <- Railway did not substitute this reference; ` +
          `check that a service with that exact name exists in this project`
      : `<unparseable value, ${connectionString.length} characters>`;
  }
}

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

// Railway's private network (*.railway.internal) needs a few seconds after the
// container starts before its DNS answers, so the first connection attempts can
// fail with ENOTFOUND on a perfectly good configuration. Retry before giving up
// — a real misconfiguration still fails, just a little later and with the same
// diagnostics.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connectWithRetry({ attempts = 8, delayMs = 2000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSchema();
      return;
    } catch (err) {
      const transient = err.code === "ENOTFOUND" || err.code === "ECONNREFUSED";
      if (!transient || attempt >= attempts) throw err;
      console.log(
        `Database not reachable yet (${err.code}), attempt ${attempt}/${attempts} — retrying in ${delayMs / 1000}s…`
      );
      await sleep(delayMs);
    }
  }
}

connectWithRetry()
  .then(() => {
    app.listen(port, () => console.log(`Açaí Control server listening on :${port}`));
  })
  .catch((err) => {
    if (err.code === "ECONNREFUSED" && isPrivateHost && dbHost !== "") {
      console.error(
        [
          `Could not reach Postgres at ${dbHost}:${dbPort} — nothing is listening there.`,
          "",
          `The server received: ${describeConnection()}`,
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
    if (err.code === "ENOTFOUND") {
      const host = err.hostname || dbHost;
      const advice = isPrivateHost
        ? [
            "That is Railway's private network, so the connection string itself is right —",
            "the name simply never resolved, even after retrying. Usually that means the",
            "database service is stopped, crashed, or was removed from the project.",
            "",
            "Open the database service in Railway and confirm it is deployed and running.",
            "If it is, redeploy this service so it picks the private network up again.",
          ]
        : [
            "That host does not exist. If this is a Railway deployment, the app service's",
            "DATABASE_URL should be a reference to the database service:",
            "",
            "    ${{Postgres.DATABASE_URL}}",
            "",
            "Use your database service's name if it is not called 'Postgres', or copy its",
            "DATABASE_URL value verbatim from that service's Variables tab.",
          ];
      console.error(
        [
          `DATABASE_URL points at the host "${host}", which does not resolve.`,
          "",
          `The server received: ${describeConnection()}`,
          "",
          ...advice,
        ].join("\n")
      );
      process.exit(1);
    }
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
