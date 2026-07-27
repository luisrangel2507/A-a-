# Fotos de sabores y toppings

Suelta cada imagen en la carpeta que le toca, con el nombre exacto de la lista.
La app la detecta sola al compilar — no hay que tocar código.

Formatos: .jpg, .jpeg, .png, .webp o .avif. Cuadradas y con el bowl centrado.
Puedes agregarlas de a poco: cada una que caiga empieza a aparecer sola.

## src/assets/bowls/  ← lo más útil, empieza por aquí

La foto del **bowl ya servido**: ese sabor con los cuatro toppings gratis
(granola, fresa, plátano y mantequilla de maní) y nada más. Es la que se muestra
por defecto cuando el cliente no pide extras, que es el pedido más común.

Se nombra con el id del sabor, igual que la lista de sabores de abajo — por
ejemplo `coconut.jpg` para el bowl de Coconut Cream.

Si el cliente **agrega** un extra, esa foto sigue de fondo y encima aparece el
extra (si tiene su propia foto en `toppings/`). Si **quita** uno de los gratis,
la foto ya no correspondería a lo que se lleva, así que se muestra el plato
vacío con lo que sí tenga foto.

Las carpetas `flavors/` y `toppings/` de abajo son para cuando quieras armar el
bowl por piezas; si tienes la foto del bowl servido, esa manda.

## src/assets/flavors/  (9 sabores)

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
