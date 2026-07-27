# Fotos de sabores y toppings

Suelta cada imagen en la carpeta que le toca, con el nombre exacto de la lista.
La app la detecta sola al compilar — no hay que tocar código.

Formatos: .jpg, .jpeg, .png, .webp o .avif. Cuadradas y con el bowl centrado.
Puedes agregarlas de a poco: cada una que caiga empieza a aparecer sola.

## Cómo preparar cada foto

No hace falta recortarlas ni cambiarles el tamaño a mano. El script las deja
parejas — cuadradas, centradas, comprimidas y con el nombre correcto:

```bash
pip install pillow                                   # una sola vez
python3 scripts/add-photo.py foto.jpg toppings oreo
python3 scripts/add-photo.py foto.jpg bowls coconut
```

Si el id no está en el menú, el script se detiene y te muestra los válidos, en
vez de dejar un archivo que la app nunca va a mirar.

## src/assets/bowls/  ← lo más útil, empieza por aquí

La foto del **bowl base**: ese sabor con los cuatro toppings gratis (granola,
fresa, plátano y mantequilla de maní) y nada más. **No es el bowl terminado** —
es el punto de partida, el pedido más común cuando el cliente no pide extras.

Se nombra con el id del sabor, igual que la lista de sabores de abajo — por
ejemplo `coconut.jpg` para el bowl de Coconut Cream.

Qué pasa cuando el pedido se aparta de esa base:

- **Agrega un extra** → la foto base se queda de fondo y el extra aparece encima,
  si ya tiene su propia foto en `toppings/`. Si todavía no la tiene, el bowl
  muestra abajo un aviso con el nombre del extra y la nota *not pictured*, para
  que nadie confunda la foto con el pedido completo.
- **Quita uno de los gratis** → la foto base mostraría comida que el cliente no
  se lleva, así que se hace a un lado y aparece el plato vacío con lo que sí
  tenga foto.

Las carpetas `flavors/` y `toppings/` de abajo son para armar el bowl por piezas;
si existe la foto base de ese sabor, esa manda.

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
