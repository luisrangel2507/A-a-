// Selling when the connection is not there.
//
// A register that stops taking money because the wifi dropped is worse than no
// register at all, so a sale that cannot reach the server is written to the browser
// and sent later. What makes that safe rather than reckless is that a sale is an
// append with an id the register generated: replaying the queue after a reconnect
// re-sends work nobody else has done, and re-sending the same sale twice does
// nothing the second time (see server/sales.js).
//
// The queue survives a reload and a closed lid, because "offline" in a shop often
// means the tablet also gets restarted.

import { SessionExpiredError } from "./storage";

const QUEUE_KEY = "pending-sales-v1";

// A failure to reach the server at all, as opposed to the server saying no. Only
// the first is worth queueing: a rejected sale will be rejected again.
function isNetworkFailure(err) {
  return err instanceof TypeError || err?.name === "AbortError";
}

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(ops) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch {
    // A full or blocked localStorage means the queue cannot be kept. Nothing useful
    // to do here beyond not crashing the sale that is happening right now.
  }
}

function enqueue(op) {
  writeQueue([...readQueue(), op]);
}

// The last list the server gave this device, so an offline start has a day to show.
const MIRROR_KEY = "sales-mirror-v1";

function readMirror() {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMirror(list) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(list));
  } catch {
    // Same as the queue: nothing useful to do, and not worth failing a sale over.
  }
}

async function send(op) {
  const url = op.kind === "void" ? `/api/sales/${encodeURIComponent(op.id)}/void` : "/api/sales";
  const body = op.kind === "void" ? { consumption: op.consumption } : { sale: op.sale, consumption: op.consumption };
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new SessionExpiredError();
  // A void of a sale the server has never heard of is not an error to retry forever:
  // it is a queued sale that will be voided the moment its own insert lands, so the
  // ordering of the queue takes care of it.
  if (!res.ok && res.status !== 404) throw new Error(`${op.kind} failed: ${res.status}`);
  return res.ok ? res.json() : { skipped: true };
}

const sales = {
  pending() {
    return readQueue().length;
  },

  // Restocking as a delta. Not queued: it is a manager standing at the shelf, and a
  // stock count that silently applies an hour later is worse than one that fails now.
  async adjustStock(deltas) {
    const res = await fetch("/api/stock", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltas }),
    });
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) throw new Error(`Stock update failed: ${res.status}`);
    return res.json();
  },

  /**
   * The day's sales. With no connection, the last list this device saw plus whatever
   * it has taken since — otherwise a reload mid-outage would show an empty day while
   * the drawer says otherwise.
   */
  async list(days = 30) {
    let res;
    try {
      res = await fetch(`/api/sales?days=${days}`, { credentials: "same-origin" });
    } catch (err) {
      if (!isNetworkFailure(err)) throw err;
      const mirrored = readMirror();
      const queuedSales = readQueue()
        .filter((op) => op.kind === "sale")
        .map((op) => op.sale);
      const voidedIds = new Set(readQueue().filter((op) => op.kind === "void").map((op) => op.id));
      const seen = new Set(mirrored.map((s) => s.id));
      return {
        stale: true,
        sales: [...mirrored, ...queuedSales.filter((s) => !seen.has(s.id))].map((s) =>
          voidedIds.has(s.id) ? { ...s, voided: true } : s
        ),
      };
    }
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) throw new Error(`Failed to load sales: ${res.status}`);
    const data = await res.json();
    writeMirror(data.sales || []);
    return { stale: false, sales: data.sales || [] };
  },

  /**
   * Record a sale. Returns { queued: true } when it went to the local queue instead
   * of the server — the caller has already taken the money either way, so this is
   * something to show, not something to fail on.
   */
  async record(sale, consumption) {
    const op = { kind: "sale", sale, consumption, at: Date.now() };
    // Anything already waiting has to go first, or the day arrives out of order.
    if (readQueue().length > 0) {
      enqueue(op);
      return { queued: true };
    }
    try {
      await send(op);
      return { queued: false };
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      if (!isNetworkFailure(err)) throw err;
      enqueue(op);
      return { queued: true };
    }
  },

  async void(id, consumption) {
    const op = { kind: "void", id, consumption, at: Date.now() };
    if (readQueue().length > 0) {
      enqueue(op);
      return { queued: true };
    }
    try {
      await send(op);
      return { queued: false };
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      if (!isNetworkFailure(err)) throw err;
      enqueue(op);
      return { queued: true };
    }
  },

  /**
   * Send everything waiting, oldest first, stopping at the first one that cannot go
   * — the rest stay queued in order rather than being reordered around a failure.
   * Returns how many went and how many are left.
   */
  async flush() {
    let queue = readQueue();
    let sent = 0;
    while (queue.length > 0) {
      try {
        await send(queue[0]);
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        if (isNetworkFailure(err)) break;
        // A sale the server refuses on its merits would block the queue forever, so
        // it is dropped rather than left to jam everything behind it.
        console.warn("Dropping a queued sale the server rejected:", err);
      }
      queue = queue.slice(1);
      writeQueue(queue);
      sent += 1;
    }
    return { sent, remaining: queue.length };
  },
};

export default sales;
