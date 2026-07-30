# Flavor and topping photos

Drop each image into the folder it belongs to, named exactly as listed.
The app picks it up at build time — no code to change.

Formats: .jpg, .jpeg, .png, .webp or .avif. Square, with the bowl centered.
Add them a few at a time: each one that lands starts showing on its own.

## Preparing a photo

No need to crop or resize by hand. The script makes them all consistent —
square, centered, compressed and correctly named:

```bash
pip install pillow                                   # once
python3 scripts/add-photo.py photo.jpg toppings oreo
python3 scripts/add-photo.py photo.jpg bowls coconut
```

If the id is not on the menu the script stops and prints the valid ones,
rather than leaving a file the app will never look at.

## src/assets/bowls/  ← the useful one, start here

A photo of the **base bowl**: that flavor made up with the four free toppings
(granola, strawberry, banana and peanut butter) and nothing else. **It is not a
finished bowl** — it is the starting point, and the most common order when the
customer adds no extras.

Named after the flavor id, same as the flavor list below — `coconut.jpg` is the
Coconut Cream bowl.

What happens when an order departs from that base:

- **An extra is added** → the base photo stays underneath and the extra is drawn
  on top, if it already has its own photo in `toppings/`. If it does not, the
  bowl prints a note along the bottom naming it as *not pictured*, so the photo
  is never mistaken for the whole order.
- **A free topping is removed** → the base photo would be showing food the
  customer is not getting, so it steps aside and the empty bowl appears with
  whatever does have a photo.

The `flavors/` and `toppings/` folders below are for building the bowl from
parts; where a base photo exists for that flavor, it wins.

## src/assets/flavors/  (9 flavors)

- `acai.jpg` — Organic Pure Açaí
- `cacao.jpg` — Cacao Cream
- `pina.jpg` — Piña Colada Spirulina
- `coconut.jpg` — Coconut Cream
- `passion.jpg` — Passion Fruit Cream
- `dragon.jpg` — Dragon Fruit Sorbet
- `mango_cream.jpg` — Mango Cream
- `spicy_mango.jpg` — Spicy Mango
- `matcha.jpg` — Matcha Cream

## src/assets/toppings/  (28 toppings)

**Dairy**

- `condensed_milk.jpg` — Condensed milk
- `nido.jpg` — Nido (Dry Milk)
- `choc_drizzle.jpg` — Chocolate Drizzle
- `chia_pudding.jpg` — Chia Pudding
- `overnight_oats.jpg` — Overnight Oats
- `nutella.jpg` — Nuttela
- `cacao_nibs.jpg` — Cacao Nibs

**Nuts**

- `almond_butter.jpg` — Almond Butter
- `diced_almonds.jpg` — Diced Almonds
- `peanuts.jpg` — Peanuts
- `peanut_butter.jpg` — Peanut Butter

**Fruits**

- `blueberry.jpg` — Blueberry
- `banana.jpg` — Banana
- `strawberry.jpg` — Strawberry
- `mango.jpg` — Mango
- `pineapple.jpg` — Pineapple
- `dates.jpg` — Dates

**Others**

- `granola.jpg` — Granola
- `chia_seeds.jpg` — Chia Seeds
- `hemp_seeds.jpg` — Hemp Seeds
- `goji_berry.jpg` — Goji Berry
- `coconut_flakes.jpg` — Coconut Flakes
- `toasted_coconut.jpg` — Toasted Coconut
- `protein_powder.jpg` — Protein Powder
- `oreo.jpg` — Oreo
- `sprinkles.jpg` — Sprinkles
- `agave.jpg` — Agave
- `honey.jpg` — Honey
