// Editing the menu from the shop rather than from the code.
//
// Prices change, flavours come and go, and a topping that used to be free stops
// being free. Until this existed every one of those was a change to defaultMenu()
// and a redeploy, which put the shop's own menu out of the shop's reach.
//
// The menu and the ingredient list are edited together on purpose: a flavour needs
// a base to pour and a topping needs something to scoop, so adding one here creates
// the ingredient it consumes. Stock starts at zero — the app should not claim to
// have something in the store room that nobody has put there.

import React, { useState } from "react";
import { Plus, X, AlertTriangle, ChevronDown } from "lucide-react";
import { COLOR } from "./theme";

const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const SIZES = ["small", "medium", "large"];
const CATEGORIES = ["Dairy", "Nuts", "Fruits", "Others"];
const UNITS = ["g", "ml", "pcs"];

// A readable id derived from the name, kept unique against what already exists —
// ids end up in sale records, so a collision would silently merge two things.
function slugify(name, taken) {
  const base =
    String(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "item";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

function Section({ title, hint, children, open, onToggle }) {
  return (
    <div className="rounded-2xl" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span>
          <span className="block text-base font-semibold" style={{ color: COLOR.ink }}>{title}</span>
          {hint && <span className="block text-xs" style={{ color: COLOR.inkSoft }}>{hint}</span>}
        </span>
        <ChevronDown
          size={18}
          color={COLOR.inkSoft}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
        />
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: COLOR.line }}>{children}</div>}
    </div>
  );
}

function Row({ children }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b py-2 last:border-0"
      style={{ borderColor: COLOR.line }}
    >
      {children}
    </div>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className={`rounded-xl border px-3 py-2 text-sm outline-none ${props.className || ""}`}
      style={{ borderColor: COLOR.line, color: COLOR.ink, background: "#fff", ...(props.style || {}) }}
    />
  );
}

