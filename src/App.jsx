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
import auth from "./lib/auth";
import { COLOR } from "./theme";
import { SignInScreen, TeamPanel } from "./Auth";
import { canSeeInventory } from "./lib/roles";
import bowlImage from "./assets/bowl.jpg";

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
      style={{ color: active ? COLOR.acai : COLOR.inkSoft }}
    >
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
      <span className="text-xs font-medium tracking-wide">{label}</span>
      <div className="h-0.5 w-6 rounded-full" style={{ background: active ? COLOR.passion : "transparent" }} />
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
          style={{ background: COLOR.acaiPale, color: COLOR.acai }}
        >
          {parts.join(" · ")}
        </p>
      )}
    </div>
  );
}

// Taking the money is a screen of its own, over the register rather than beside it:
// the tip has to be asked for before the card is run, and how they paid has to be
// recorded or the drawer cannot be settled at close.
function PaymentSheet({
  subtotal, tax, taxRate, tip, total, tipChoice, onTipChoice, tipCustom, onTipCustom,
  method, onMethod, cashGiven, onCashGiven, change, canCharge, saving, onCharge, onClose,
}) {
  const Row = ({ label, value, strong }) => (
    <div className="flex items-baseline justify-between">
      <span className={strong ? "text-base font-semibold" : "text-sm"} style={{ color: strong ? COLOR.ink : COLOR.inkSoft }}>
        {label}
      </span>
      <span
        className={`font-mono-num ${strong ? "text-xl font-semibold" : "text-sm"}`}
        style={{ color: strong ? COLOR.acai : COLOR.inkSoft }}
      >
        {money(value)}
      </span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(43,18,36,0.45)" }}>
      <div
        className="pad-home-indicator max-h-full w-full max-w-md self-center overflow-y-auto rounded-t-2xl px-4 pt-4"
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
                borderColor: tipChoice === value ? COLOR.kiwi : COLOR.line,
                background: tipChoice === value ? "#EFF6E4" : "transparent",
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
              borderColor: tipChoice === "custom" ? COLOR.kiwi : COLOR.line,
              background: tipChoice === "custom" ? "#EFF6E4" : "transparent",
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
                borderColor: method === value ? COLOR.acai : COLOR.line,
                background: method === value ? COLOR.acaiPale : "transparent",
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
                style={{ color: change < 0 ? COLOR.alert : COLOR.kiwi }}
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
            background: canCharge && !saving ? COLOR.passion : COLOR.line,
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
        background: COLOR.acai,
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
          <span className="font-semibold" style={{ color: COLOR.kiwi }}>Included:</span>{" "}
          {included.join(", ")}
        </p>
      )}
      {extras.length > 0 && (
        <p className="text-xs" style={{ color: COLOR.inkSoft }}>
          <span className="font-semibold" style={{ color: COLOR.acai }}>Extras:</span>{" "}
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
  const c = low ? COLOR.alert : pct < 0.4 ? COLOR.passion : COLOR.kiwi;
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
      <p className="text-sm font-semibold text-center mb-2" style={{ color: COLOR.acai }}>
        Step {step + 1} of {STEPS.length} — {STEPS[step].label}
      </p>
      <div className="flex items-center gap-1.5">
        {STEPS.map(({ label }, i) => (
          <button
            key={label}
            onClick={() => onJump(i)}
            aria-label={`Go to ${label}`}
            className="flex-1 h-2.5 rounded-full transition-all"
            style={{ background: i <= step ? COLOR.acai : COLOR.line }}
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
  const [tipChoice, setTipChoice] = useState(0);
  const [tipCustom, setTipCustom] = useState("");
  const [payMethod, setPayMethod] = useState(null);
  const [cashGiven, setCashGiven] = useState("");
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
    let mn = defaultMenu();
    try {
      const shop = await storage.get(STORAGE_SHOP);
      if (shop && shop.value) {
        const d = JSON.parse(shop.value);
        if (d.ingredients) ing = d.ingredients;
        if (d.sales) sl = d.sales;
      }
    } catch (e) {
      // A missing key is the first-run case: seed it. A lapsed session is not.
      if (handleStorageError(e)) return;
      try {
        await storage.set(STORAGE_SHOP, JSON.stringify({ ingredients: ing, sales: sl }));
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
    setIngredients(ing);
    setSales(sl);
    setMenu(mn);
    // Nothing is chosen for the customer: size and flavour start empty, so no button
    // looks picked until someone picks it. The free toppings are the exception —
    // they are on the bowl unless removed, which is what the green box says.
    setBuilder({ productId: null, size: null, toppingIds: [...mn.includedToppingIds] });
    setReady(true);
  }

  async function persistShop(nextIngredients, nextSales) {
    setIngredients(nextIngredients);
    setSales(nextSales);
    try {
      await storage.set(STORAGE_SHOP, JSON.stringify({ ingredients: nextIngredients, sales: nextSales }));
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
    setPaying(false);
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
      const product = menu.products.find((p) => p.id === item.productId);
      if (product) {
        const baseIng = nextIngredients.find((i) => i.id === product.baseIngredientId);
        if (baseIng) consume(product.baseIngredientId, baseIng.per * product.baseUnits[item.size]);
      }
      item.toppingIds.forEach((tid) => {
        const t = menu.toppings.find((tp) => tp.id === tid);
        if (t) {
          const ing = nextIngredients.find((i) => i.id === t.ingredientId);
          if (ing) consume(ing.id, ing.per);
        }
      });
    });
    const now = new Date().toISOString();
    const newSales = [
      ...sales,
      ...cart.map((item) => ({
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
      })),
    ];
    await persistShop(nextIngredients, newSales);
    setCart([]);
    setSaving(false);
    closePayment();
    showToast(`Charged ${money(amountDue)}`);
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
    const next = ingredients.map((i) => (i.id === restockId ? { ...i, stock: i.stock + amt } : i));
    await persistShop(next, sales);
    setRestockId(null);
    setRestockAmt("");
    showToast("Inventory updated");
  }

  async function addIngredient() {
    if (!newIngName.trim()) return;
    const next = [
      ...ingredients,
      { id: uid(), name: newIngName.trim(), unit: "g", stock: 0, low: 100, per: 10, color: "#B98CA8" },
    ];
    await persistShop(next, sales);
    setNewIngName("");
    showToast("Ingredient added");
  }

  // ---------- Reports ----------
  const report = useMemo(() => {
    const today = todayKey();
    const todaySales = sales.filter((s) => s.date.slice(0, 10) === today);
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
    sales.forEach((s) => {
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
    sales.forEach((s) => {
      prodCount[s.productName] = (prodCount[s.productName] || 0) + 1;
    });
    const topProduct = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0];

    const topCount = {};
    sales.forEach((s) =>
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

    return {
      todayTotal,
      todayTax,
      todayTips,
      takings,
      todayCollected,
      todayCount: todaySales.length,
      days,
      topProduct,
      topTopping,
      lowStock,
      people,
    };
  }, [sales, ingredients, menu]);

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
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
      .font-display { font-family: 'Fraunces', serif; }
      .font-mono-num { font-family: 'IBM Plex Mono', monospace; }
    `}</style>
  );

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLOR.bg }}>
        {typography}
        <div style={{ color: COLOR.acai }} className="text-sm font-medium">
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
        <div style={{ color: COLOR.acai }} className="text-sm font-medium">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLOR.bg, fontFamily: "'Space Grotesk', sans-serif" }}>
      {typography}

      {/* Header */}
      <div className="pad-status-bar relative px-5 pb-4" style={{ background: COLOR.acai }}>
        <h1 className="font-display text-2xl" style={{ color: "#F7ECF3" }}>
          Quick Açaí
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "#D9B9CC" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
          {" · "}
          {me.name}
        </p>

        {/* Fix #5: live cart badge, visible through the whole builder flow */}
        {tab === "pos" && cart.length > 0 && (
          <button
            onClick={scrollToCart}
            className="absolute right-4 top-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold shadow-md"
            style={{ background: COLOR.passion, color: "#fff" }}
          >
            <ShoppingBag size={14} /> {cart.length} · {money(cartTotal)}
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2"
          style={{ background: toast.isError ? COLOR.alert : COLOR.acai, color: "#fff" }}
        >
          {toast.isError ? <AlertTriangle size={14} /> : <Check size={14} />}
          {toast.msg}
        </div>
      )}

      {paying && (
        <PaymentSheet
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
            <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
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
                        borderColor: builder.size === sz ? COLOR.passion : COLOR.line,
                        background: builder.size === sz ? "#FDEEE0" : "transparent",
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
                            borderColor: picked ? COLOR.acai : COLOR.line,
                            background: picked ? COLOR.acaiPale : "transparent",
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

                  <div className="rounded-xl p-3" style={{ background: "#EFF6E4", border: `1px solid ${COLOR.kiwi}55` }}>
                    <p className="text-sm font-semibold" style={{ color: COLOR.kiwi }}>
                      ✓ These four are free
                    </p>
                    <p className="mb-2 text-xs" style={{ color: COLOR.kiwi }}>
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
                              borderColor: on ? COLOR.kiwi : COLOR.line,
                              background: on ? COLOR.kiwi : "transparent",
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

                  <div className="rounded-xl px-3 py-2.5" style={{ background: COLOR.acaiPale }}>
                    <p className="text-sm font-semibold" style={{ color: COLOR.acai }}>
                      {money(menu.toppingPrice)} each — nothing here is free
                    </p>
                    <p className="text-xs" style={{ color: COLOR.acaiLight }}>
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
                              borderColor: on ? COLOR.acai : COLOR.line,
                              background: on ? COLOR.acai : "transparent",
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
                  <div className="rounded-xl p-3" style={{ background: COLOR.acaiPale }}>
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
                      <span className="font-mono-num text-xl font-semibold" style={{ color: COLOR.acai }}>
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
                      background: builderReady ? COLOR.passion : COLOR.line,
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
            <div ref={cartSectionRef} className="rounded-2xl p-4 scroll-mt-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
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
                      <span className="font-mono-num text-xl font-semibold" style={{ color: COLOR.acai }}>
                        {money(cartTotal)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setPaying(true)}
                    className="w-full rounded-xl py-3 text-base font-semibold"
                    style={{ background: COLOR.passion, color: "#fff" }}
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
              <div className="rounded-xl p-3 text-sm flex items-start gap-2" style={{ background: "#FBEAEC", color: COLOR.alert }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>Low stock: {report.lowStock.map((i) => i.name).join(", ")}.</span>
              </div>
            )}
            {ingredients.map((ing) => {
              const pct = Math.min(1, ing.stock / (ing.low * 3 || 1));
              const low = ing.stock <= ing.low;
              return (
                <div key={ing.id} className="rounded-2xl p-3.5" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
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
                      <button onClick={restock} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: COLOR.kiwi, color: "#fff" }}>
                        Save
                      </button>
                      <button onClick={() => setRestockId(null)}>
                        <X size={16} color={COLOR.inkSoft} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setRestockId(ing.id)} className="text-sm font-medium mt-2" style={{ color: COLOR.acai }}>
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
              <button onClick={addIngredient} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: COLOR.acai, color: "#fff" }}>
                Add
              </button>
            </div>
          </div>
        )}

        {tab === "reportes" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={{ background: COLOR.acai }}>
                <p className="text-sm" style={{ color: "#D9B9CC" }}>Sales today</p>
                <p className="font-mono-num text-xl font-semibold mt-1" style={{ color: "#fff" }}>{money(report.todayTotal)}</p>
                <p className="text-sm mt-0.5" style={{ color: "#D9B9CC" }}>{report.todayCount} bowls</p>
                {(report.todayTax > 0 || report.todayTips > 0) && (
                  <p className="mt-2 text-xs leading-snug" style={{ color: "#D9B9CC" }}>
                    before tax and tips · took{" "}
                    <span className="font-mono-num">{money(report.todayCollected)}</span>
                  </p>
                )}
              </div>
              <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
                <p className="text-sm" style={{ color: COLOR.inkSoft }}>Best seller</p>
                <p className="text-lg font-semibold mt-1">{report.topProduct ? report.topProduct[0] : "—"}</p>
                <p className="text-sm mt-0.5" style={{ color: COLOR.inkSoft }}>
                  {report.topProduct ? `${report.topProduct[1]} sold` : "no data yet"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
              <p className="text-base font-semibold mb-3">Last 7 days</p>
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer>
                  <BarChart data={report.days}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLOR.line} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: COLOR.inkSoft }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: COLOR.inkSoft }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                    <Bar dataKey="total" fill={COLOR.acai} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {report.todayTax > 0 && (
              <div
                className="rounded-2xl p-4"
                style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
              >
                <p className="text-base font-semibold">Sales tax collected today</p>
                <p className="font-mono-num mt-1 text-xl font-semibold" style={{ color: COLOR.acai }}>
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
            <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
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
                  <span className="font-mono-num font-semibold" style={{ color: COLOR.kiwi }}>
                    {money(report.todayTips)}
                  </span>{" "}
                  in tips — the staff's, not the shop's.
                </p>
              )}
            </div>

            <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
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
                        <span className="font-mono-num font-semibold" style={{ color: COLOR.acai }}>
                          {money(p.total)}
                        </span>
                        {p.tips > 0 && (
                          <>
                            {" · "}
                            <span className="font-mono-num font-semibold" style={{ color: COLOR.kiwi }}>
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

            <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
              <p className="text-base font-semibold mb-1">Favorite topping</p>
              <p className="text-lg font-semibold">{report.topTopping ? report.topTopping[0] : "—"}</p>
              <p className="text-sm" style={{ color: COLOR.inkSoft }}>
                {report.topTopping ? `ordered ${report.topTopping[1]} times` : "no data yet"}
              </p>
            </div>

            {report.lowStock.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: "#FBEAEC" }}>
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
