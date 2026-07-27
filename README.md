# Açaí Control

Point-of-sale, inventory, and reports app for a single açaí bowl location.
Built with React + Vite + Tailwind. No backend required to run locally —
data is persisted to the browser's `localStorage` via `src/lib/storage.js`.

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

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Deploying on Railway

1. Push this folder to a GitHub repo (or point Railway at it directly).
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Railway will detect the Node app. Set:
   - **Build command**: `npm install && npm run build`
   - **Start command**: `npm run preview`
4. Railway sets `PORT` automatically — `vite.config.js` and the `preview`
   script already read it, so no extra config is needed.

That's it for a single-register setup. See "Next steps" below for
multi-device / multi-register sync.

## Next steps (when you're ready to scale past one register)

Right now inventory and sales are stored per-browser in `localStorage`,
which is perfect for one tablet/register but won't sync across two devices.
When you need that:

1. Add a small API (Railway + Postgres, or reuse your Neon setup from
   QualityTrack) with two endpoints: `GET/PUT /api/shop-data` and
   `GET/PUT /api/menu-config`.
2. Swap the implementation in `src/lib/storage.js` to call that API instead
   of `localStorage` — the rest of the app (`App.jsx`) doesn't need to
   change at all, since it only ever calls `storage.get(key)` /
   `storage.set(key, value)`.

## Project structure

```
src/
  App.jsx          — the whole app (POS wizard, inventory, reports)
  lib/storage.js    — persistence layer (localStorage today, swap for an API later)
  main.jsx          — React entry point
  index.css         — Tailwind entry
```
