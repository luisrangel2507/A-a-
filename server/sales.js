// Sales as their own table, appended one at a time.
//
// They used to live inside the shop-data blob, which the browser rewrote whole on
// every sale. That is fine while there is one register on a good connection and
// wrong the moment there is not: two registers saving at once, or one coming back
// from offline with a queue, would write their idea of the whole day and silently
// drop everybody else's sales.
//
// Appending fixes that. A sale carries the id the client generated, so replaying a
// queued one after a reconnect cannot double-charge — the insert simply does
// nothing the second time.
//
// Stock moves with the sale, in the same transaction. The client sends what the
// bowl consumes and the server applies it to the shop record under a row lock, so
// two registers selling the last of something cannot both decrement from the same
// stale number. This is also what stops a register from quietly writing whatever
// stock level it likes: the only stock change a sale can make is the one its own
// ingredients justify.

const SHOP_KEY = "shop-data-v3";

export async function ensureSalesSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      sold_at TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL,
      voided BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales (sold_at DESC);`);
  await migrateFromBlob(pool);
}

// One-time move of any sales already sitting in the blob. Runs inside a transaction
// and empties the blob's array afterwards, so there is exactly one place a sale
// lives and no chance of the two disagreeing about the day's takings.
async function migrateFromBlob(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT value FROM kv_store WHERE key = $1 FOR UPDATE", [SHOP_KEY]);
    if (rows.length === 0) {
      await client.query("COMMIT");
      return;
    }
    let blob;
    try {
      blob = JSON.parse(rows[0].value);
    } catch {
      await client.query("COMMIT");
      return;
    }
    const legacy = Array.isArray(blob.sales) ? blob.sales : [];
    if (legacy.length === 0) {
      await client.query("COMMIT");
      return;
    }
    for (const sale of legacy) {
      if (!sale || !sale.id) continue;
      await client.query(
        `INSERT INTO sales (id, sold_at, payload, voided)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [String(sale.id), sale.date || new Date().toISOString(), sale, Boolean(sale.voided)]
      );
    }
    delete blob.sales;
    await client.query("UPDATE kv_store SET value = $1, updated_at = now() WHERE key = $2", [
      JSON.stringify(blob),
      SHOP_KEY,
    ]);
    await client.query("COMMIT");
    console.log(`Moved ${legacy.length} sales out of the shop blob into the sales table.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Restocking, as a delta rather than a rewrite of the whole ingredient list. Two
 * registers can restock and sell at the same time without either flattening what
 * the other did.
 */
export async function adjustStock(pool, deltas) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await applyStock(client, deltas);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listSales(pool, { days = 30 } = {}) {
  const { rows } = await pool.query(
    `SELECT payload FROM sales WHERE sold_at > now() - ($1 || ' days')::interval ORDER BY sold_at ASC`,
    [String(days)]
  );
  return rows.map((r) => r.payload);
}

// Applies stock deltas to the shop record under a row lock. Negative to consume,
// positive to put back.
async function applyStock(client, deltas) {
  if (!Array.isArray(deltas) || deltas.length === 0) return;
  const { rows } = await client.query("SELECT value FROM kv_store WHERE key = $1 FOR UPDATE", [SHOP_KEY]);
  if (rows.length === 0) return;
  let blob;
  try {
    blob = JSON.parse(rows[0].value);
  } catch {
    return;
  }
  if (!Array.isArray(blob.ingredients)) return;
  for (const { id, amount } of deltas) {
    const ing = blob.ingredients.find((i) => i.id === id);
    if (!ing || !Number.isFinite(Number(amount))) continue;
    ing.stock = Math.max(0, Number(ing.stock || 0) + Number(amount));
  }
  await client.query("UPDATE kv_store SET value = $1, updated_at = now() WHERE key = $2", [
    JSON.stringify(blob),
    SHOP_KEY,
  ]);
}

/**
 * Record one sale and take its ingredients out of stock, both or neither.
 *
 * Idempotent on the sale's id: a queued sale replayed after a reconnect inserts
 * nothing the second time, and — this is the part that matters — does not decrement
 * the stock again either.
 */
export async function recordSale(pool, { sale, consumption }) {
  if (!sale || !sale.id) throw new Error("sale_id_required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `INSERT INTO sales (id, sold_at, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [String(sale.id), sale.date || new Date().toISOString(), sale]
    );
    const isNew = rowCount === 1;
    if (isNew) {
      await applyStock(
        client,
        (consumption || []).map(({ id, amount }) => ({ id, amount: -Math.abs(Number(amount) || 0) }))
      );
    }
    await client.query("COMMIT");
    return { recorded: isNew, duplicate: !isNew };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Void a sale and put its ingredients back, both or neither. Also idempotent:
 * voiding something already voided returns the stock once, not twice.
 */
export async function voidSale(pool, { id, by, consumption }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT payload, voided FROM sales WHERE id = $1 FOR UPDATE", [id]);
    if (rows.length === 0) {
      await client.query("COMMIT");
      return { found: false };
    }
    if (rows[0].voided) {
      await client.query("COMMIT");
      return { found: true, alreadyVoided: true, sale: rows[0].payload };
    }
    const payload = {
      ...rows[0].payload,
      voided: true,
      voidedAt: new Date().toISOString(),
      voidedById: by?.id || null,
      voidedByName: by?.name || null,
    };
    await client.query("UPDATE sales SET voided = TRUE, payload = $1 WHERE id = $2", [payload, id]);
    await applyStock(
      client,
      (consumption || []).map(({ id: ingId, amount }) => ({ id: ingId, amount: Math.abs(Number(amount) || 0) }))
    );
    await client.query("COMMIT");
    return { found: true, sale: payload };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
