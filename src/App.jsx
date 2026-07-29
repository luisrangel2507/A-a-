import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ShoppingBag,
  Package,
  BarChart3,
  Plus,
  AlertTriangle,
  X,
  Check,
  Users,
  ChevronLeft,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import storage, { SessionExpiredError } from "./lib/storage";
import salesApi from "./lib/sales";
import auth from "./lib/auth";
import { COLOR } from "./theme";
import { SignInScreen, TeamPanel } from "./Auth";
import MenuEditor from "./MenuEditor";
import { canSeeInventory, canVoidSale, canVoidAnySale, canCloseOut } from "./lib/roles";
import bowlImage from "./assets/bowl.jpg";
import markImage from "./assets/mark.png";

// Photos are picked up from the filesystem by name: drop mango_cream.jpg into
// assets/flavors/ and that flavour starts showing it, with no code change.
// See assets/PHOTOS.md for the filename each flavour and topping expects.
// Anything without a photo keeps using its colour, so they can be added one at a time.
const byFileName = (modules) =>
  Object.fromEntries(
    Object.entries(modules).map(([path, url]) => [
      path.split("/").pop().replace(/\.[^.]+$/, ""),
      url,
    ])
  );

const FLAVOR_PHOTOS = byFileName(
  import.meta.glob("./assets/flavors/*.{jpg,jpeg,png,webp,avif}", {
    eager: true,
    query: "?url",
    import: "default",
  })
);

const TOPPING_PHOTOS = byFileName(
  import.meta.glob("./assets/toppings/*.{jpg,jpeg,png,webp,avif}", {
    eager: true,
    query: "?url",
    import: "default",
  })
);

// A finished bowl, photographed as the shop actually serves it: that flavour with
// the four free toppings and nothing else. Named after the flavour, so
// assets/bowls/coconut.jpg is the standard Coconut Cream bowl. This is the
// default preview whenever the order is exactly that — no assembling required.
const BOWL_PHOTOS = byFileName(
  import.meta.glob("./assets/bowls/*.{jpg,jpeg,png,webp,avif}", {
    eager: true,
    query: "?url",
    import: "default",
  })
);

const STORAGE_SHOP = "shop-data-v3";
const STORAGE_MENU = "menu-config-v3";
const TOPPING_PRICE = 0.99;
const CATEGORY_ORDER = ["Dairy", "Nuts", "Fruits", "Others"];
// The heading a category gets when it has the screen to itself; "Add others" does
// not read as English, and the picker's own labels stay short for the dots.
const CATEGORY_TITLE = {
  Dairy: "Dairy",
  Nuts: "Nuts",
  Fruits: "Fruit",
  Others: "Other toppings",
};

// The order of the wizard, as data. Each paid category is a screen of its own, so
// the list is long enough that hard-coded step numbers would be a liability —
// inserting one screen would silently renumber every branch after it.
const STEPS = [
  { key: "size", label: "Size" },
  { key: "flavor", label: "Flavor" },
  { key: "included", label: "Included" },
  ...CATEGORY_ORDER.map((cat) => ({ key: `cat:${cat}`, label: cat, category: cat })),
  { key: "review", label: "Review" },
];
const stepIndex = (key) => STEPS.findIndex((s) => s.key === key);

// 0.0825 reads as 8.25%, and 0.08 as 8% — no trailing zeros to misread as a typo.
const formatRate = (rate) =>
  `${Number((rate * 100).toFixed(4))
    .toString()
    .replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m))}%`;

const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

// What one bowl takes out of the store room: its flavour base, scaled by size, plus
// a serving of each topping. Shared by selling and by voiding, so a void puts back
// exactly what the sale took — the two can never drift apart.
function consumptionFor(sale, menu, ingredients) {
  const out = [];
  const product = menu.products.find((p) => p.id === sale.productId);
  if (product) {
    const base = ingredients.find((i) => i.id === product.baseIngredientId);
    if (base) out.push({ id: base.id, amount: base.per * product.baseUnits[sale.size] });
  }
  (sale.toppingIds || []).forEach((tid) => {
    const t = menu.toppings.find((tp) => tp.id === tid);
    const ing = t && ingredients.find((i) => i.id === t.ingredientId);
    if (ing) out.push({ id: ing.id, amount: ing.per });
  });
  return out;
}

const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Defaults ----------
function defaultIngredients() {
  const flavorBases = [
    ["acai_base", "Organic Pure Açaí base", "#4B1D3F"],
    ["cacao_base", "Cacao Cream base", "#3C2415"],
    ["pina_base", "Piña Colada Spirulina base", "#B9D46A"],
    ["coconut_base", "Coconut Cream base", "#F5F1E6"],
    ["passion_base", "Passion Fruit Cream base", "#F0B429"],
    ["dragon_base", "Dragon Fruit Sorbet base", "#E85D9C"],
    ["mango_cream_base", "Mango Cream base", "#F2994A"],
    ["spicy_mango_base", "Spicy Mango base", "#E8703A"],
    ["matcha_base", "Matcha Cream base", "#8BAA36"],
  ].map(([id, name, color]) => ({ id, name, unit: "ml", stock: 6000, low: 1500, per: 220, color }));

  const toppingIngredients = [
    ["condensed_milk", "Condensed milk", "ml", 15, "#F5EFC8"],
    ["nido", "Nido (Dry Milk)", "g", 10, "#FFFDF6"],
    ["choc_drizzle", "Chocolate Drizzle", "ml", 12, "#3B2418"],
    ["chia_pudding", "Chia Pudding", "g", 25, "#DCD9C9"],
    ["overnight_oats", "Overnight Oats", "g", 25, "#E7D9BE"],
    ["nutella", "Nuttela", "g", 15, "#3C2415"],
    ["cacao_nibs", "Cacao Nibs", "g", 10, "#4A2E22"],
    ["almond_butter", "Almond Butter", "g", 15, "#C69C6D"],
    ["diced_almonds", "Diced Almonds", "g", 15, "#D9C29A"],
    ["peanuts", "Peanuts", "g", 15, "#C68A45"],
    ["peanut_butter", "Peanut Butter", "g", 15, "#B5651D"],
    ["blueberry", "Blueberry", "g", 25, "#4C5B8C"],
    ["banana", "Banana", "pcs", 0.5, "#E9D65B"],
    ["strawberry", "Strawberry", "g", 30, "#D6455B"],
    ["mango", "Mango", "g", 30, "#F2994A"],
    ["pineapple", "Pineapple", "g", 30, "#F0D149"],
    ["dates", "Dates", "pcs", 1, "#6B3B29"],
    ["granola", "Granola", "g", 25, "#C9A66B"],
    ["chia_seeds", "Chia Seeds", "g", 8, "#3A3A3A"],
    ["hemp_seeds", "Hemp Seeds", "g", 8, "#A9A67E"],
    ["goji_berry", "Goji Berry", "g", 10, "#C0392B"],
    ["coconut_flakes", "Coconut Flakes", "g", 10, "#F5F1E6"],
    ["toasted_coconut", "Toasted Coconut", "g", 10, "#D8C39A"],
    ["protein_powder", "Protein Powder", "g", 20, "#E0D9CE"],
    ["oreo", "Oreo", "g", 15, "#2B2320"],
    ["sprinkles", "Sprinkles", "g", 6, "#E85D9C"],
    ["agave", "Agave", "ml", 12, "#C99A3E"],
    ["honey", "Honey", "ml", 12, "#E3A857"],
  ].map(([id, name, unit, per, color]) => ({
    id,
    name,
    unit,
    per,
    stock: unit === "pcs" ? 60 : 2000,
    low: unit === "pcs" ? 15 : 500,
    color,
  }));

  return [...flavorBases, ...toppingIngredients];
}

function defaultMenu() {
  const sizes = { small: 9.99, medium: 14.99, large: 18.99 };
  const baseUnits = { small: 1, medium: 1.4, large: 1.8 };

  const products = [
    { id: "acai", name: "Organic Pure Açaí", baseIngredientId: "acai_base", color: "#4B1D3F", sizes, baseUnits },
    { id: "cacao", name: "Cacao Cream", baseIngredientId: "cacao_base", color: "#3C2415", sizes, baseUnits },
    { id: "pina", name: "Piña Colada Spirulina", baseIngredientId: "pina_base", color: "#B9D46A", sizes, baseUnits },
    { id: "coconut", name: "Coconut Cream", baseIngredientId: "coconut_base", color: "#E8DFC0", sizes, baseUnits },
    { id: "passion", name: "Passion Fruit Cream", baseIngredientId: "passion_base", color: "#F0B429", sizes, baseUnits },
    { id: "dragon", name: "Dragon Fruit Sorbet", baseIngredientId: "dragon_base", color: "#E85D9C", sizes, baseUnits },
    { id: "mango_cream", name: "Mango Cream", baseIngredientId: "mango_cream_base", color: "#F2994A", sizes, baseUnits },
    { id: "spicy_mango", name: "Spicy Mango", baseIngredientId: "spicy_mango_base", color: "#E8703A", sizes, baseUnits },
    { id: "matcha", name: "Matcha Cream", baseIngredientId: "matcha_base", color: "#8BAA36", sizes, baseUnits },
  ];

  const toppings = [
    { id: "condensed_milk", name: "Condensed milk", category: "Dairy", ingredientId: "condensed_milk" },
    { id: "nido", name: "Nido (Dry Milk)", category: "Dairy", ingredientId: "nido" },
    { id: "choc_drizzle", name: "Chocolate Drizzle", category: "Dairy", ingredientId: "choc_drizzle" },
    { id: "chia_pudding", name: "Chia Pudding", category: "Dairy", ingredientId: "chia_pudding" },
    { id: "overnight_oats", name: "Overnight Oats", category: "Dairy", ingredientId: "overnight_oats" },
    { id: "nutella", name: "Nuttela", category: "Dairy", ingredientId: "nutella" },
    { id: "cacao_nibs", name: "Cacao Nibs", category: "Dairy", ingredientId: "cacao_nibs" },
    { id: "almond_butter", name: "Almond Butter", category: "Nuts", ingredientId: "almond_butter" },
    { id: "diced_almonds", name: "Diced Almonds", category: "Nuts", ingredientId: "diced_almonds" },
    { id: "peanuts", name: "Peanuts", category: "Nuts", ingredientId: "peanuts" },
    { id: "peanut_butter", name: "Peanut Butter", category: "Nuts", ingredientId: "peanut_butter" },
    { id: "blueberry", name: "Blueberry", category: "Fruits", ingredientId: "blueberry" },
    { id: "banana", name: "Banana", category: "Fruits", ingredientId: "banana" },
    { id: "strawberry", name: "Strawberry", category: "Fruits", ingredientId: "strawberry" },
    { id: "mango", name: "Mango", category: "Fruits", ingredientId: "mango" },
    { id: "pineapple", name: "Pineapple", category: "Fruits", ingredientId: "pineapple" },
    { id: "dates", name: "Dates", category: "Fruits", ingredientId: "dates" },
    { id: "granola", name: "Granola", category: "Others", ingredientId: "granola" },
    { id: "chia_seeds", name: "Chia Seeds", category: "Others", ingredientId: "chia_seeds" },
    { id: "hemp_seeds", name: "Hemp Seeds", category: "Others", ingredientId: "hemp_seeds" },
    { id: "goji_berry", name: "Goji Berry", category: "Others", ingredientId: "goji_berry" },
    { id: "coconut_flakes", name: "Coconut Flakes", category: "Others", ingredientId: "coconut_flakes" },
    { id: "toasted_coconut", name: "Toasted Coconut", category: "Others", ingredientId: "toasted_coconut" },
    { id: "protein_powder", name: "Protein Powder", category: "Others", ingredientId: "protein_powder" },
    { id: "oreo", name: "Oreo", category: "Others", ingredientId: "oreo" },
    { id: "sprinkles", name: "Sprinkles", category: "Others", ingredientId: "sprinkles" },
    { id: "agave", name: "Agave", category: "Others", ingredientId: "agave" },
    { id: "honey", name: "Honey", category: "Others", ingredientId: "honey" },
  ];

  return {
    products,
    toppings,
    toppingPrice: TOPPING_PRICE,
    includedToppingIds: ["granola", "strawberry", "banana", "peanut_butter"],
    // Sales tax is local — state, county and city each set their own, and prepared
    // food is often rated differently from groceries. There is no sane default to
    // guess, so it starts at none and the owner enters the shop's rate.
    taxRate: 0,
  };
}

