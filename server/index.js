import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  COOKIE,
  countUsers,
  createUser,
  deactivateUser,
  ensureAuthSchema,
  listUsers,
  login,
  logout,
  parseCookies,
  pruneExpiredSessions,
  setPassword,
  userForToken,
} from "./auth.js";
import { adjustStock, ensureSalesSchema, listSales, recordSale, voidSale } from "./sales.js";

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

// An sslmode in the URL takes precedence over the pool's own ssl option, so it
// has to be dropped whenever this code needs its choice to be the one that applies.
function connectionStringWithoutSslMode() {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return connectionString;
  }
}

// SSL can't be decided from the hostname alone: Railway's own Postgres answers
// its public TCP proxy without SSL, while managed hosts like Neon require it.
// Start with the likely setting and let the handshake correct it.
//
// When SSL is on, a URL that asks for verification (Neon's sslmode=require) is
// left intact so the certificate really is checked. Only if that verification
// fails does relaxCert drop to an encrypted-but-unverified connection, which is
// what self-signed certificates in front of managed databases need.
function createPool(useSsl, relaxCert = false) {
  if (!useSsl) {
    return new Pool({ connectionString: connectionStringWithoutSslMode(), ssl: false });
  }
  if (relaxCert) {
    return new Pool({
      connectionString: connectionStringWithoutSslMode(),
      ssl: { rejectUnauthorized: false },
    });
  }
  return new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
}

let usingSsl = !(isPrivateHost || sslDisabledInUrl);
let relaxedCert = false;
let pool = createPool(usingSsl);

// The certificate could not be verified — encrypted still works, verified does not.
function certRejected(err) {
  return (
    err.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    err.code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    err.code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    /self.signed certificate|unable to verify/i.test(String(err && err.message))
  );
}

// Postgres reports an SSL mismatch clearly, in both directions.
function sslMismatch(err) {
  const msg = String(err && err.message);
  if (usingSsl && /does not support SSL/i.test(msg)) return "off";
  if (!usingSsl && /(SSL|encryption) (is )?required|no encryption/i.test(msg)) return "on";
  return null;
}

