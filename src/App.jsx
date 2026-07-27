import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ShoppingBag,
  Package,
  BarChart3,
  Plus,
  AlertTriangle,
  X,
  Check,
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
import storage from "./lib/storage";

// ---------- Design tokens ----------
const COLOR = {
  acai: "#4B1D3F",
  acaiLight: "#7A3866",
  acaiPale: "#F4E9F0",
  passion: "#F2994A",
  kiwi: "#7C9A3A",
  alert: "#C6414F",
  bg: "#FAF4F7",
  card: "#FFFFFF",
  ink: "#241820",
  inkSoft: "#6E5C68",
  line: "#EADFE6",
};

const STORAGE_SHOP = "shop-data-v3";
const STORAGE_MENU = "menu-config-v3";
const TOPPING_PRICE = 0.99;
const CATEGORY_ORDER = ["Dairy", "Nuts", "Fruits", "Others"];
const STEP_LABELS = ["Size", "Flavor", "Toppings", "Review"];

const FLAVOR_EMOJI = {
  acai: "🫐",
  cacao: "🍫",
  pina: "🍍",
  coconut: "🥥",
  passion: "🟡",
  dragon: "🐉",
  mango_cream: "🥭",
  spicy_mango: "🌶️",
  matcha: "🍵",
};

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
        Step {step + 1} of {STEP_LABELS.length} — {STEP_LABELS[step]}
      </p>
      <div className="flex items-center gap-1.5">
        {STEP_LABELS.map((label, i) => (
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

// Signature element: radial bowl preview showing base + chosen toppings
function BowlPreview({ baseColor, toppingIds, toppings, ingredients }) {
  const active = toppingIds
    .map((id) => toppings.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => ingredients.find((i) => i.id === t.ingredientId))
    .filter(Boolean);

  return (
    <div className="relative mx-auto" style={{ width: 168, height: 168 }}>
      <div
        className="absolute inset-0 rounded-full shadow-inner"
        style={{ background: `radial-gradient(circle at 35% 30%, ${baseColor}dd, ${baseColor} 70%)` }}
      />
      <div
        className="absolute inset-[10px] rounded-full flex items-center justify-center text-sm font-medium text-center px-3"
        style={{ background: `radial-gradient(circle at 40% 35%, ${baseColor}cc, ${baseColor}f2 75%)`, color: "#FCF7FA" }}
      >
        {active.length === 0 ? "your bowl" : `${active.length} topping${active.length > 1 ? "s" : ""}`}
      </div>
      {active.map((ing, idx) => {
        const angle = (idx / Math.max(active.length, 1)) * 2 * Math.PI - Math.PI / 2;
        const r = 76;
        const x = 84 + r * Math.cos(angle) - 9;
        const y = 84 + r * Math.sin(angle) - 9;
        return (
          <div
            key={ing.id + idx}
            title={ing.name}
            className="absolute rounded-full border-2"
            style={{ left: x, top: y, width: 18, height: 18, background: ing.color, borderColor: "#fff" }}
          />
        );
      })}
    </div>
  );
}

export default function AcaiControlApp() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("pos");
  const [ingredients, setIngredients] = useState([]);
  const [sales, setSales] = useState([]);
  const [menu, setMenu] = useState(defaultMenu());
  const [cart, setCart] = useState([]);
  const [builder, setBuilder] = useState({ productId: null, size: "small", toppingIds: [] });
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState(null);
  const [restockId, setRestockId] = useState(null);
  const [restockAmt, setRestockAmt] = useState("");
  const [newIngName, setNewIngName] = useState("");
  const [saving, setSaving] = useState(false);
  const cartSectionRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

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
      try {
        await storage.set(STORAGE_SHOP, JSON.stringify({ ingredients: ing, sales: sl }));
      } catch (e2) {}
    }
    try {
      const menuRes = await storage.get(STORAGE_MENU);
      if (menuRes && menuRes.value) {
        mn = JSON.parse(menuRes.value);
      }
    } catch (e) {
      try {
        await storage.set(STORAGE_MENU, JSON.stringify(mn));
      } catch (e2) {}
    }
    setIngredients(ing);
    setSales(sl);
    setMenu(mn);
    setBuilder({ productId: mn.products[0]?.id || null, size: "small", toppingIds: [...mn.includedToppingIds] });
    setReady(true);
  }

  async function persistShop(nextIngredients, nextSales) {
    setIngredients(nextIngredients);
    setSales(nextSales);
    try {
      await storage.set(STORAGE_SHOP, JSON.stringify({ ingredients: nextIngredients, sales: nextSales }));
    } catch (e) {
      showToast("Couldn't save. Please try again.", true);
    }
  }

  function showToast(msg, isError) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2200);
  }

  const currentProduct = menu.products.find((p) => p.id === builder.productId);
  const extraCount = builder.toppingIds.filter((id) => !menu.includedToppingIds.includes(id)).length;
  const builderPrice = (currentProduct ? currentProduct.sizes[builder.size] : 0) + extraCount * menu.toppingPrice;

  function toggleTopping(id) {
    setBuilder((b) => {
      const has = b.toppingIds.includes(id);
      return { ...b, toppingIds: has ? b.toppingIds.filter((t) => t !== id) : [...b.toppingIds, id] };
    });
  }

  function resetBuilder(productId) {
    setBuilder({ productId, size: "small", toppingIds: [...menu.includedToppingIds] });
    setStep(0);
  }

  function addToCart() {
    if (!currentProduct) return;
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
    resetBuilder(currentProduct.id);
    showToast("Added to order");
  }

  function removeFromCart(cartId) {
    setCart((c) => c.filter((i) => i.cartId !== cartId));
  }

  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  async function checkout() {
    if (cart.length === 0) return;
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
      })),
    ];
    await persistShop(nextIngredients, newSales);
    setCart([]);
    setSaving(false);
    showToast(`Charged ${money(cartTotal)}`);
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
    const todayTotal = todaySales.reduce((s, i) => s + i.price, 0);

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

    return { todayTotal, todayCount: todaySales.length, days, topProduct, topTopping, lowStock };
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

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLOR.bg }}>
        <div style={{ color: COLOR.acai }} className="text-sm font-medium">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLOR.bg, fontFamily: "'Space Grotesk', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-mono-num { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      {/* Header */}
      <div className="px-5 pt-6 pb-4 relative" style={{ background: COLOR.acai }}>
        <h1 className="font-display text-2xl" style={{ color: "#F7ECF3" }}>
          Açaí Control
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "#D9B9CC" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
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

      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4 max-w-md w-full mx-auto">
        {tab === "pos" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
              <BowlPreview
                baseColor={currentProduct?.color || COLOR.acai}
                toppingIds={builder.toppingIds}
                toppings={menu.toppings}
                ingredients={ingredients}
              />

              <ProgressSteps step={step} onJump={setStep} />

              {/* Step 1: Size */}
              {step === 0 && (
                <div className="space-y-2">
                  <p className="text-base font-semibold text-center mb-1" style={{ color: COLOR.ink }}>
                    Choose a size
                  </p>
                  {["small", "medium", "large"].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => {
                        setBuilder((b) => ({ ...b, size: sz }));
                        setStep(1);
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl border-2 capitalize"
                      style={{
                        borderColor: builder.size === sz ? COLOR.passion : COLOR.line,
                        background: builder.size === sz ? "#FDEEE0" : "transparent",
                      }}
                    >
                      <span className="text-base font-medium" style={{ color: COLOR.ink }}>{sz}</span>
                      <span className="font-mono-num text-base font-semibold" style={{ color: COLOR.ink }}>
                        {currentProduct ? money(currentProduct.sizes[sz]) : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: Flavor */}
              {step === 1 && (
                <div className="space-y-2">
                  <p className="text-base font-semibold text-center mb-1" style={{ color: COLOR.ink }}>
                    Pick your flavor
                  </p>
                  {menu.products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setBuilder((b) => ({ ...b, productId: p.id }));
                        setStep(2);
                      }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition"
                      style={{
                        borderColor: builder.productId === p.id ? COLOR.acai : COLOR.line,
                        background: builder.productId === p.id ? COLOR.acaiPale : "transparent",
                      }}
                    >
                      <span
                        className="flex items-center justify-center rounded-full text-2xl shrink-0"
                        style={{ width: 44, height: 44, background: `${p.color}22` }}
                      >
                        {FLAVOR_EMOJI[p.id] || "🍧"}
                      </span>
                      <span className="text-base font-medium" style={{ color: COLOR.ink }}>{p.name}</span>
                    </button>
                  ))}
                  <button onClick={() => setStep(0)} className="text-sm font-medium mt-1" style={{ color: COLOR.inkSoft }}>
                    ← Back
                  </button>
                </div>
              )}

              {/* Step 3: Toppings — all in one screen, free ones grouped up top */}
              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-base font-semibold text-center" style={{ color: COLOR.ink }}>
                    Add toppings
                  </p>

                  <div className="rounded-xl p-3" style={{ background: "#EFF6E4", border: `1px solid ${COLOR.kiwi}55` }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: COLOR.kiwi }}>
                      ✓ Included free — tap to remove any you don't want
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
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: ing?.color || "#ccc", border: "1px solid rgba(0,0,0,0.15)" }}
                            />
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-xs text-center" style={{ color: COLOR.inkSoft }}>
                    Everything below is {money(menu.toppingPrice)} each
                  </p>

                  {CATEGORY_ORDER.map((cat) => (
                    <div key={cat}>
                      <p className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: COLOR.inkSoft }}>
                        {cat}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(toppingsByCategory[cat] || []).map((t) => {
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
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ background: ing?.color || "#ccc", border: "1px solid rgba(0,0,0,0.15)" }}
                              />
                              {t.name}
                              {out && " · out of stock"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setStep(1)} className="text-sm font-medium px-2" style={{ color: COLOR.inkSoft }}>
                      ← Back
                    </button>
                    <button
                      onClick={() => setStep(3)}
                      className="flex-1 rounded-xl py-3 text-base font-semibold"
                      style={{ background: COLOR.acai, color: "#fff" }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 3 && (
                <div className="space-y-3">
                  <p className="text-base font-semibold text-center" style={{ color: COLOR.ink }}>
                    Review your bowl
                  </p>
                  <div className="rounded-xl p-3" style={{ background: COLOR.acaiPale }}>
                    <p className="text-base font-semibold" style={{ color: COLOR.ink }}>
                      {currentProduct?.name} · <span className="capitalize">{builder.size}</span>
                    </p>
                    <p className="text-sm mt-1" style={{ color: COLOR.inkSoft }}>
                      {builder.toppingIds.length > 0
                        ? builder.toppingIds.map((id) => menu.toppings.find((t) => t.id === id)?.name).join(", ")
                        : "No toppings"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-base font-semibold" style={{ color: COLOR.ink }}>Price</span>
                    <span className="font-mono-num text-xl font-semibold" style={{ color: COLOR.acai }}>
                      {money(builderPrice)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(2)} className="text-sm font-medium px-2" style={{ color: COLOR.inkSoft }}>
                      ← Back
                    </button>
                    <button
                      onClick={addToCart}
                      className="flex-1 rounded-xl py-3 text-base font-semibold flex items-center justify-center gap-2"
                      style={{ background: COLOR.passion, color: "#fff" }}
                    >
                      <Plus size={18} /> Add to order
                    </button>
                  </div>
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
                  <div className="border-t pt-2 mt-2 flex items-center justify-between" style={{ borderColor: COLOR.line }}>
                    <span className="text-base font-semibold">Total</span>
                    <span className="font-mono-num text-xl font-semibold" style={{ color: COLOR.acai }}>
                      {money(cartTotal)}
                    </span>
                  </div>
                  <button
                    onClick={checkout}
                    disabled={saving}
                    className="w-full rounded-xl py-3 text-base font-semibold"
                    style={{ background: COLOR.passion, color: "#fff" }}
                  >
                    {saving ? "Charging…" : "Charge"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "inventario" && (
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
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 flex max-w-md mx-auto w-full" style={{ background: COLOR.card, borderTop: `1px solid ${COLOR.line}` }}>
        <TabButton active={tab === "pos"} onClick={() => setTab("pos")} icon={ShoppingBag} label="Sales" />
        <TabButton active={tab === "inventario"} onClick={() => setTab("inventario")} icon={Package} label="Inventory" />
        <TabButton active={tab === "reportes"} onClick={() => setTab("reportes")} icon={BarChart3} label="Reports" />
      </div>
    </div>
  );
}