// ---------- Small UI atoms ----------
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 py-2.5"
      style={{ color: active ? COLOR.forest : COLOR.inkSoft }}
    >
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
      <span className="text-xs font-medium tracking-wide">{label}</span>
      <div className="h-0.5 w-6 rounded-full" style={{ background: active ? COLOR.coral : "transparent" }} />
    </button>
  );
}

// What has been chosen so far, carried into the steps that follow it. Without it
// the flavour screen gives no way to check the size without going back for it.
function StepHeader({ onBack, parts = [] }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <BackLink onClick={onBack} />
      {parts.length > 0 && (
        <p
          className="truncate rounded-lg px-2 py-1 text-sm font-medium"
          style={{ background: COLOR.forestPale, color: COLOR.forest }}
        >
          {parts.join(" · ")}
        </p>
      )}
    </div>
  );
}

// A receipt covers one order — everything charged in a single checkout, which is
// what the customer handed over money for. Laid out to survive a print: no colour
// worth losing, and the print stylesheet in index.css hides the rest of the app so
// a phone or a till printer gets the slip and nothing else.
function Receipt({ order, menu, onClose }) {
  const line = (label, value, strong) => (
    <div className="flex items-baseline justify-between">
      <span style={{ fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span className="font-mono-num" style={{ fontWeight: strong ? 600 : 400 }}>{money(value)}</span>
    </div>
  );
  const paidLabel = order.payment === "cash" ? "Cash" : order.payment === "card" ? "Card" : "—";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6" style={{ background: "rgba(43,18,36,0.45)" }}>
      <div className="flex max-h-full w-full max-w-sm flex-col rounded-2xl" style={{ background: COLOR.card }}>
        <div className="no-print flex items-center justify-between px-4 pt-4">
          <p className="text-base font-semibold" style={{ color: COLOR.ink }}>Receipt</p>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1">
            <X size={18} color={COLOR.inkSoft} />
          </button>
        </div>

        <div className="receipt-sheet overflow-y-auto px-5 py-4 text-sm" style={{ color: "#000" }}>
          <p className="font-display text-center text-xl" style={{ color: "#000" }}>Quick Açaí</p>
          <p className="mt-0.5 text-center text-xs">
            {new Date(order.at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          {order.userName && <p className="text-center text-xs">Served by {order.userName}</p>}

          <div className="my-3 space-y-2 border-y py-3" style={{ borderColor: "#999" }}>
            {order.bowls.map((b) => {
              const extras = (b.toppingIds || [])
                .filter((id) => !menu.includedToppingIds.includes(id))
                .map((id) => menu.toppings.find((t) => t.id === id)?.name)
                .filter(Boolean);
              return (
                <div key={b.id} style={{ opacity: b.voided ? 0.5 : 1 }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ textDecoration: b.voided ? "line-through" : "none" }}>
                      {b.productName} · <span className="capitalize">{b.size}</span>
                    </span>
                    <span className="font-mono-num" style={{ textDecoration: b.voided ? "line-through" : "none" }}>
                      {money(b.price)}
                    </span>
                  </div>
                  {extras.length > 0 && (
                    <p className="text-xs" style={{ color: "#444" }}>+ {extras.join(", ")}</p>
                  )}
                  {b.voided && <p className="text-xs">VOIDED</p>}
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            {line("Subtotal", order.subtotal)}
            {order.tax > 0 && line(`Sales tax${order.bowls[0]?.taxRate ? ` (${formatRate(order.bowls[0].taxRate)})` : ""}`, order.tax)}
            {order.tip > 0 && line("Tip", order.tip)}
            <div className="border-t pt-1" style={{ borderColor: "#999" }}>
              {line("Total", order.gross, true)}
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span>Paid with</span>
              <span>{paidLabel}</span>
            </div>
          </div>

          <p className="mt-4 text-center text-xs">Thank you!</p>
        </div>

        <div className="no-print flex gap-2 px-4 pb-4 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border py-2.5 text-sm font-semibold"
            style={{ borderColor: COLOR.line, color: COLOR.inkSoft }}
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: COLOR.forest, color: "#fff" }}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

// Taking the money is a screen of its own, over the register rather than beside it:
// the tip has to be asked for before the card is run, and how they paid has to be
// recorded or the drawer cannot be settled at close.
function PaymentSheet({
  subtotal, tax, taxRate, tip, total, tipChoice, onTipChoice, tipCustom, onTipCustom,
  method, onMethod, cashGiven, onCashGiven, change, canCharge, saving, onCharge, onClose,
  closing,
}) {
  const state = closing ? "closing" : "open";
  const Row = ({ label, value, strong }) => (
    <div className="flex items-baseline justify-between">
      <span className={strong ? "text-base font-semibold" : "text-sm"} style={{ color: strong ? COLOR.ink : COLOR.inkSoft }}>
        {label}
      </span>
      <span
        className={`font-mono-num ${strong ? "text-xl font-semibold" : "text-sm"}`}
        style={{ color: strong ? COLOR.forest : COLOR.inkSoft }}
      >
        {money(value)}
      </span>
    </div>
  );
  return (
    <div
      className="sheet-scrim fixed inset-0 z-40 flex flex-col justify-end"
      data-state={state}
      style={{ background: "rgba(0,25,17,0.45)" }}
    >
      <div
        className="sheet-panel pad-home-indicator max-h-full w-full max-w-md self-center overflow-y-auto rounded-t-2xl px-4 pt-4"
        data-state={state}
        style={{ background: COLOR.card }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold" style={{ color: COLOR.ink }}>Take payment</p>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1">
            <X size={18} color={COLOR.inkSoft} />
          </button>
        </div>

        <div className="space-y-1 rounded-xl px-3 py-2.5" style={{ background: COLOR.bg }}>
          <Row label="Subtotal" value={subtotal} />
          {taxRate > 0 && <Row label={`Sales tax (${formatRate(taxRate)})`} value={tax} />}
          {tip > 0 && <Row label="Tip" value={tip} />}
          <div className="border-t pt-1.5" style={{ borderColor: COLOR.line }}>
            <Row label="Total" value={total} strong />
          </div>
        </div>

        <p className="mb-1.5 mt-3 text-sm font-semibold" style={{ color: COLOR.ink }}>Tip</p>
        <div className="grid grid-cols-4 gap-1.5">
          {[["No tip", 0], ["15%", 0.15], ["18%", 0.18], ["20%", 0.2]].map(([label, value]) => (
            <button
              key={label}
              onClick={() => onTipChoice(value)}
              className="rounded-xl border-2 py-2 text-sm font-medium"
              style={{
                borderColor: tipChoice === value ? COLOR.good : COLOR.line,
                background: tipChoice === value ? COLOR.goodPale : "transparent",
                color: COLOR.ink,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={() => onTipChoice("custom")}
            className="rounded-xl border-2 px-3 py-2 text-sm font-medium"
            style={{
              borderColor: tipChoice === "custom" ? COLOR.good : COLOR.line,
              background: tipChoice === "custom" ? COLOR.goodPale : "transparent",
              color: COLOR.ink,
            }}
          >
            Other
          </button>
          {tipChoice === "custom" && (
            <input
              inputMode="decimal"
              value={tipCustom}
              onChange={(e) => onTipCustom(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="font-mono-num w-full rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: COLOR.line, color: COLOR.ink }}
            />
          )}
        </div>

        <p className="mb-1.5 mt-3 text-sm font-semibold" style={{ color: COLOR.ink }}>Paid with</p>
        <div className="grid grid-cols-2 gap-2">
          {[["Cash", "cash"], ["Card", "card"]].map(([label, value]) => (
            <button
              key={value}
              onClick={() => onMethod(value)}
              className="rounded-xl border-2 py-3 text-base font-medium"
              style={{
                borderColor: method === value ? COLOR.forest : COLOR.line,
                background: method === value ? COLOR.forestPale : "transparent",
                color: COLOR.ink,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Counting change in your head at a queue is where cash drawers go wrong. */}
        {method === "cash" && (
          <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: COLOR.bg }}>
            <label className="text-xs font-medium" style={{ color: COLOR.inkSoft }}>
              Cash received (optional)
            </label>
            <input
              inputMode="decimal"
              value={cashGiven}
              onChange={(e) => onCashGiven(e.target.value)}
              placeholder={total.toFixed(2)}
              className="font-mono-num mt-1 w-full rounded-xl border px-3 py-2 text-base"
              style={{ borderColor: COLOR.line, color: COLOR.ink }}
            />
            {cashGiven !== "" && (
              <p
                className="mt-1.5 text-sm font-semibold"
                style={{ color: change < 0 ? COLOR.alert : COLOR.good }}
              >
                {change < 0
                  ? `${money(-change)} short`
                  : `Change ${money(change)}`}
              </p>
            )}
          </div>
        )}

        <button
          onClick={onCharge}
          disabled={!canCharge || saving}
          className="mb-4 mt-3 w-full rounded-xl py-3 text-base font-semibold"
          style={{
            background: canCharge && !saving ? COLOR.coral : COLOR.line,
            color: canCharge && !saving ? "#fff" : COLOR.inkSoft,
          }}
        >
          {saving ? "Charging…" : method ? `Charge ${money(total)}` : "Pick cash or card"}
        </button>
      </div>
    </div>
  );
}

// Nothing advances without this, and a long category pushes it past the fold, so it
// rides the bottom of the screen instead of waiting at the end of the list. Sticky
// rather than fixed: it only lifts when it would otherwise be off-screen, and it
// stays inside the card, so it is never floating over the order below.
function ContinueButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="sticky z-10 mt-1 w-full rounded-xl py-3 text-base font-semibold shadow-lg"
      style={{
        background: COLOR.forest,
        color: "#fff",
        bottom: "calc(var(--inset-bottom) + 5.5rem)",
      }}
    >
      Continue
    </button>
  );
}

// With each paid category on its own screen, what was chosen two screens ago is no
// longer on the page. This carries it forward, so the bowl being built is readable
// without stepping back through the wizard to check.
function ChosenToppings({ included, extras }) {
  if (included.length === 0 && extras.length === 0) return null;
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: COLOR.bg, border: `1px solid ${COLOR.line}` }}>
      {included.length > 0 && (
        <p className="text-xs" style={{ color: COLOR.inkSoft }}>
          <span className="font-semibold" style={{ color: COLOR.good }}>Included:</span>{" "}
          {included.join(", ")}
        </p>
      )}
      {extras.length > 0 && (
        <p className="text-xs" style={{ color: COLOR.inkSoft }}>
          <span className="font-semibold" style={{ color: COLOR.forest }}>Extras:</span>{" "}
          {extras.join(", ")}
        </p>
      )}
    </div>
  );
}

// Going back belongs at the top of a step, above what it undoes. Down beside the
// primary action it sat under the prices, one slip away from the button that
// commits them.
function BackLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-1 flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium"
      style={{ color: COLOR.inkSoft }}
    >
      <ChevronLeft size={16} /> Back
    </button>
  );
}

// The dot beside a topping's name, which becomes its photo once one exists —
// and grows, because a photo at swatch size is unreadable.
function ToppingSwatch({ toppingId, color }) {
  const photo = TOPPING_PHOTOS[toppingId];
  const size = photo ? 20 : 10;
  return (
    <span
      className="shrink-0 overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: color || "#ccc",
        border: "1px solid rgba(0,0,0,0.15)",
      }}
    >
      {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}

function StockBar({ pct, low }) {
  const c = low ? COLOR.alert : pct < 0.4 ? COLOR.coral : COLOR.good;
  return (
    <div className="h-2 w-full rounded-full" style={{ background: COLOR.line }}>
      <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(4, pct * 100)}%`, background: c }} />
    </div>
  );
}

// Readable progress bar: a big "Step X of N — Label" line plus tappable dots
function ProgressSteps({ step, onJump }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-center mb-2" style={{ color: COLOR.forest }}>
        Step {step + 1} of {STEPS.length} — {STEPS[step].label}
      </p>
      <div className="flex items-center gap-1.5">
        {STEPS.map(({ label }, i) => (
          <button
            key={label}
            onClick={() => onJump(i)}
            aria-label={`Go to ${label}`}
            className="flex-1 h-2.5 rounded-full transition-all"
            style={{ background: i <= step ? COLOR.forest : COLOR.line }}
          />
        ))}
      </div>
    </div>
  );
}

// Signature element: the bowl the shop actually serves in, filled with the chosen
// flavour and toppings. BOWL_INTERIOR locates the ceramic cavity within
// assets/bowl.jpg as fractions of the image, measured off the photo — everything
// is placed relative to it so the food lands inside the bowl at any size.
const BOWL_INTERIOR = { cx: 0.5074, cy: 0.4853, r: 0.3824 };
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function BowlPreview({ productId, toppingIds, includedToppingIds = [], toppings, ingredients, maxWidth = 236 }) {
  // The base bowl for this flavour: a photograph of it made up with the four free
  // toppings and nothing else. It is the starting point of most orders, not a
  // finished dish — anything paid still has to appear on top of it. Remove one of
  // the free toppings and the photo shows food the customer is not getting, so it
  // steps aside for the empty bowl.
  const basePhoto = productId ? BOWL_PHOTOS[productId] : null;
  const hasEveryFreeTopping = includedToppingIds.every((id) => toppingIds.includes(id));
  const useBasePhoto = Boolean(basePhoto && hasEveryFreeTopping);

  const chosen = toppingIds
    .filter((id) => !(useBasePhoto && includedToppingIds.includes(id))) // already in the base photo
    .map((id) => toppings.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => ({
      id: t.id,
      name: ingredients.find((i) => i.id === t.ingredientId)?.name || t.name,
      photo: TOPPING_PHOTOS[t.id],
    }));

  // Only real photos go in the bowl; an option without one is never invented.
  const active = chosen.filter((t) => t.photo);

  // But it cannot be left at that: a bowl that already looks like food would
  // otherwise read as the whole order while toppings are missing from it. What is
  // absent gets named instead of quietly dropped.
  const missing = chosen.filter((t) => !t.photo);

  const flavorPhoto = productId ? FLAVOR_PHOTOS[productId] : null;
  const showScoop = Boolean(flavorPhoto) && !useBasePhoto;
  const looksLikeFood = useBasePhoto || showScoop || active.length > 0;

  // The scoop sits a little inside the cavity, leaving a rim of ceramic visible.
  const fillR = BOWL_INTERIOR.r * 0.88;
  const shown = [
    ...(useBasePhoto ? ["what's included"] : showScoop ? ["the flavor"] : []),
    ...active.map((t) => t.name),
  ];
  const label =
    (shown.length === 0 ? "Empty bowl" : `Bowl with ${shown.join(", ")}`) +
    (missing.length > 0 ? `. Not pictured yet: ${missing.map((t) => t.name).join(", ")}` : "");

  return (
    <div
      className="relative mx-auto w-full"
      style={{ maxWidth, aspectRatio: "1 / 1" }}
      role="img"
      aria-label={label}
    >
      <img
        src={useBasePhoto ? basePhoto : bowlImage}
        alt=""
        className="absolute inset-0 h-full w-full rounded-2xl object-cover"
      />

      {/* The scoop, once there is a photo of this flavour. */}
      {showScoop && (
        <div
          className="absolute overflow-hidden rounded-full"
          style={{
            left: `${(BOWL_INTERIOR.cx - fillR) * 100}%`,
            top: `${(BOWL_INTERIOR.cy - fillR) * 100}%`,
            width: `${fillR * 200}%`,
            height: `${fillR * 200}%`,
            boxShadow: `inset 0 8px 18px rgba(0,0,0,0.32), 0 2px 10px rgba(58,22,48,0.28)`,
          }}
        >
          <img src={flavorPhoto} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      {/* Toppings that have a photo, on a sunflower spiral so any number spreads
          evenly instead of bunching into a ring. */}
      {active.map((t, idx) => {
        const angle = idx * GOLDEN_ANGLE;
        const rad = fillR * 0.76 * Math.sqrt((idx + 0.5) / active.length);
        const x = BOWL_INTERIOR.cx + rad * Math.cos(angle);
        const y = BOWL_INTERIOR.cy + rad * Math.sin(angle);
        return (
          <div
            key={t.id}
            title={t.name}
            className="absolute overflow-hidden rounded-full"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: "13%",
              height: "13%",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.42)",
            }}
          >
            <img src={t.photo} alt="" className="h-full w-full object-cover" />
          </div>
        );
      })}

      {/* Says what the picture is leaving out, so a bowl that looks plated is not
          mistaken for the whole order while toppings are still unphotographed. */}
      {looksLikeFood && missing.length > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 rounded-b-2xl px-2 py-1.5"
          style={{ background: "rgba(36,24,32,0.86)" }}
        >
          <p
            className="text-center text-[11px] font-medium leading-tight"
            style={{
              color: "#FCF7FA",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            Plus {missing.map((t) => t.name).join(", ")} — not pictured
          </p>
        </div>
      )}
    </div>
  );
}

export default function AcaiControlApp() {
  // Nothing in the app is reachable without a session: `me` is null until one
  // exists, and `checking` covers the moment before we know either way, so the
  // sign-in screen doesn't flash for someone who is already signed in.
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("pos");
  const [ingredients, setIngredients] = useState([]);
  const [sales, setSales] = useState([]);
  const [closeouts, setCloseouts] = useState([]);
  const [menu, setMenu] = useState(defaultMenu());
  const [cart, setCart] = useState([]);
  const [builder, setBuilder] = useState({ productId: null, size: null, toppingIds: [] });
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState(null);
  const [restockId, setRestockId] = useState(null);
  const [restockAmt, setRestockAmt] = useState("");
  const [newIngName, setNewIngName] = useState("");
  const [saving, setSaving] = useState(false);
  // Taking payment is its own screen rather than one Charge button: how they paid
  // has to be recorded to settle the drawer at close, and the tip has to be asked
  // for before the money changes hands.
  const [paying, setPaying] = useState(false);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [tipChoice, setTipChoice] = useState(0);
  const [tipCustom, setTipCustom] = useState("");
  const [payMethod, setPayMethod] = useState(null);
  const [cashGiven, setCashGiven] = useState("");
  // Voiding puts money and stock back, so it asks first.
  const [voiding, setVoiding] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [countedCash, setCountedCash] = useState("");
  // Sales taken on this device that the server has not acknowledged yet, and whether
  // we could reach it at all last time we tried.
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);
  const cartSectionRef = useRef(null);

  useEffect(() => {
    let alive = true;
    auth
      .me()
      .then((user) => {
        if (!alive) return;
        setMe(user);
        setChecking(false);
      })
      .catch(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, []);

  // Shop data is only fetched once there is a session — the endpoint refuses it otherwise.
  useEffect(() => {
    if (me) load();
  }, [me]);

  // Coming back online is the moment the queue matters. The browser's own event is
  // the fast path; the interval covers the case it lies, which it does — "online" only
  // means an interface is up, not that the server is reachable.
  // Read through refs, not through the closure. A sync calls setPending partway
  // through, and if those were dependencies that update would tear down the very
  // effect doing the syncing — the refetch that follows would be cancelled halfway,
  // leaving this register showing its own sales and none of the other one's.
  const syncState = useRef({ pending: 0, offline: false, busy: false });
  syncState.current.pending = pending;
  syncState.current.offline = offline;

  useEffect(() => {
    if (!me) return undefined;
    let alive = true;
    async function drain() {
      if (!alive || syncState.current.busy) return;
      const hadWork = syncState.current.pending > 0 || syncState.current.offline;
      syncState.current.busy = true;
      try {
        const { remaining } = await salesApi.flush();
        setPending(remaining);
        if (remaining === 0 && hadWork) {
          const fresh = await salesApi.list();
          if (fresh.stale) return;
          setSales(fresh.sales);
          // Stock moved on the server as the queue landed, so take it from there
          // rather than trusting this device's optimistic copy.
          const shop = await storage.get(STORAGE_SHOP);
          const parsed = JSON.parse(shop.value);
          if (parsed.ingredients) setIngredients(parsed.ingredients);
          showToast("Back online — sales synced");
        }
        setOffline(false);
      } catch (e) {
        if (e instanceof SessionExpiredError) handleStorageError(e);
        else setOffline(true);
      } finally {
        syncState.current.busy = false;
      }
    }
    const onOnline = () => drain();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      if (syncState.current.pending > 0 || syncState.current.offline) drain();
    }, 15000);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [me]);

  // Inventory belongs to the admin and whoever is running the shift.
  const showInventory = canSeeInventory(me?.role);

  // Whoever signs in next may not be allowed on the tab left open by the last person.
  useEffect(() => {
    if (tab === "inventario" && !showInventory) setTab("pos");
  }, [tab, showInventory]);

  // A session that lapses mid-shift drops back to the sign-in screen rather than
  // leaving the register looking functional while nothing saves.
  function handleStorageError(err, fallbackMessage) {
    if (err instanceof SessionExpiredError) {
      setMe(null);
      setReady(false);
      return true;
    }
    if (fallbackMessage) showToast(fallbackMessage, true);
    return false;
  }

  async function signOut() {
    try {
      await auth.logout();
    } catch {
      // Even if the request fails, drop the local session so the register locks.
    }
    setMe(null);
    setReady(false);
    setCart([]);
    setTab("pos");
  }

  async function load() {
    let ing = defaultIngredients();
    let sl = [];
    let co = [];
    let mn = defaultMenu();
    try {
      const shop = await storage.get(STORAGE_SHOP);
      if (shop && shop.value) {
        const d = JSON.parse(shop.value);
        if (d.ingredients) ing = d.ingredients;
        if (d.closeouts) co = d.closeouts;
      }
    } catch (e) {
      // A missing key is the first-run case: seed it. A lapsed session is not.
      if (handleStorageError(e)) return;
      try {
        await storage.set(STORAGE_SHOP, JSON.stringify({ ingredients: ing, closeouts: co }));
      } catch (e2) {
        if (handleStorageError(e2)) return;
      }
    }
    try {
      const menuRes = await storage.get(STORAGE_MENU);
      if (menuRes && menuRes.value) {
        mn = JSON.parse(menuRes.value);
      }
    } catch (e) {
      if (handleStorageError(e)) return;
      try {
        await storage.set(STORAGE_MENU, JSON.stringify(mn));
      } catch (e2) {
        if (handleStorageError(e2)) return;
      }
    }
    // Anything this device took while the connection was down goes first, so the
    // list that comes back already includes it.
    try {
      await salesApi.flush();
    } catch (e) {
      if (handleStorageError(e)) return;
    }
    setPending(salesApi.pending());
    try {
      const listed = await salesApi.list();
      sl = listed.sales;
      // Stale means it came from this device's copy because the server was
      // unreachable. The register still opens — the menu and the last known stock are
      // enough to keep selling — and the real list arrives on reconnect.
      setOffline(listed.stale);
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        handleStorageError(e);
        return;
      }
      setOffline(true);
    }

    setIngredients(ing);
    setSales(sl);
    setCloseouts(co);
    setMenu(mn);
    // Nothing is chosen for the customer: size and flavour start empty, so no button
    // looks picked until someone picks it. The free toppings are the exception —
    // they are on the bowl unless removed, which is what the green box says.
    setBuilder({ productId: null, size: null, toppingIds: [...mn.includedToppingIds] });
    setReady(true);
  }

  // Ingredients and closeouts only. Sales are appended to their own table through
  // salesApi, so that a register coming back from offline never writes its idea of
  // the whole day over everyone else's.
  async function persistShop(nextIngredients, nextCloseouts = closeouts) {
    setIngredients(nextIngredients);
    setCloseouts(nextCloseouts);
    try {
      await storage.set(
        STORAGE_SHOP,
        JSON.stringify({ ingredients: nextIngredients, closeouts: nextCloseouts })
      );
    } catch (e) {
      handleStorageError(e, "Couldn't save. Try again.");
    }
  }

  function showToast(msg, isError) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2200);
  }

  const currentProduct = menu.products.find((p) => p.id === builder.productId);
  const extraCount = builder.toppingIds.filter((id) => !menu.includedToppingIds.includes(id)).length;
  // Sizes are priced the same across the menu, so the size step can show prices
  // before a flavour is chosen; it falls back to the first product for that.
  const priceRef = currentProduct || menu.products[0];
  const sizePrice = (sz) => (sz && priceRef ? priceRef.sizes[sz] : null);
  const builderReady = Boolean(currentProduct && builder.size);

  // Size carries its price on the flavour screen, where the price is not otherwise
  // on the page; once a flavour is picked the name matters more than repeating it.
  const chosenSoFar = [
    builder.size &&
      (currentProduct
        ? builder.size[0].toUpperCase() + builder.size.slice(1)
        : `${builder.size[0].toUpperCase()}${builder.size.slice(1)} · ${money(sizePrice(builder.size))}`),
    currentProduct?.name,
  ].filter(Boolean);
  const builderPrice = (sizePrice(builder.size) || 0) + extraCount * menu.toppingPrice;

  // Which screen of the wizard is on, by name rather than by number — the paid
  // categories each get one, so positions shift whenever the menu's categories do.
  const stepKey = STEPS[step]?.key || STEPS[0].key;
  const stepCategory = STEPS[step]?.category;
  const includedNames = menu.toppings
    .filter((t) => menu.includedToppingIds.includes(t.id) && builder.toppingIds.includes(t.id))
    .map((t) => t.name);
  const extraNames = menu.toppings
    .filter((t) => !menu.includedToppingIds.includes(t.id) && builder.toppingIds.includes(t.id))
    .map((t) => t.name);

  function toggleTopping(id) {
    setBuilder((b) => {
      const has = b.toppingIds.includes(id);
      return { ...b, toppingIds: has ? b.toppingIds.filter((t) => t !== id) : [...b.toppingIds, id] };
    });
  }

  function resetBuilder() {
    setBuilder({ productId: null, size: null, toppingIds: [...menu.includedToppingIds] });
    setStep(stepIndex("size"));
  }

  function addToCart() {
    if (!builderReady) return;
    setCart((c) => [
      ...c,
      {
        cartId: uid(),
        productId: currentProduct.id,
        productName: currentProduct.name,
        size: builder.size,
        toppingIds: [...builder.toppingIds],
        price: builderPrice,
      },
    ]);
    resetBuilder();
    showToast("Added to order");
  }

  function removeFromCart(cartId) {
    setCart((c) => c.filter((i) => i.cartId !== cartId));
  }

  // US menus quote prices before tax and add it at the register, so the bowl
  // prices stay as listed and tax lands on the subtotal. Rounded to the cent once,
  // on the whole order, rather than per bowl.
  const taxRate = Number(menu.taxRate) || 0;
  const cartSubtotal = cart.reduce((s, i) => s + i.price, 0);
  const cartTax = Math.round(cartSubtotal * taxRate * 100) / 100;
  const cartTotal = cartSubtotal + cartTax;

  // Tips are worked out on the pre-tax subtotal, the usual US practice — tipping on
  // the tax means tipping the state. Never taxed themselves: a tip is the staff's
  // money passing through, not the shop's revenue.
  const tipAmount =
    tipChoice === "custom"
      ? Math.max(0, Math.round((parseFloat(tipCustom) || 0) * 100) / 100)
      : Math.round(cartSubtotal * tipChoice * 100) / 100;
  const amountDue = Math.round((cartSubtotal + cartTax + tipAmount) * 100) / 100;
  const cashChange = Math.round(((parseFloat(cashGiven) || 0) - amountDue) * 100) / 100;
  const canCharge =
    cart.length > 0 &&
    (payMethod === "card" || (payMethod === "cash" && (!cashGiven || cashChange >= 0)));

  function closePayment() {
    // Kept mounted for the length of the exit, then dropped. Without this the sheet
    // slides up and then vanishes, which reads as a glitch rather than a dismissal.
    setSheetClosing(true);
    setTimeout(() => {
      setSheetClosing(false);
      setPaying(false);
    }, 180);
    setTipChoice(0);
    setTipCustom("");
    setPayMethod(null);
    setCashGiven("");
  }

  async function checkout() {
    if (cart.length === 0 || !payMethod) return;
    setSaving(true);
    const nextIngredients = ingredients.map((i) => ({ ...i }));
    const consume = (ingredientId, amount) => {
      const ing = nextIngredients.find((i) => i.id === ingredientId);
      if (ing) ing.stock = Math.max(0, ing.stock - amount);
    };
    cart.forEach((item) => {
      consumptionFor(item, menu, nextIngredients).forEach(({ id, amount }) => consume(id, amount));
    });
    const now = new Date().toISOString();
    const rung = cart.map((item) => ({
        id: uid(),
        date: now,
        productId: item.productId,
        productName: item.productName,
        size: item.size,
        toppingIds: item.toppingIds,
        price: item.price,
        // The rate in force at the time, and this bowl's share of the order's tax:
        // rates change, and a sale has to stay explainable after they do.
        taxRate,
        tax: cartSubtotal > 0 ? Math.round((cartTax * item.price / cartSubtotal) * 100) / 100 : 0,
        // The order's tip split over its bowls the same way the tax is, so a single
        // sale row stays self-contained and the day's tips add back up.
        tip: cartSubtotal > 0 ? Math.round((tipAmount * item.price / cartSubtotal) * 100) / 100 : 0,
        // Cash or card. Without this the drawer cannot be settled at close: there is
        // nothing to compare the physical money against.
        payment: payMethod,
        // Who rang it up, taken from the signed-in session rather than typed in.
        userId: me?.id || null,
        userName: me?.name || null,
    }));

    // The money has already changed hands, so the register shows the sale and moves
    // on whether or not the server heard about it. Stock comes off locally to match
    // what the server does with the same numbers; a reconnect re-reads both.
    setSales([...sales, ...rung]);
    setIngredients(nextIngredients);
    setCart([]);
    closePayment();

    let queued = false;
    try {
      for (const item of rung) {
        const result = await salesApi.record(item, consumptionFor(item, menu, ingredients));
        queued = queued || result.queued;
      }
    } catch (e) {
      handleStorageError(e, "Couldn't save the sale. Try again.");
    }
    setPending(salesApi.pending());
    if (queued) setOffline(true);
    setSaving(false);
    showToast(
      queued ? `Charged ${money(amountDue)} — saved on this device` : `Charged ${money(amountDue)}`
    );
  }

  // A mis-ring is not rare, and until now there was no way back from one: the wrong
  // money stayed in the day's takings and the ingredients it claimed to have used
  // never came back. The sale is marked rather than deleted, so the correction is
  // itself on the record and the day can still be explained afterwards.
  async function voidSale(saleId) {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale || sale.voided) return;
    setSaving(true);
    const nextIngredients = ingredients.map((i) => ({ ...i }));
    consumptionFor(sale, menu, nextIngredients).forEach(({ id, amount }) => {
      const ing = nextIngredients.find((i) => i.id === id);
      if (ing) ing.stock += amount;
    });
    setSales(
      sales.map((s) =>
        s.id === saleId
          ? {
              ...s,
              voided: true,
              voidedAt: new Date().toISOString(),
              voidedById: me?.id || null,
              voidedByName: me?.name || null,
            }
          : s
      )
    );
    setIngredients(nextIngredients);

    let queued = false;
    try {
      const result = await salesApi.void(saleId, consumptionFor(sale, menu, ingredients));
      queued = result.queued;
    } catch (e) {
      handleStorageError(e, "Couldn't void the sale. Try again.");
    }
    setPending(salesApi.pending());
    if (queued) setOffline(true);
    setSaving(false);
    const amount = money(sale.price + (sale.tax || 0) + (sale.tip || 0));
    showToast(queued ? `Voided ${amount} — saved on this device` : `Voided ${amount}`);
  }

  // Settling the day: what the register says should be in the drawer against what is
  // actually counted out of it. The difference is the point — a drawer that is never
  // counted cannot tell you it is short.
  async function saveCloseout() {
    const counted = parseFloat(countedCash);
    if (!Number.isFinite(counted) || counted < 0) return;
    setSaving(true);
    const record = {
      id: uid(),
      day: todayKey(),
      closedAt: new Date().toISOString(),
      closedById: me?.id || null,
      closedByName: me?.name || null,
      expectedCash: Math.round(report.takings.cash * 100) / 100,
      countedCash: Math.round(counted * 100) / 100,
      difference: Math.round((counted - report.takings.cash) * 100) / 100,
      cardTotal: Math.round(report.takings.card * 100) / 100,
      tips: Math.round(report.todayTips * 100) / 100,
      salesCount: report.todayCount,
    };
    await persistShop(ingredients, [...closeouts, record]);
    setCountedCash("");
    setSaving(false);
    showToast(
      record.difference === 0
        ? "Drawer balanced"
        : `${money(Math.abs(record.difference))} ${record.difference > 0 ? "over" : "short"}`,
      record.difference !== 0
    );
  }

  // The menu and the store room are saved together: adding a flavour or a topping
  // creates the ingredient it consumes, so writing one without the other would leave
  // the menu offering something the inventory has never heard of.
  async function saveMenu(nextMenu, nextIngredients, message) {
    setSaving(true);
    setMenu(nextMenu);
    try {
      await storage.set(STORAGE_MENU, JSON.stringify(nextMenu));
      if (nextIngredients !== ingredients) {
        await persistShop(nextIngredients);
      }
      // The bowl being built may now hold a topping that is no longer on the menu, or
      // be missing one that just became free.
      setBuilder((b) => ({
        ...b,
        productId: nextMenu.products.some((p) => p.id === b.productId) ? b.productId : null,
        toppingIds: b.toppingIds.filter((id) => nextMenu.toppings.some((t) => t.id === id)),
      }));
      if (message) showToast(message);
    } catch (e) {
      handleStorageError(e, "Couldn't save the menu. Try again.");
    }
    setSaving(false);
  }

  // The rate lives with the menu, so every register picks it up from the shared
  // database rather than each device keeping its own idea of the tax.
  async function saveTaxRate(rate) {
    const next = { ...menu, taxRate: rate };
    setMenu(next);
    try {
      await storage.set(STORAGE_MENU, JSON.stringify(next));
      showToast(rate > 0 ? `Sales tax set to ${formatRate(rate)}` : "Sales tax turned off");
    } catch (e) {
      handleStorageError(e, "Couldn't save the tax rate. Try again.");
    }
  }

  async function restock() {
    const amt = parseFloat(restockAmt);
    if (!restockId || !amt || amt <= 0) return;
    // Sent as a delta, not as a rewrite of every stock level: another register may be
    // selling from the same shelf while this one is counting it.
    try {
      await salesApi.adjustStock([{ id: restockId, amount: amt }]);
    } catch (e) {
      return handleStorageError(e, "Couldn't update stock. Try again.");
    }
    setIngredients(ingredients.map((i) => (i.id === restockId ? { ...i, stock: i.stock + amt } : i)));
    setRestockId(null);
    setRestockAmt("");
    showToast("Inventory updated");
  }

  async function addIngredient() {
    if (!newIngName.trim()) return;
    const next = [
      ...ingredients,
      { id: uid(), name: newIngName.trim(), unit: "g", stock: 0, low: 100, per: 10, color: COLOR.inkSoft },
    ];
    await persistShop(next);
    setNewIngName("");
    showToast("Ingredient added");
  }

  // ---------- Reports ----------
  const report = useMemo(() => {
    const today = todayKey();
    // Voided sales stay in the record but count for nothing — not in the takings, not
    // in the charts, not in anyone's total. `live` is what actually happened.
    const live = sales.filter((s) => !s.voided);
    const todayAll = sales.filter((s) => s.date.slice(0, 10) === today);
    const todaySales = todayAll.filter((s) => !s.voided);
    // Takings split three ways, because tax collected is not the shop's money —
    // it is held for the state. Sales recorded before tax was configured have no
    // tax field and count as zero.
    const todayTotal = todaySales.reduce((s, i) => s + i.price, 0);
    const todayTax = todaySales.reduce((s, i) => s + (i.tax || 0), 0);
    // Tips are the staff's, not the shop's, so they are kept apart from revenue the
    // same way tax is. Sales taken before tips existed have no field and count zero.
    const todayTips = todaySales.reduce((s, i) => s + (i.tip || 0), 0);
    const todayCollected = todayTotal + todayTax + todayTips;

    // What should be in the drawer versus what went through the card reader. Sales
    // from before payment was recorded have no method and are counted separately
    // rather than guessed into one of the two.
    const takings = { cash: 0, card: 0, unknown: 0 };
    todaySales.forEach((s) => {
      const bucket = s.payment === "cash" || s.payment === "card" ? s.payment : "unknown";
      takings[bucket] += s.price + (s.tax || 0) + (s.tip || 0);
    });

    const byDay = {};
    live.forEach((s) => {
      const k = s.date.slice(0, 10);
      byDay[k] = (byDay[k] || 0) + s.price;
    });
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = todayKey(d);
      days.push({ label: d.toLocaleDateString("en-US", { weekday: "short" }), total: Math.round(byDay[k] || 0) });
    }

    const prodCount = {};
    live.forEach((s) => {
      prodCount[s.productName] = (prodCount[s.productName] || 0) + 1;
    });
    const topProduct = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0];

    const topCount = {};
    live.forEach((s) =>
      s.toppingIds.forEach((tid) => {
        const t = menu.toppings.find((x) => x.id === tid);
        if (t) topCount[t.name] = (topCount[t.name] || 0) + 1;
      })
    );
    const topTopping = Object.entries(topCount).sort((a, b) => b[1] - a[1])[0];

    const lowStock = ingredients.filter((i) => i.stock <= i.low);

    // Who sold what today. Sales recorded before staff accounts existed have no
    // name, so they are grouped under a placeholder rather than dropped.
    const byPerson = {};
    todaySales.forEach((s) => {
      const who = s.userName || "Not recorded";
      if (!byPerson[who]) byPerson[who] = { name: who, total: 0, count: 0, tips: 0 };
      byPerson[who].total += s.price;
      byPerson[who].tips += s.tip || 0;
      byPerson[who].count += 1;
    });
    const people = Object.values(byPerson).sort((a, b) => b.total - a.total);

    // Everything rung up in one checkout shares a timestamp, which is what makes an
    // order an order — a receipt covers what the customer paid for in one go, not one
    // bowl of three. Newest first: correcting a mistake means finding what you just
    // rang up.
    const byOrder = new Map();
    todayAll.forEach((s) => {
      const group = byOrder.get(s.date) || {
        key: s.date,
        at: s.date,
        userName: s.userName,
        payment: s.payment,
        bowls: [],
      };
      group.bowls.push(s);
      byOrder.set(s.date, group);
    });
    const todayLog = [...byOrder.values()]
      .map((o) => {
        const live = o.bowls.filter((b) => !b.voided);
        return {
          ...o,
          subtotal: live.reduce((a, b) => a + b.price, 0),
          tax: live.reduce((a, b) => a + (b.tax || 0), 0),
          tip: live.reduce((a, b) => a + (b.tip || 0), 0),
          gross: live.reduce((a, b) => a + b.price + (b.tax || 0) + (b.tip || 0), 0),
          allVoided: live.length === 0,
        };
      })
      .sort((a, b) => b.at.localeCompare(a.at));

    return {
      todayTotal,
      todayTax,
      todayTips,
      takings,
      todayLog,
      todayCollected,
      todayCount: todaySales.length,
      days,
      topProduct,
      topTopping,
      lowStock,
      people,
    };
  }, [sales, ingredients, menu]);

  // Below the report deliberately: both read from it. One close-out per day, and the
  // latest wins if a day somehow got two.
  const todayCloseout = [...closeouts].reverse().find((c) => c.day === todayKey()) || null;
  // One notion of "is this a usable count", so the button and saveCloseout can never
  // disagree — an enabled button that silently does nothing is worse than a disabled one.
  const countedValid = Number.isFinite(parseFloat(countedCash)) && parseFloat(countedCash) >= 0;
  const countedDiff = Math.round(((parseFloat(countedCash) || 0) - report.takings.cash) * 100) / 100;

  const toppingsByCategory = useMemo(() => {
    const grouped = {};
    menu.toppings.forEach((t) => {
      if (menu.includedToppingIds.includes(t.id)) return; // shown separately, in the free box
      grouped[t.category] = grouped[t.category] || [];
      grouped[t.category].push(t);
    });
    return grouped;
  }, [menu.toppings, menu.includedToppingIds]);

  const includedToppings = menu.toppings.filter((t) => menu.includedToppingIds.includes(t.id));

  function scrollToCart() {
    cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // The webfonts and the two display classes are needed by the sign-in screen too,
  // which renders before the app shell exists.
  const typography = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
      /* The logo's lettering is a rounded geometric sans; the app used to set the
         name in a serif, which read as a different brand sitting next to the mark. */
      .font-display { font-family: 'Nunito', ui-rounded, sans-serif; letter-spacing: -0.01em; }
      /* Money is the most-read thing on a register. Tabular so columns of prices line
         up on the decimal, and tight so a total can be large without shouting. */
      .font-mono-num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
    `}</style>
  );

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLOR.bg }}>
        {typography}
        <div style={{ color: COLOR.forest }} className="text-sm font-medium">
          Loading…
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <>
        {typography}
        <SignInScreen onSignedIn={setMe} />
      </>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLOR.bg }}>
        {typography}
        <div style={{ color: COLOR.forest }} className="text-sm font-medium">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLOR.bg, fontFamily: "'Space Grotesk', sans-serif" }}>
      {typography}

      {/* Header */}
      <div className="pad-status-bar relative px-5 pb-4" style={{ background: COLOR.forest }}>
        {/* The shop's own mark rather than its name re-set in a typeface, which never
            matched the lettering it was sitting beside. */}
        <div className="flex items-center gap-2.5">
          <img src={markImage} alt="" className="shrink-0" style={{ width: 30, height: "auto" }} />
          <h1 className="font-display text-2xl font-extrabold" style={{ color: "#FFFFFF" }}>
            Quick Açaí
          </h1>
        </div>
        <p className="text-sm mt-0.5" style={{ color: "#A7C4B6" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}
          {me.name}
        </p>

        {/* Fix #5: live cart badge, visible through the whole builder flow */}
        {tab === "pos" && cart.length > 0 && (
          <button
            onClick={scrollToCart}
            className="absolute right-4 top-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold shadow-md"
            style={{ background: COLOR.coral, color: "#fff" }}
          >
            <ShoppingBag size={14} /> {cart.length} · {money(cartTotal)}
          </button>
        )}
      </div>

      {/* Whoever is at the register has to be able to tell the difference between a
          sale that is banked and one that is still on this tablet. */}
      {(offline || pending > 0) && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
          style={{ background: pending > 0 ? COLOR.alertPale : COLOR.forestPale, color: pending > 0 ? COLOR.alert : COLOR.forest }}
        >
          <AlertTriangle size={13} className="shrink-0" />
          {pending > 0
            ? `${pending} ${pending === 1 ? "sale" : "sales"} saved on this device — sending when the connection is back`
            : "No connection — sales are saved here and sent when it returns"}
        </div>
      )}

      {/* Toast. Centred by the wrapper rather than by a translate, so the toast's own
          transform is free to carry the entrance. */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div
            className="toast-pop flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
            style={{ background: toast.isError ? COLOR.alert : COLOR.forest, color: "#fff" }}
          >
            {toast.isError ? <AlertTriangle size={14} /> : <Check size={14} />}
            {toast.msg}
          </div>
        </div>
      )}

      {receipt && (
        <Receipt order={receipt} menu={menu} onClose={() => setReceipt(null)} />
      )}

      {voiding && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6" style={{ background: "rgba(43,18,36,0.45)" }}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: COLOR.card }}>
            <p className="text-base font-semibold" style={{ color: COLOR.ink }}>Void this sale?</p>
            <p className="mt-1 text-sm" style={{ color: COLOR.inkSoft }}>
              {voiding.productName} · <span className="capitalize">{voiding.size}</span> ·{" "}
              <span className="font-mono-num">
                {money(voiding.price + (voiding.tax || 0) + (voiding.tip || 0))}
              </span>
            </p>
            <p className="mt-2 text-sm" style={{ color: COLOR.inkSoft }}>
              It stops counting toward the day's takings and its ingredients go back
              into stock. The sale stays on the record, marked as voided by you.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setVoiding(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-semibold"
                style={{ borderColor: COLOR.line, color: COLOR.inkSoft }}
              >
                Keep it
              </button>
              <button
                onClick={() => {
                  const id = voiding.id;
                  setVoiding(null);
                  voidSale(id);
                }}
                disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: COLOR.alert, color: "#fff" }}
              >
                Void it
              </button>
            </div>
          </div>
        </div>
      )}

      {paying && (
        <PaymentSheet
          closing={sheetClosing}
          subtotal={cartSubtotal}
          tax={cartTax}
          taxRate={taxRate}
          tip={tipAmount}
          total={amountDue}
          tipChoice={tipChoice}
          onTipChoice={setTipChoice}
          tipCustom={tipCustom}
          onTipCustom={setTipCustom}
          method={payMethod}
          onMethod={setPayMethod}
          cashGiven={cashGiven}
          onCashGiven={setCashGiven}
          change={cashChange}
          canCharge={canCharge}
          saving={saving}
          onCharge={checkout}
          onClose={closePayment}
        />
      )}

      {/* The page itself scrolls — this used to carry overflow-y-auto, which made it
          the scroll container on paper while the shell's min-h-screen let it grow
          past the viewport instead, so it never scrolled and anything sticky inside
          had nothing to stick to. */}
      <div className="flex-1 pb-24 px-4 pt-4 max-w-md w-full mx-auto">
        {tab === "pos" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              {/* Hidden while picking a flavour: the bowl is necessarily empty at that
                  point, and the nine choices need the whole screen to fit without
                  scrolling. Half size on the paid-topping screens, where it is four
                  screens in a row of the same picture standing between the register
                  and the Continue button — small enough to leave room for the
                  toppings, still there to show one landing in the bowl. */}
              {stepKey !== "flavor" && (
              <BowlPreview
                productId={currentProduct?.id}
                toppingIds={builder.toppingIds}
                includedToppingIds={menu.includedToppingIds}
                toppings={menu.toppings}
                ingredients={ingredients}
                maxWidth={stepCategory ? 124 : 236}
              />
              )}

              <ProgressSteps step={step} onJump={setStep} />

              {/* Size */}
              {stepKey === "size" && (
                <div className="space-y-2">
                  <p className="text-base font-semibold text-center mb-1" style={{ color: COLOR.ink }}>
                    Choose a size
                  </p>
                  {["small", "medium", "large"].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => {
                        setBuilder((b) => ({ ...b, size: sz }));
                        setStep(stepIndex("flavor"));
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl border-2 capitalize"
                      style={{
                        borderColor: builder.size === sz ? COLOR.coral : COLOR.line,
                        background: builder.size === sz ? COLOR.coralPale : "transparent",
                      }}
                    >
                      <span className="text-base font-medium" style={{ color: COLOR.ink }}>{sz}</span>
                      <span className="font-mono-num text-base font-semibold" style={{ color: COLOR.ink }}>
                        {sizePrice(sz) !== null ? money(sizePrice(sz)) : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Flavor */}
              {stepKey === "flavor" && (
                <div className="space-y-2">
                  <StepHeader onBack={() => setStep(stepIndex("size"))} parts={chosenSoFar} />
                  {/* No heading here, unlike every other step: the progress line above
                      already reads "Step 2 of 8 — Flavor", and on a 320px screen those
                      28px are the difference between all nine flavours being on the
                      page and the last row falling under the fold. */}
                  {/* Two columns, and no emoji: nine flavours in one column ran past the
                      fold, and hunting for one by scrolling costs more than the picture
                      of a sorbet was worth. A real photo still shows when there is one. */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {menu.products.map((p) => {
                      const photo = FLAVOR_PHOTOS[p.id];
                      const picked = builder.productId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setBuilder((b) => ({ ...b, productId: p.id }));
                            setStep(stepIndex("included"));
                          }}
                          className="flex items-center gap-2 rounded-xl border-2 px-2.5 py-1.5 text-left transition"
                          style={{
                            borderColor: picked ? COLOR.forest : COLOR.line,
                            background: picked ? COLOR.forestPale : "transparent",
                            minHeight: 44,
                          }}
                        >
                          {photo && (
                            <span
                              className="shrink-0 overflow-hidden rounded-full"
                              style={{ width: 30, height: 30 }}
                            >
                              <img src={photo} alt="" className="h-full w-full object-cover" />
                            </span>
                          )}
                          <span
                            className="text-sm font-medium leading-tight"
                            style={{ color: COLOR.ink }}
                          >
                            {p.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* The four that come with the bowl, alone on the screen so removing
                  one is a decision of its own, before anything is charged. */}
              {stepKey === "included" && (
                <div className="space-y-3">
                  <StepHeader onBack={() => setStep(stepIndex("flavor"))} parts={chosenSoFar} />
                  <p className="text-base font-semibold text-center" style={{ color: COLOR.ink }}>
                    Included toppings
                  </p>

                  <div className="rounded-xl p-3" style={{ background: COLOR.goodPale, border: `1px solid ${COLOR.good}55` }}>
                    <p className="text-sm font-semibold" style={{ color: COLOR.good }}>
                      ✓ These four are free
                    </p>
                    <p className="mb-2 text-xs" style={{ color: COLOR.good }}>
                      Tap to remove any they don't want. Paid extras come next.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {includedToppings.map((t) => {
                        const on = builder.toppingIds.includes(t.id);
                        const ing = ingredients.find((i) => i.id === t.ingredientId);
                        return (
                          <button
                            key={t.id}
                            onClick={() => toggleTopping(t.id)}
                            className="px-3 py-2 rounded-full text-sm font-medium border flex items-center gap-1.5"
                            style={{
                              borderColor: on ? COLOR.good : COLOR.line,
                              background: on ? COLOR.good : "transparent",
                              color: on ? "#fff" : COLOR.ink,
                            }}
                          >
                            <ToppingSwatch toppingId={t.id} color={ing?.color} />
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <ContinueButton onClick={() => setStep(step + 1)} />
                </div>
              )}

              {/* One paid category per screen. Dairy is settled before nuts are
                  offered, nuts before fruit, so nothing is decided in passing while
                  scrolling toward the next thing. */}
              {stepCategory && (
                <div className="space-y-3">
                  <StepHeader onBack={() => setStep(step - 1)} parts={chosenSoFar} />
                  <p className="text-base font-semibold text-center" style={{ color: COLOR.ink }}>
                    Add {CATEGORY_TITLE[stepCategory].toLowerCase()}
                  </p>

                  <div className="rounded-xl px-3 py-2.5" style={{ background: COLOR.forestPale }}>
                    <p className="text-sm font-semibold" style={{ color: COLOR.forest }}>
                      {money(menu.toppingPrice)} each — nothing here is free
                    </p>
                    <p className="text-xs" style={{ color: COLOR.forestSoft }}>
                      {extraCount === 0 ? (
                        "Skip with Continue if they don't want any."
                      ) : (
                        <>
                          {extraCount} extra{extraCount === 1 ? "" : "s"} so far ·{" "}
                          <span className="font-mono-num font-semibold">
                            {money(extraCount * menu.toppingPrice)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  {(toppingsByCategory[stepCategory] || []).length === 0 ? (
                    <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                      Nothing on the menu in this category.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {toppingsByCategory[stepCategory].map((t) => {
                        const on = builder.toppingIds.includes(t.id);
                        const ing = ingredients.find((i) => i.id === t.ingredientId);
                        const out = ing && ing.stock <= 0;
                        return (
                          <button
                            key={t.id}
                            disabled={out}
                            onClick={() => toggleTopping(t.id)}
                            className="px-3 py-2 rounded-full text-sm font-medium border flex items-center gap-1.5"
                            style={{
                              borderColor: on ? COLOR.forest : COLOR.line,
                              background: on ? COLOR.forest : "transparent",
                              color: on ? "#fff" : out ? "#B9AEB4" : COLOR.ink,
                              opacity: out ? 0.5 : 1,
                            }}
                          >
                            <ToppingSwatch toppingId={t.id} color={ing?.color} />
                            {t.name}
                            {out && " · out of stock"}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <ChosenToppings included={includedNames} extras={extraNames} />

                  <ContinueButton onClick={() => setStep(step + 1)} />
                </div>
              )}

              {/* Review */}
              {stepKey === "review" && (
                <div className="space-y-3">
                  <BackLink onClick={() => setStep(step - 1)} />
                  <p className="text-base font-semibold text-center" style={{ color: COLOR.ink }}>
                    Review your bowl
                  </p>
                  <div className="rounded-xl p-3" style={{ background: COLOR.forestPale }}>
                    <p className="text-base font-semibold" style={{ color: COLOR.ink }}>
                      {currentProduct?.name || "No flavor chosen"} ·{" "}
                      <span className="capitalize">{builder.size || "no size"}</span>
                    </p>
                    <p className="text-sm mt-1" style={{ color: COLOR.inkSoft }}>
                      {builder.toppingIds.length > 0
                        ? builder.toppingIds.map((id) => menu.toppings.find((t) => t.id === id)?.name).join(", ")
                        : "No toppings"}
                    </p>
                  </div>
                  {/* Broken out so the customer can be told where the total comes from. */}
                  <div className="space-y-1 px-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm" style={{ color: COLOR.inkSoft }}>
                        <span className="capitalize">{builder.size}</span> bowl
                      </span>
                      <span className="font-mono-num text-sm" style={{ color: COLOR.inkSoft }}>
                        {money(sizePrice(builder.size) || 0)}
                      </span>
                    </div>
                    {extraCount > 0 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm" style={{ color: COLOR.inkSoft }}>
                          {extraCount} paid {extraCount === 1 ? "topping" : "toppings"} ×{" "}
                          {money(menu.toppingPrice)}
                        </span>
                        <span className="font-mono-num text-sm" style={{ color: COLOR.inkSoft }}>
                          {money(extraCount * menu.toppingPrice)}
                        </span>
                      </div>
                    )}
                    <div
                      className="flex items-center justify-between border-t pt-1.5"
                      style={{ borderColor: COLOR.line }}
                    >
                      <span className="text-base font-semibold" style={{ color: COLOR.ink }}>
                        Price
                      </span>
                      <span className="font-mono-num text-xl font-semibold" style={{ color: COLOR.forest }}>
                        {money(builderPrice)}
                      </span>
                    </div>
                  </div>
                  {/* Nothing can be added until both choices are actually made. */}
                  <button
                    onClick={addToCart}
                    disabled={!builderReady}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold"
                    style={{
                      background: builderReady ? COLOR.coral : COLOR.line,
                      color: builderReady ? "#fff" : COLOR.inkSoft,
                    }}
                  >
                    <Plus size={18} />
                    {builderReady ? "Add to order" : "Choose a size and flavor"}
                  </button>
                </div>
              )}
            </div>

            {/* Cart */}
            <div ref={cartSectionRef} className="rounded-2xl p-4 scroll-mt-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              <p className="text-base font-semibold mb-2" style={{ color: COLOR.ink }}>
                Current order
              </p>
              {cart.length === 0 ? (
                <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                  No bowls added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.cartId} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.productName}</span>
                        <span style={{ color: COLOR.inkSoft }}> · {item.size}</span>
                        {item.toppingIds.filter((id) => !menu.includedToppingIds.includes(id)).length > 0 && (
                          <div className="text-xs" style={{ color: COLOR.inkSoft }}>
                            {item.toppingIds
                              .filter((id) => !menu.includedToppingIds.includes(id))
                              .map((id) => menu.toppings.find((t) => t.id === id)?.name)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-sm">{money(item.price)}</span>
                        <button onClick={() => removeFromCart(item.cartId)}>
                          <X size={14} color={COLOR.inkSoft} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: COLOR.line }}>
                    {taxRate > 0 && (
                      <>
                        <div className="flex items-baseline justify-between text-sm">
                          <span style={{ color: COLOR.inkSoft }}>Subtotal</span>
                          <span className="font-mono-num" style={{ color: COLOR.inkSoft }}>
                            {money(cartSubtotal)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between text-sm">
                          <span style={{ color: COLOR.inkSoft }}>
                            Sales tax ({formatRate(taxRate)})
                          </span>
                          <span className="font-mono-num" style={{ color: COLOR.inkSoft }}>
                            {money(cartTax)}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold">Total</span>
                      <span className="font-mono-num text-xl font-semibold" style={{ color: COLOR.forest }}>
                        {money(cartTotal)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setPaying(true)}
                    className="w-full rounded-xl py-3 text-base font-semibold"
                    style={{ background: COLOR.coral, color: "#fff" }}
                  >
                    Take payment
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "inventario" && showInventory && (
          <div className="space-y-3">
            {report.lowStock.length > 0 && (
              <div className="rounded-xl p-3 text-sm flex items-start gap-2" style={{ background: COLOR.alertPale, color: COLOR.alert }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>Low stock: {report.lowStock.map((i) => i.name).join(", ")}.</span>
              </div>
            )}
            {ingredients.map((ing) => {
              const pct = Math.min(1, ing.stock / (ing.low * 3 || 1));
              const low = ing.stock <= ing.low;
              return (
                <div key={ing.id} className="rounded-2xl p-3.5" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: ing.color, border: "1px solid rgba(0,0,0,0.1)" }} />
                      <span className="text-base font-medium">{ing.name}</span>
                    </div>
                    <span className="font-mono-num text-sm" style={{ color: low ? COLOR.alert : COLOR.inkSoft }}>
                      {ing.stock} {ing.unit}
                    </span>
                  </div>
                  <StockBar pct={pct} low={low} />
                  {restockId === ing.id ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        autoFocus
                        type="number"
                        value={restockAmt}
                        onChange={(e) => setRestockAmt(e.target.value)}
                        placeholder={`+ ${ing.unit}`}
                        className="flex-1 text-base px-2 py-1.5 rounded-lg border outline-none"
                        style={{ borderColor: COLOR.line }}
                      />
                      <button onClick={restock} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: COLOR.good, color: "#fff" }}>
                        Save
                      </button>
                      <button onClick={() => setRestockId(null)}>
                        <X size={16} color={COLOR.inkSoft} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setRestockId(ing.id)} className="text-sm font-medium mt-2" style={{ color: COLOR.forest }}>
                      + Restock
                    </button>
                  )}
                </div>
              );
            })}

            <div className="rounded-2xl p-3.5 flex items-center gap-2" style={{ background: COLOR.card, border: `1px dashed ${COLOR.line}` }}>
              <input
                value={newIngName}
                onChange={(e) => setNewIngName(e.target.value)}
                placeholder="New ingredient…"
                className="flex-1 text-base px-2 py-1.5 rounded-lg border outline-none"
                style={{ borderColor: COLOR.line }}
              />
              <button onClick={addIngredient} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: COLOR.forest, color: "#fff" }}>
                Add
              </button>
            </div>
          </div>
        )}

        {tab === "reportes" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={{ background: COLOR.forest }}>
                <p className="text-sm" style={{ color: "#A7C4B6" }}>Sales today</p>
                <p className="font-mono-num text-xl font-semibold mt-1" style={{ color: "#fff" }}>{money(report.todayTotal)}</p>
                <p className="text-sm mt-0.5" style={{ color: "#A7C4B6" }}>
                  {report.todayCount} {report.todayCount === 1 ? "bowl" : "bowls"}
                </p>
                {(report.todayTax > 0 || report.todayTips > 0) && (
                  <p className="mt-2 text-xs leading-snug" style={{ color: "#A7C4B6" }}>
                    before tax and tips · took{" "}
                    <span className="font-mono-num">{money(report.todayCollected)}</span>
                  </p>
                )}
              </div>
              <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
                <p className="text-sm" style={{ color: COLOR.inkSoft }}>Best seller</p>
                <p className="text-lg font-semibold mt-1">{report.topProduct ? report.topProduct[0] : "—"}</p>
                <p className="text-sm mt-0.5" style={{ color: COLOR.inkSoft }}>
                  {report.topProduct ? `${report.topProduct[1]} sold` : "nothing sold yet"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              <p className="text-base font-semibold mb-3">Last 7 days</p>
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer>
                  <BarChart data={report.days}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLOR.line} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: COLOR.inkSoft }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: COLOR.inkSoft }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                    <Bar dataKey="total" fill={COLOR.forest} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {report.todayTax > 0 && (
              <div
                className="rounded-2xl p-4"
                style={{ background: COLOR.card, boxShadow: COLOR.lift }}
              >
                <p className="text-base font-semibold">Sales tax collected today</p>
                <p className="font-mono-num mt-1 text-xl font-semibold" style={{ color: COLOR.forest }}>
                  {money(report.todayTax)}
                </p>
                <p className="mt-1 text-sm" style={{ color: COLOR.inkSoft }}>
                  Held for the state at {formatRate(taxRate)} — not part of the
                  {" "}{money(report.todayTotal)} above.
                </p>
              </div>
            )}

            {/* Cash versus card, because at close the cash is the only half that has
                to be counted by hand and matched. */}
            <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              <p className="text-base font-semibold mb-2">Taken today</p>
              <div className="space-y-1">
                {[["Cash", report.takings.cash], ["Card", report.takings.card],
                  ["Not recorded", report.takings.unknown]]
                  .filter(([label, v]) => v > 0 || label !== "Not recorded")
                  .map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between">
                      <span className="text-sm" style={{ color: COLOR.inkSoft }}>{label}</span>
                      <span className="font-mono-num text-sm font-semibold" style={{ color: COLOR.ink }}>
                        {money(value)}
                      </span>
                    </div>
                  ))}
              </div>
              {report.todayTips > 0 && (
                <p className="mt-2 border-t pt-2 text-sm" style={{ borderColor: COLOR.line, color: COLOR.inkSoft }}>
                  Includes{" "}
                  <span className="font-mono-num font-semibold" style={{ color: COLOR.good }}>
                    {money(report.todayTips)}
                  </span>{" "}
                  in tips — the staff's, not the shop's.
                </p>
              )}
            </div>

            {/* Counting the drawer at close. Cash is the only half that has to be
                matched by hand — the card total comes from the reader. */}
            {canCloseOut(me?.role) && (
              <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
                <p className="text-base font-semibold">Close out the day</p>
                {todayCloseout ? (
                  <div className="mt-2">
                    <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                      Closed at{" "}
                      {new Date(todayCloseout.closedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      {todayCloseout.closedByName ? ` by ${todayCloseout.closedByName}` : ""}.
                    </p>
                    <p
                      className="font-mono-num mt-1 text-xl font-semibold"
                      style={{ color: todayCloseout.difference === 0 ? COLOR.good : COLOR.alert }}
                    >
                      {todayCloseout.difference === 0
                        ? "Balanced"
                        : `${money(Math.abs(todayCloseout.difference))} ${todayCloseout.difference > 0 ? "over" : "short"}`}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: COLOR.inkSoft }}>
                      Counted {money(todayCloseout.countedCash)} against{" "}
                      {money(todayCloseout.expectedCash)} expected.
                    </p>
                    {report.takings.cash !== todayCloseout.expectedCash && (
                      <p className="mt-1 text-xs" style={{ color: COLOR.alert }}>
                        Cash has moved since — now {money(report.takings.cash)}. Count again if
                        the day is not finished.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm" style={{ color: COLOR.inkSoft }}>Cash expected in the drawer</span>
                        <span className="font-mono-num text-sm font-semibold" style={{ color: COLOR.ink }}>
                          {money(report.takings.cash)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm" style={{ color: COLOR.inkSoft }}>On the card reader</span>
                        <span className="font-mono-num text-sm" style={{ color: COLOR.inkSoft }}>
                          {money(report.takings.card)}
                        </span>
                      </div>
                    </div>
                    <label className="mt-3 block text-xs font-medium" style={{ color: COLOR.inkSoft }}>
                      Cash counted
                    </label>
                    <input
                      inputMode="decimal"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      placeholder={report.takings.cash.toFixed(2)}
                      className="font-mono-num mt-1 w-full rounded-xl border px-3 py-2 text-base"
                      style={{ borderColor: COLOR.line, color: COLOR.ink }}
                    />
                    {countedCash !== "" && countedValid && (
                      <p
                        className="mt-1.5 text-sm font-semibold"
                        style={{ color: countedDiff === 0 ? COLOR.good : COLOR.alert }}
                      >
                        {countedDiff === 0
                          ? "Balanced"
                          : `${money(Math.abs(countedDiff))} ${countedDiff > 0 ? "over" : "short"}`}
                      </p>
                    )}
                    <button
                      onClick={saveCloseout}
                      disabled={saving || !countedValid}
                      className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold"
                      style={{
                        background: countedValid ? COLOR.forest : COLOR.line,
                        color: countedValid ? "#fff" : COLOR.inkSoft,
                      }}
                    >
                      Save close-out
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Today's sales, so a wrong one can be found and undone. */}
            <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              <p className="text-base font-semibold mb-3">Today's sales</p>
              {report.todayLog.length === 0 ? (
                <p className="text-sm" style={{ color: COLOR.inkSoft }}>Nothing rung up yet today.</p>
              ) : (
                <div className="space-y-3">
                  {report.todayLog.map((order) => (
                    <div
                      key={order.key}
                      className="border-b pb-3 last:border-0 last:pb-0"
                      style={{ borderColor: COLOR.line, opacity: order.allVoided ? 0.55 : 1 }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs" style={{ color: COLOR.inkSoft }}>
                          {new Date(order.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          {order.userName ? ` · ${order.userName}` : ""}
                          {order.payment ? ` · ${order.payment === "cash" ? "Cash" : "Card"}` : ""}
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono-num text-sm font-semibold" style={{ color: COLOR.ink }}>
                            {money(order.gross)}
                          </span>
                          <button
                            onClick={() => setReceipt(order)}
                            className="rounded-lg border px-2 py-1 text-xs font-medium"
                            style={{ borderColor: COLOR.line, color: COLOR.inkSoft }}
                          >
                            Receipt
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 space-y-1">
                        {order.bowls.map((s) => (
                          <div key={s.id} className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className="truncate text-sm font-medium"
                                style={{
                                  color: COLOR.ink,
                                  textDecoration: s.voided ? "line-through" : "none",
                                }}
                              >
                                {s.productName} · <span className="capitalize">{s.size}</span>
                              </p>
                              {s.voided && (
                                <p className="text-xs font-medium" style={{ color: COLOR.alert }}>
                                  Voided{s.voidedByName ? ` by ${s.voidedByName}` : ""} — stock returned
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className="font-mono-num text-sm"
                                style={{
                                  color: COLOR.inkSoft,
                                  textDecoration: s.voided ? "line-through" : "none",
                                }}
                              >
                                {money(s.price)}
                              </span>
                              {!s.voided && canVoidSale(me?.role, s, me?.id) && (
                                <button
                                  onClick={() => setVoiding(s)}
                                  disabled={saving}
                                  className="rounded-lg border px-2 py-1 text-xs font-medium"
                                  style={{ borderColor: COLOR.line, color: COLOR.alert }}
                                >
                                  Void
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!canVoidAnySale(me?.role) && (
                <p className="mt-2 text-xs" style={{ color: COLOR.inkSoft }}>
                  You can void your own sales from today. Anything else needs a manager.
                </p>
              )}
            </div>

            <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              <p className="text-base font-semibold mb-3">Sold by</p>
              {report.people.length === 0 ? (
                <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                  No sales today yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {report.people.map((p) => (
                    <div key={p.name} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-base" style={{ color: COLOR.ink }}>
                        {p.name}
                      </span>
                      <span className="shrink-0 text-sm" style={{ color: COLOR.inkSoft }}>
                        {p.count} {p.count === 1 ? "bowl" : "bowls"} ·{" "}
                        <span className="font-mono-num font-semibold" style={{ color: COLOR.forest }}>
                          {money(p.total)}
                        </span>
                        {p.tips > 0 && (
                          <>
                            {" · "}
                            <span className="font-mono-num font-semibold" style={{ color: COLOR.good }}>
                              {money(p.tips)}
                            </span>{" "}
                            tips
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl p-4" style={{ background: COLOR.card, boxShadow: COLOR.lift }}>
              <p className="text-base font-semibold mb-1">Favorite topping</p>
              <p className="text-lg font-semibold">{report.topTopping ? report.topTopping[0] : "—"}</p>
              <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                {report.topTopping
                  ? `ordered ${report.topTopping[1]} ${report.topTopping[1] === 1 ? "time" : "times"}`
                  : "nothing added yet"}
              </p>
            </div>

            {report.lowStock.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: COLOR.alertPale }}>
                <p className="text-base font-semibold mb-1 flex items-center gap-1.5" style={{ color: COLOR.alert }}>
                  <AlertTriangle size={16} /> Check inventory
                </p>
                <p className="text-sm" style={{ color: COLOR.alert }}>
                  {report.lowStock.map((i) => i.name).join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "equipo" && (
          <TeamPanel
            me={me}
            onSignOut={signOut}
            taxRate={taxRate}
            onSaveTaxRate={saveTaxRate}
            menuEditor={
              <MenuEditor
                menu={menu}
                ingredients={ingredients}
                onSave={saveMenu}
                saving={saving}
              />
            }
          />
        )}
      </div>

      {/* Bottom nav */}
      <div className="pad-home-indicator fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-md" style={{ background: COLOR.card, borderTop: `1px solid ${COLOR.line}` }}>
        <TabButton active={tab === "pos"} onClick={() => setTab("pos")} icon={ShoppingBag} label="Sales" />
        {showInventory && (
          <TabButton active={tab === "inventario"} onClick={() => setTab("inventario")} icon={Package} label="Inventory" />
        )}
        <TabButton active={tab === "reportes"} onClick={() => setTab("reportes")} icon={BarChart3} label="Reports" />
        <TabButton active={tab === "equipo"} onClick={() => setTab("equipo")} icon={Users} label="Team" />
      </div>
    </div>
  );
}
