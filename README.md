# Quick Açaí

Point-of-sale, inventory, and reports app for an açaí bowl location.
Built with React + Vite + Tailwind, backed by a small Express + Postgres
API so every register/tablet pointed at the same deployment shares live
inventory and sales.

## Menu

It starts with 9 flavors (Organic Pure Açaí, Cacao Cream, Piña Colada Spirulina,
Coconut Cream, Passion Fruit Cream, Dragon Fruit Sorbet, Mango Cream, Spicy
Mango, Matcha Cream), 3 sizes (Small $9.99 / Medium $14.99 / Large $18.99), and
28 toppings across Dairy, Nuts, Fruits, and Others at $0.99 each — with Granola,
Strawberry, Banana, and Peanut Butter included free (removable).

**The owner edits all of it in the app**, under **Team → Prices / Free toppings /
Flavors / Toppings**: prices by size, what an extra topping costs, which toppings
come free, and adding, renaming or removing flavors and toppings. No code change,
no redeploy.

Adding a flavor or topping also creates the ingredient it consumes, starting at
zero stock — the app should not claim to have something in the store room that
nobody put there, so restock it under **Inventory** before selling it. Removing
one takes it off the menu but leaves its ingredient and whatever stock is left,
and past sales keep the name and price they were charged.

`defaultMenu()` and `defaultIngredients()` in `src/App.jsx` are only the starting
point for a brand-new deployment.

## Taking an order

The register walks one decision per screen, and nothing advances on its own — each
screen ends in **Continue**:

1. **Size** → 2. **Flavor** → 3. **Included** (the four free toppings, tap to remove)
→ 4. **Dairy** → 5. **Nuts** → 6. **Fruit** → 7. **Other toppings** → 8. **Review**.

The four paid categories each get a screen to themselves so a customer is asked one
question at a time and nothing is added while scrolling past it. Every screen carries
the choices already made — size and flavor in the chip beside **Back**, toppings in
the summary above **Continue** — so the bowl being built is readable without stepping
back. Back walks one screen at a time; the progress dots jump anywhere.

The wizard is data, not hard-coded screen numbers: `STEPS` in `src/App.jsx` is built
from `CATEGORY_ORDER`, so adding or reordering a paid category changes the flow
without renumbering anything.

## Local development

Requires a Postgres database. Point `DATABASE_URL` at one — either a local
instance or a free one (Railway, Neon, etc.):

```bash
cp .env.example .env   # then edit DATABASE_URL
npm install
npm run dev
```

`npm run dev` runs the Vite dev server (`http://localhost:5173`) and the
API server (`http://localhost:4000`) together; Vite proxies `/api/*`
requests to the API. To run them separately: `npm run dev:web` and
`npm run dev:api`.

## Deploying with an external database (Neon, Supabase, …)

Any Postgres works — the database does not have to live on the same host as the
app. This is often the simplest route, and it avoids Railway's private-network
setup entirely:

1. Copy the connection string from your provider (Neon: **Dashboard → your
   project → Connect**). It looks like
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`.
2. Paste it as the app service's `DATABASE_URL` — the literal value, no variable
   reference needed.
3. Deploy. The app creates its table on first start.

SSL is handled automatically: a provider certificate is verified normally, and a
certificate that cannot be verified falls back to an encrypted-but-unverified
connection rather than failing the deploy. Databases that sleep when idle are
fine too — startup retries while the instance wakes.

## Deploying on Railway

1. Push this folder to a GitHub repo (or point Railway at it directly).
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Add a **Postgres** database to the project (**New → Database → Add
   PostgreSQL**).
4. Give the app service the connection string. Railway scopes variables to a
   single service, so the database's `DATABASE_URL` is **not** shared with the
   app on its own — you have to reference it. In the **app** service open
   **Variables → New Variable** and add:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

   (Replace `Postgres` with the database service's name if you renamed it.)
   Skipping this step is what produces `DATABASE_URL is not set` in the deploy
   logs.
5. Set:
   - **Build command**: `npm install && npm run build`
   - **Start command**: `npm start`
6. Railway sets `PORT` automatically — `server/index.js` already reads it,
   so no extra config is needed.

Once it's up, `https://<your-app>.up.railway.app/api/health` returns
`{"ok":true}` when the server can reach the database.

`npm start` runs `server/index.js`, which serves both the API and the
built frontend (`dist/`) on the same port — one service, no CORS.

## Staff accounts

Nothing in the app is reachable without signing in, and the API enforces it —
`/api/kv/*` answers 401 without a session, so the shop's inventory and takings
are not readable by anyone who finds the URL.

