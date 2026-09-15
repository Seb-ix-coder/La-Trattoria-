#!/usr/bin/env python3
"""Ajoute de petites illustrations intégrées aux cartes A4 existantes."""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARD_DIR = ROOT / "carte" / "impression"
ASSET_DIR = CARD_DIR / "illustrations"
CARDS = {
    "01-carte-principale.html": "plats.jpg",
    "02-carte-pizzas.html": "plats.jpg",
    "03-glaces-langelys.html": "glaces.jpg",
    "04-bieres-du-moment.html": "bieres.jpg",
    "05-carte-salades.html": "plats.jpg",
    "06-carte-formules.html": "formules.jpg",
    "07-carte-restaurant-economique.html": "plats.jpg",
}
CSS = ('.brand{position:relative;padding-right:27mm!important}'
       '.menu-illustration{position:absolute;right:0;top:-1mm;width:23mm;height:18mm;'
       'object-fit:cover;border-radius:2mm;filter:saturate(.8)}')


def main() -> None:
    for filename, asset in CARDS.items():
        path = CARD_DIR / filename
        image = ASSET_DIR / asset
        if not path.exists() or not image.exists():
            raise FileNotFoundError(path if not path.exists() else image)
        text = path.read_text(encoding="utf-8")
        data = base64.b64encode(image.read_bytes()).decode("ascii")
        if "menu-illustration" not in text:
            text = text.replace("</style>", CSS + "</style>", 1)
            tag = f'<img class="menu-illustration" src="data:image/jpeg;base64,{data}" alt="Illustration La Trattoria">'
            text = text.replace('<header class="brand">', '<header class="brand">' + tag, 1)
        path.write_text(text, encoding="utf-8")
        print("illustration intégrée:", filename)


if __name__ == "__main__":
    main()