export default function MenuEditor({ menu, ingredients, onSave, saving }) {
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Prices are edited as text so a half-typed "1." does not become NaN mid-keystroke.
  const first = menu.products[0];
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(SIZES.map((s) => [s, String(first?.sizes?.[s] ?? "")]))
  );
  const [toppingPrice, setToppingPrice] = useState(String(menu.toppingPrice ?? ""));
  const [newFlavor, setNewFlavor] = useState("");
  const [newTopping, setNewTopping] = useState({ name: "", category: "Others", unit: "g", per: "15" });

  const toggle = (key) => setOpen((o) => (o === key ? null : key));
  const fail = (msg) => {
    setError(msg);
    return false;
  };

  async function commit(nextMenu, nextIngredients = ingredients, message) {
    setError("");
    await onSave(nextMenu, nextIngredients, message);
  }

  function savePrices() {
    const parsed = {};
    for (const s of SIZES) {
      const v = parseFloat(prices[s]);
      if (!Number.isFinite(v) || v < 0) return fail(`Give ${s} a price of zero or more.`);
      parsed[s] = Math.round(v * 100) / 100;
    }
    const tp = parseFloat(toppingPrice);
    if (!Number.isFinite(tp) || tp < 0) return fail("Give the toppings a price of zero or more.");
    // Every bowl is priced by size, not by flavour, so one edit applies to all of them.
    commit(
      {
        ...menu,
        toppingPrice: Math.round(tp * 100) / 100,
        products: menu.products.map((p) => ({ ...p, sizes: { ...parsed } })),
      },
      ingredients,
      "Prices saved"
    );
  }

  function toggleFree(id) {
    const on = menu.includedToppingIds.includes(id);
    commit(
      {
        ...menu,
        includedToppingIds: on
          ? menu.includedToppingIds.filter((t) => t !== id)
          : [...menu.includedToppingIds, id],
      },
      ingredients,
      on ? "Now charged" : "Now included free"
    );
  }

  // On blur, not on every keystroke: renaming is a write to the shared database that
  // every other register picks up, and one per letter typed is not that.
  function renameProduct(id, name, was) {
    const clean = name.trim();
    if (!clean || clean === was) return;
    commit({ ...menu, products: menu.products.map((p) => (p.id === id ? { ...p, name: clean } : p)) });
  }

  function renameTopping(id, name, was) {
    const clean = name.trim();
    if (!clean || clean === was) return;
    commit({ ...menu, toppings: menu.toppings.map((t) => (t.id === id ? { ...t, name: clean } : t)) });
  }

  function addFlavor() {
    const name = newFlavor.trim();
    if (!name) return fail("Name the flavor first.");
    if (menu.products.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return fail("There is already a flavor with that name.");
    const id = slugify(name, menu.products.map((p) => p.id));
    const baseId = slugify(`${name}_base`, ingredients.map((i) => i.id));
    // A new flavour needs something to pour: its base joins the store room empty, to
    // be stocked under Inventory like everything else.
    const base = {
      id: baseId,
      name: `${name} base`,
      unit: "ml",
      stock: 0,
      low: 1500,
      per: 220,
      color: COLOR.acaiLight,
    };
    commit(
      {
        ...menu,
        products: [
          ...menu.products,
          {
            id,
            name,
            baseIngredientId: baseId,
            color: COLOR.acaiLight,
            sizes: { ...(first?.sizes || {}) },
            baseUnits: { ...(first?.baseUnits || { small: 1, medium: 1.4, large: 1.8 }) },
          },
        ],
      },
      [...ingredients, base],
      `${name} added — stock its base under Inventory`
    );
    setNewFlavor("");
  }

  function addTopping() {
    const name = newTopping.name.trim();
    if (!name) return fail("Name the topping first.");
    if (menu.toppings.some((t) => t.name.toLowerCase() === name.toLowerCase()))
      return fail("There is already a topping with that name.");
    const per = parseFloat(newTopping.per);
    if (!Number.isFinite(per) || per <= 0) return fail("How much of it goes on one bowl?");
    const id = slugify(name, menu.toppings.map((t) => t.id));
    const ingId = slugify(name, ingredients.map((i) => i.id));
    commit(
      {
        ...menu,
        toppings: [...menu.toppings, { id, name, category: newTopping.category, ingredientId: ingId }],
      },
      [
        ...ingredients,
        {
          id: ingId,
          name,
          unit: newTopping.unit,
          per,
          stock: 0,
          low: newTopping.unit === "pcs" ? 15 : 500,
          color: COLOR.acaiLight,
        },
      ],
      `${name} added — stock it under Inventory`
    );
    setNewTopping({ name: "", category: "Others", unit: "g", per: "15" });
  }

  function removeFlavor(p) {
    // The ingredient stays: it may have stock, and past sales still name it.
    commit(
      { ...menu, products: menu.products.filter((x) => x.id !== p.id) },
      ingredients,
      `${p.name} taken off the menu`
    );
  }

  function removeTopping(t) {
    commit(
      {
        ...menu,
        toppings: menu.toppings.filter((x) => x.id !== t.id),
        includedToppingIds: menu.includedToppingIds.filter((id) => id !== t.id),
      },
      ingredients,
      `${t.name} taken off the menu`
    );
  }

  const byCategory = CATEGORIES.map((c) => [c, menu.toppings.filter((t) => t.category === c)]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: "#FBEAEC", color: COLOR.alert }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <Section
        title="Prices"
        hint="What a bowl costs by size, and what an extra topping costs."
        open={open === "prices"}
        onToggle={() => toggle("prices")}
      >
        <div className="space-y-2">
          {SIZES.map((s) => (
            <label key={s} className="flex items-center justify-between gap-3">
              <span className="text-sm capitalize" style={{ color: COLOR.ink }}>{s}</span>
              <TextInput
                inputMode="decimal"
                value={prices[s]}
                onChange={(e) => setPrices({ ...prices, [s]: e.target.value })}
                className="font-mono-num w-28 text-right"
              />
            </label>
          ))}
          <label className="flex items-center justify-between gap-3 border-t pt-2" style={{ borderColor: COLOR.line }}>
            <span className="text-sm" style={{ color: COLOR.ink }}>Each paid topping</span>
            <TextInput
              inputMode="decimal"
              value={toppingPrice}
              onChange={(e) => setToppingPrice(e.target.value)}
              className="font-mono-num w-28 text-right"
            />
          </label>
          <p className="text-xs" style={{ color: COLOR.inkSoft }}>
            Bowls are priced by size, so this applies to every flavor. Past sales keep
            the price they were charged.
          </p>
          <button
            onClick={savePrices}
            disabled={saving}
            className="w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: COLOR.kiwi, color: "#fff" }}
          >
            Save prices
          </button>
        </div>
      </Section>

      <Section
        title="Free toppings"
        hint={`${menu.includedToppingIds.length} come with every bowl.`}
        open={open === "free"}
        onToggle={() => toggle("free")}
      >
        <div className="flex flex-wrap gap-2">
          {menu.toppings.map((t) => {
            const on = menu.includedToppingIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleFree(t.id)}
                disabled={saving}
                className="rounded-full border px-3 py-2 text-sm font-medium"
                style={{
                  borderColor: on ? COLOR.kiwi : COLOR.line,
                  background: on ? COLOR.kiwi : "transparent",
                  color: on ? "#fff" : COLOR.ink,
                }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs" style={{ color: COLOR.inkSoft }}>
          Green ones are included. Everything else is {money(menu.toppingPrice)}.
        </p>
      </Section>

      <Section
        title="Flavors"
        hint={`${menu.products.length} on the menu.`}
        open={open === "flavors"}
        onToggle={() => toggle("flavors")}
      >
        {menu.products.map((p) => (
          <Row key={p.id}>
            <TextInput
              key={p.name}
              defaultValue={p.name}
              onBlur={(e) => renameProduct(p.id, e.target.value, p.name)}
              className="min-w-0 flex-1"
            />
            <button
              onClick={() => setConfirmRemove({ kind: "flavor", item: p })}
              aria-label={`Remove ${p.name}`}
              className="shrink-0 rounded-lg border p-2"
              style={{ borderColor: COLOR.line }}
            >
              <X size={14} color={COLOR.alert} />
            </button>
          </Row>
        ))}
        <div className="mt-3 flex gap-2">
          <TextInput
            value={newFlavor}
            onChange={(e) => setNewFlavor(e.target.value)}
            placeholder="New flavor"
            className="min-w-0 flex-1"
          />
          <button
            onClick={addFlavor}
            disabled={saving}
            className="flex shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold"
            style={{ background: COLOR.acai, color: "#fff" }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </Section>

      <Section
        title="Toppings"
        hint={`${menu.toppings.length} on the menu.`}
        open={open === "toppings"}
        onToggle={() => toggle("toppings")}
      >
        {byCategory.map(([cat, list]) => (
          <div key={cat} className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR.inkSoft }}>
              {cat}
            </p>
            {list.length === 0 ? (
              <p className="text-xs" style={{ color: COLOR.inkSoft }}>Nothing here yet.</p>
            ) : (
              list.map((t) => (
                <Row key={t.id}>
                  <TextInput
                    key={t.name}
                    defaultValue={t.name}
                    onBlur={(e) => renameTopping(t.id, e.target.value, t.name)}
                    className="min-w-0 flex-1"
                  />
                  <button
                    onClick={() => setConfirmRemove({ kind: "topping", item: t })}
                    aria-label={`Remove ${t.name}`}
                    className="shrink-0 rounded-lg border p-2"
                    style={{ borderColor: COLOR.line }}
                  >
                    <X size={14} color={COLOR.alert} />
                  </button>
                </Row>
              ))
            )}
          </div>
        ))}

        <div className="space-y-2 rounded-xl p-3" style={{ background: COLOR.bg }}>
          <p className="text-sm font-semibold" style={{ color: COLOR.ink }}>Add a topping</p>
          <TextInput
            value={newTopping.name}
            onChange={(e) => setNewTopping({ ...newTopping, name: e.target.value })}
            placeholder="Name"
            className="w-full"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setNewTopping({ ...newTopping, category: c })}
                className="rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{
                  borderColor: newTopping.category === c ? COLOR.acai : COLOR.line,
                  background: newTopping.category === c ? COLOR.acaiPale : "transparent",
                  color: COLOR.ink,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: COLOR.inkSoft }}>Per bowl</span>
            <TextInput
              inputMode="decimal"
              value={newTopping.per}
              onChange={(e) => setNewTopping({ ...newTopping, per: e.target.value })}
              className="font-mono-num w-20 text-right"
            />
            <div className="flex gap-1">
              {UNITS.map((u) => (
                <button
                  key={u}
                  onClick={() => setNewTopping({ ...newTopping, unit: u })}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: newTopping.unit === u ? COLOR.acai : COLOR.line,
                    background: newTopping.unit === u ? COLOR.acaiPale : "transparent",
                    color: COLOR.ink,
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={addTopping}
            disabled={saving}
            className="w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: COLOR.acai, color: "#fff" }}
          >
            Add topping
          </button>
          <p className="text-xs" style={{ color: COLOR.inkSoft }}>
            It starts with no stock, so it shows as out of stock until you restock it
            under Inventory.
          </p>
        </div>
      </Section>

      {confirmRemove && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6" style={{ background: "rgba(43,18,36,0.45)" }}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: COLOR.card }}>
            <p className="text-base font-semibold" style={{ color: COLOR.ink }}>
              Take {confirmRemove.item.name} off the menu?
            </p>
            <p className="mt-2 text-sm" style={{ color: COLOR.inkSoft }}>
              It stops being orderable. Sales that already included it keep it, and
              whatever stock is left stays in Inventory.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-semibold"
                style={{ borderColor: COLOR.line, color: COLOR.inkSoft }}
              >
                Keep it
              </button>
              <button
                onClick={() => {
                  const { kind, item } = confirmRemove;
                  setConfirmRemove(null);
                  if (kind === "flavor") removeFlavor(item);
                  else removeTopping(item);
                }}
                disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                style={{ background: COLOR.alert, color: "#fff" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