- **First run.** With no accounts yet, the app offers to create the owner's
  account instead of showing a login form nobody could answer. Once one exists,
  that screen closes permanently.
- **Roles** (`src/lib/roles.js` is the single source of truth):

  | | Sales | Inventory | Reports | Staff accounts |
  |---|---|---|---|---|
  | **Owner** | ✅ | ✅ | ✅ | ✅ |
  | **Manager** | ✅ | ✅ | ✅ | — |
  | **Staff** | ✅ | — | ✅ | — |

  The owner account is created once by first-run setup; the Team screen hands
  out Manager and Staff, and the API refuses any other role.
- **Staff.** The owner adds them under **Team**, each with their own username
  and password. Every sale records who rang it up, and Reports breaks the day's
  takings down per person.
- **Removing access** deactivates the account rather than deleting it, so past
  sales keep their attribution, and drops that person's sessions immediately.
- **Passwords** are stored as scrypt hashes with a per-password salt (see
  `server/auth.js`) — never in plain text. Sessions are random tokens kept in the
  database and sent as an httpOnly cookie, so page scripts cannot read them.

Two limits worth knowing, both from the same cause. Sales *and* stock levels live
in one shop-data JSON blob that the browser writes, and selling has to decrement
stock, so at the API level a sale and a manual restock are the same write:

- The **server does not enforce sale attribution** — a signed-in employee could
  in principle edit whose name is on a sale.
- The **inventory restriction is in the app, not the API** — the tab is hidden
  and unreachable for register staff, but `/api/kv` cannot tell a restock from a
  sale, so it cannot reject one.

Both close the same way: move sales and inventory out of the blob into their own
tables and endpoints. Worth doing if these ever need to settle a dispute rather
than keep honest people out of the wrong screen.

## Sales tax

US menus quote prices before tax, so the bowl prices stay as listed and tax is
added at checkout. The rate is whatever the shop's address is subject to —
state, county and city each set their own, and prepared food is frequently rated
apart from groceries — so there is no default worth guessing: it starts at none
and the owner sets it under **Team → Sales tax**. Until then nothing is charged
and the menu price is what the customer pays.

Each sale stores the rate that was in force and its share of the order's tax, so
a rate change later does not rewrite what older sales were charged. Reports keep
the two apart: **Sales today** is takings before tax, with the amount actually
taken beside it, and **Sales tax collected today** is the separate figure — that
money is held for the state, not revenue.

## Flavor and topping photos

`src/assets/flavors/` and `src/assets/toppings/` are picked up by filename: drop
`mango_cream.jpg` into the flavors folder and that flavor starts showing it —
in the picker, and as the scoop inside the bowl. Toppings work the same way and
show up both in the chips and on the açaí.

`src/assets/PHOTOS.md` lists the exact filename each of the 9 flavors and 28
toppings expects. Accepted: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`; square
images look best.

`src/assets/bowls/` is the one to start with, and takes priority over the other
two. It holds a photo of each flavor's **base bowl** — that flavor made up with
the four free toppings and nothing else. It is not a finished dish; it is where
most orders start.

**The bowl only ever shows real photos.** A flavor without one leaves the bowl
empty, and a topping without one adds nothing to it — nothing stands in for food
that has not been photographed, so the preview is never a guess at what the
customer will get.

Because of that, the preview also says what it is leaving out. Adding a paid
topping that has no photo yet keeps the base bowl and prints *Plus <name> — not
pictured* across the bottom, so a plated-looking bowl is never mistaken for the
whole order. Removing one of the free toppings drops the base photo entirely,
since it would be showing food the customer is not getting.

Photos can therefore be added a few at a time: each one that lands starts
appearing on its own. The colored dots beside topping names in the picker are
unaffected; those are list markers, not a picture of the dish.

## How the shared backend works

- `server/index.js` is a small Express app with one generic endpoint,
  `GET/PUT/DELETE /api/kv/:key`, backed by a `kv_store(key, value)` table
  in Postgres (created automatically on startup).
- `src/lib/storage.js` calls that endpoint instead of `localStorage`.
  `App.jsx` never changed — it only ever calls `storage.get(key)` /
  `storage.set(key, value)`, so any register/tablet pointed at the same
  deployment reads and writes the same inventory and sales data.

## Project structure

```
server/
  index.js         — Express API (Postgres-backed key/value store) + static frontend host
src/
  App.jsx          — the whole app (POS wizard, inventory, reports)
  lib/storage.js    — persistence layer, calls the /api/kv/:key endpoint
  main.jsx          — React entry point
  index.css         — Tailwind entry
```