// A dropped handshake says nothing about its cause: a TCP proxy in front of the
// database, an SSL mismatch it swallowed, or an instance still waking up all look
// the same. Worth one attempt with the opposite SSL setting before retrying.
function handshakeDropped(err) {
  return (
    /Connection terminated unexpectedly/i.test(String(err && err.message)) ||
    err.code === "ECONNRESET" ||
    err.code === "EPIPE" ||
    err.code === "ETIMEDOUT"
  );
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await ensureAuthSchema(pool);
  await ensureSalesSchema(pool);
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// Railway and other proxies terminate TLS upstream; without this the secure
// cookie below would never be set, because express would see plain http.
app.set("trust proxy", 1);
const cookieSecure = process.env.NODE_ENV === "production";

function sessionCookie(res, token, expires) {
  res.setHeader(
    "Set-Cookie",
    [
      `${COOKIE}=${encodeURIComponent(token)}`,
      `Path=/`,
      `Expires=${expires.toUTCString()}`,
      `HttpOnly`,
      `SameSite=Lax`,
      cookieSecure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${
      cookieSecure ? "; Secure" : ""
    }`
  );
}

const tokenFrom = (req) => parseCookies(req.headers.cookie)[COOKIE];

// Every request carries whoever the session belongs to, or nobody.
async function attachUser(req, _res, next) {
  try {
    req.user = await userForToken(pool, tokenFrom(req));
    next();
  } catch (err) {
    next(err);
  }
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  next();
}

function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  if (req.user.role !== "owner") return res.status(403).json({ error: "owner_only" });
  next();
}

// Restocking is the shift's job, not the register's. Now that stock only moves
// through this route and the sale route, this is a real restriction rather than a
// hidden tab: a register can take out what a bowl consumes and nothing else.
function requireStockKeeper(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  if (req.user.role !== "owner" && req.user.role !== "manager") {
    return res.status(403).json({ error: "manager_only" });
  }
  next();
}

app.use("/api", attachUser);

// Before any account exists the app has nothing to authenticate against, so it
// offers to create the owner. Once one exists this closes for good.
app.get("/api/auth/state", async (_req, res, next) => {
  try {
    res.json({ needsSetup: (await countUsers(pool)) === 0 });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/setup", async (req, res, next) => {
  try {
    if ((await countUsers(pool)) > 0) {
      return res.status(409).json({ error: "already_set_up" });
    }
    const { username, name, password } = req.body || {};
    await createUser(pool, { username, name, password, role: "owner" });
    const session = await login(pool, username, password);
    sessionCookie(res, session.token, session.expires);
    res.json({ user: session.user });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const session = await login(pool, username, password);
    if (!session) return res.status(401).json({ error: "bad_credentials" });
    sessionCookie(res, session.token, session.expires);
    res.json({ user: session.user });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    await logout(pool, tokenFrom(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  res.json({ user: req.user });
});

// Staff management, owner only.
app.get("/api/users", requireOwner, async (_req, res, next) => {
  try {
    res.json({ users: await listUsers(pool) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/users", requireOwner, async (req, res, next) => {
  try {
    const { username, name, password, role } = req.body || {};
    // The owner account is created once, by first-run setup. Staff added here are
    // managers or register staff, matching what the Team screen offers.
    if (role && role !== "manager" && role !== "employee") {
      return res.status(400).json({ error: "role_invalid" });
    }
    res.json({ user: await createUser(pool, { username, name, password, role }) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.post("/api/users/:id/password", requireOwner, async (req, res, next) => {
  try {
    await setPassword(pool, req.params.id, (req.body || {}).password);
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

app.delete("/api/users/:id", requireOwner, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "cannot_deactivate_self" });
    }
    await deactivateUser(pool, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Generic key/value store backing src/lib/storage.js's get/set/delete —
// the app only ever persists two keys today (shop data, menu config),
// but the endpoint doesn't need to know that. Signed in only: the shop's
// inventory and takings are not public.
// Sales are appended rather than written as part of a whole-shop blob, so a register
// coming back from offline replays its queue without flattening what the others sold
// in the meantime. See server/sales.js.
app.use("/api/sales", requireUser);

app.get("/api/sales", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    res.json({ sales: await listSales(pool, { days }) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/sales", async (req, res, next) => {
  try {
    const { sale, consumption } = req.body || {};
    if (!sale || typeof sale !== "object" || !sale.id) {
      return res.status(400).json({ error: "sale_with_id_required" });
    }
    // Who rang it up comes from the session, not from the browser: a register should
    // not be able to put someone else's name on a sale.
    const stamped = { ...sale, userId: req.user.id, userName: req.user.name };
    res.json(await recordSale(pool, { sale: stamped, consumption }));
  } catch (err) {
    next(err);
  }
});

app.post("/api/sales/:id/void", async (req, res, next) => {
  try {
    const { consumption } = req.body || {};
    const result = await voidSale(pool, { id: req.params.id, by: req.user, consumption });
    if (!result.found) return res.status(404).json({ error: "not_found" });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/stock", requireStockKeeper, async (req, res, next) => {
  try {
    const { deltas } = req.body || {};
    if (!Array.isArray(deltas)) return res.status(400).json({ error: "deltas_required" });
    await adjustStock(pool, deltas);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use("/api/kv", requireUser);

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
  let sslFlips = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSchema();
      return;
    } catch (err) {
      if (usingSsl && !relaxedCert && certRejected(err)) {
        relaxedCert = true;
        console.log(
          `Could not verify the database's certificate (${err.code || err.message}) — ` +
            "keeping the connection encrypted but skipping certificate verification."
        );
        await pool.end().catch(() => {});
        pool = createPool(true, true);
        continue;
      }
      let flip = sslFlips < 1 ? sslMismatch(err) : null;
      if (!flip && sslFlips < 1 && handshakeDropped(err)) {
        flip = usingSsl ? "off" : "on";
        console.log(`Handshake dropped (${err.message}) — trying SSL ${flip}.`);
      }
      if (flip) {
        sslFlips++;
        usingSsl = flip === "on";
        console.log(`Reconnecting with SSL ${flip}.`);
        await pool.end().catch(() => {});
        pool = createPool(usingSsl, relaxedCert);
        continue;
      }
      const transient =
        err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || handshakeDropped(err);
      if (!transient || attempt >= attempts) throw err;
      console.log(
        `Database not reachable yet (${err.code}), attempt ${attempt}/${attempts} — retrying in ${delayMs / 1000}s…`
      );
      await sleep(delayMs);
    }
  }
}

console.log(`Connecting to ${dbHost}:${dbPort} (SSL ${usingSsl ? "on" : "off"})…`);
connectWithRetry()
  .then(async () => {
    await pruneExpiredSessions(pool).catch(() => {});
    app.listen(port, () => console.log(`Quick Açaí server listening on :${port}`));
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
            "the name simply never resolved, even after retrying. Two things cause this:",
            "",
            "  1. The database service is not running. Open it in Railway and check that",
            "     its latest deployment succeeded.",
            "  2. Private networking is unavailable to this service. It is IPv6-only and",
            "     has to be enabled for the environment.",
            "",
            "To sidestep the private network entirely, point DATABASE_URL at the database's",
            "public endpoint instead — it routes over the internet and always resolves:",
            "",
            "    ${{Postgres.DATABASE_PUBLIC_URL}}",
            "",
            "(SSL is negotiated automatically for public hosts.)",
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
    if (handshakeDropped(err)) {
      console.error(
        [
          `${dbHost}:${dbPort} accepted the connection and then closed it, with SSL on and off alike.`,
          "",
          `The server received: ${describeConnection()}`,
          "",
          "The address is reachable, so this is not a networking or SSL problem: something",
          "is listening but no database is answering behind it. On Railway that means the",
          "endpoint is the public TCP proxy while the database service itself is not running.",
          "",
          "Open the database service in Railway and check its Deployments tab. A service can",
          "keep its variables — so ${{Postgres.DATABASE_URL}} still resolves — while having no",
          "running deployment at all. Redeploy it, or check its logs if it is crash-looping.",
        ].join("\n")
      );
      process.exit(1);
    }
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
