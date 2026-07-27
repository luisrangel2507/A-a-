#!/usr/bin/env python3
"""Prepare a photo for the app: square, centered, compressed, correctly named.

    python3 scripts/add-photo.py <file> toppings oreo
    python3 scripts/add-photo.py <file> bowls coconut
    python3 scripts/add-photo.py <file> flavors matcha

The id is checked against the menu in src/App.jsx, because a typo would not
fail — it would just quietly produce a file the app never looks at.

Needs Pillow:  pip install pillow
"""
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is missing. Install it with:  pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "src" / "App.jsx"

# bowls and flavors are shown large; a topping is a small disc on the bowl.
SIZES = {"bowls": 640, "flavors": 640, "toppings": 320}


def menu_ids():
    src = APP.read_text(encoding="utf-8")
    flavors = re.findall(r'\{ id: "([a-z_]+)", name: "[^"]+", baseIngredientId', src)
    toppings = re.findall(r'\{ id: "([a-z_]+)", name: "[^"]+", category:', src)
    return {"bowls": flavors, "flavors": flavors, "toppings": toppings}


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    source, kind, ident = sys.argv[1], sys.argv[2], sys.argv[3]

    if kind not in SIZES:
        sys.exit(f"Unknown folder: {kind}. Use one of: {', '.join(SIZES)}")

    valid = menu_ids()[kind]
    if ident not in valid:
        sys.exit(
            f"'{ident}' is not on the menu.\n"
            f"Valid ids for {kind}:\n  " + "\n  ".join(valid)
        )

    im = Image.open(source)
    # Photos off a phone carry rotation in EXIF; apply it before cropping.
    try:
        from PIL import ImageOps

        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    im = im.convert("RGB")

    # Centre crop to a square, then resize.
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    target = SIZES[kind]
    im = im.resize((target, target), Image.LANCZOS)

    out_dir = ROOT / "src" / "assets" / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{ident}.jpg"
    im.save(out, "JPEG", quality=82, optimize=True, progressive=True)

    kb = out.stat().st_size / 1024
    print(f"{out.relative_to(ROOT)}  ({target}×{target}, {kb:.0f} KB)")


if __name__ == "__main__":
    main()
