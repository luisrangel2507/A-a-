# Açaí Control

Point-of-sale, inventory, and reports app for an açaí bowl location.
Built with React + Vite + Tailwind, backed by a small Express + Postgres
API so every register/tablet pointed at the same deployment shares live
inventory and sales.

## Menu

9 flavors (Organic Pure Açaí, Cacao Cream, Piña Colada Spirulina, Coconut
Cream, Passion Fruit Cream, Dragon Fruit Sorbet, Mango Cream, Spicy Mango,
Matcha Cream), 3 sizes (Small $9.99 / Medium $14.99 / Large $18.99), and 28
toppings across Dairy, Nuts, Fruits, and Others at $0.99 each — with Granola,
Strawberry, Banana, and Peanut Butter included free by default (removable).
All of this lives in `defaultMenu()` and `defaultIngredients()` in
`src/App.jsx` — edit those two functions to change prices, flavors, or
toppings.

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
- **Employees.** The owner adds them under **Team**, each with their own
  username and password. Every sale records who rang it up, and Reports breaks
  the day's takings down per person.
- **Removing access** deactivates the account rather than deleting it, so past
  sales keep their attribution, and drops that person's sessions immediately.
- **Passwords** are stored as scrypt hashes with a per-password salt (see
  `server/auth.js`) — never in plain text. Sessions are random tokens kept in the
  database and sent as an httpOnly cookie, so page scripts cannot read them.

One limitation worth knowing: sales live inside the shop-data JSON blob that the
browser writes, so the *server* does not enforce the attribution on each sale —
a signed-in employee could in principle edit it. Making that tamper-proof means
moving sales into their own table, which is a worthwhile change if attribution
ever needs to settle a dispute rather than just show who was busy.

## Flavour and topping photos

`src/assets/flavors/` and `src/assets/toppings/` are picked up by filename: drop
`mango_cream.jpg` into the flavours folder and that flavour starts showing it —
in the picker, and as the scoop inside the bowl. Toppings work the same way and
show up both in the chips and on the açaí.

`src/assets/IMAGENES.md` lists the exact filename each of the 9 flavours and 28
toppings expects. Accepted: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`; square
images look best.

**The bowl only ever shows real photos.** A flavour without one leaves the bowl
empty, and a topping without one adds nothing to it — nothing stands in for food
that has not been photographed, so the preview is never a guess at what the
customer will get. Photos can therefore be added a few at a time: each one that
lands starts appearing on its own. The coloured dots beside topping names in the
picker are unaffected; those are list markers, not a picture of the dish.

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
