#!/usr/bin/env python3
"""Génère les deux fiches A4 séparées pour le porte-vue.

Les fiches sont autonomes : le CSS est repris de la carte pizzas existante et
les produits sont lus dans carte/donnees.js, sans dépendance réseau.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "carte" / "donnees.js"
REFERENCE = ROOT / "carte" / "impression" / "02-carte-pizzas.html"
OUTPUT = ROOT / "carte" / "impression"


def esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def euros(value: object) -> str:
    return f"{float(value):.2f}".replace(".", ",") + " €"


def catalogue() -> list[dict]:
    source = DATA.read_text(encoding="utf-8")
    match = re.search(r"window\.TRATTORIA_CATALOGUE\s*=\s*(\[.*\]);", source)
    if not match:
        raise RuntimeError("Catalogue introuvable")
    return json.loads(match.group(1))


def item(product: dict, description: str | None = None) -> str:
    desc = product.get("desc", "") if description is None else description
    details = f'<div class="item-desc">{esc(desc)}</div>' if desc else ""
    return (
        '<div class="menu-item"><div class="item-top">'
        f'<span class="item-name">{esc(product["nom"])}</span>'
        '<span class="dots"></span>'
        f'<span class="price">{euros(product["pv"])}</span></div>{details}</div>'
    )


def custom(name: str, amount: float, description: str, marker: str = "") -> str:
    prefix = f'<strong>{esc(marker)}</strong> · ' if marker else ""
    return (
        '<div class="menu-item"><div class="item-top">'
        f'<span class="item-name">{esc(name)}</span><span class="dots"></span>'
        f'<span class="price">{euros(amount)}</span></div>'
        f'<div class="item-desc">{prefix}{esc(description)}</div></div>'
    )


def section(title: str, products: list[dict], note: str = "") -> str:
    note_html = f'<p class="section-note">{esc(note)}</p>' if note else ""
    return f'<section class="section"><h2>{esc(title)}</h2>{note_html}{"".join(item(p) for p in products)}</section>'


def page(title: str, subtitle: str, content: str, footer: str, callout: str = "") -> str:
    css = re.search(r"<style>(.*?)</style>", REFERENCE.read_text(encoding="utf-8"), re.S)
    if not css:
        raise RuntimeError("CSS de référence introuvable")
    callout_html = f'<div class="callout">{callout}</div>' if callout else ""
    return f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} — La Trattoria</title><style>{css.group(1)}</style></head><body>
<div class="screen-actions"><button type="button" onclick="window.print()">🖨 Imprimer cette carte</button>
<span>Une carte = une page A4 · échelle 100 % · désactiver en-têtes/pieds du navigateur</span></div>
<main class="sheet"><header class="brand"><div class="name">LA TRATTORIA</div><div class="city">SAINTES · 15 rue de la Poste</div>
<h1>{esc(title)}</h1><p class="tagline">{esc(subtitle)}</p></header>{callout_html}
<div class="menu-grid">{content}</div>
<footer class="footer">{footer}<span class="legal">Prix TTC, service compris · SIRET 106 050 263 00016 · 06 27 21 31 90</span></footer></main></body></html>
'''


def main() -> None:
    products = catalogue()
    families: dict[str, list[dict]] = {}
    for product in products:
        families.setdefault(product.get("fam", ""), []).append(product)

    salads = families.get("Salades", [])
    split_salads = (len(salads) + 1) // 2
    salads_content = section("Salades fraîches", salads[:split_salads], "Sur place ou à emporter")
    salads_content += section("Salades fraîches · suite", salads[split_salads:])
    salads_page = page(
        "Salades fraîches", "Fraîches, généreuses et préparées à la commande",
        salads_content,
        "Salades préparées à la commande · Allergènes disponibles sur demande.",
    )

    formulas = families.get("Formules", [])
    formula_items = formulas + [
        {"nom": "Formule Midi Pâtes", "pv": 16.0,
         "desc": "Pâtes fraîches au choix + dessert du jour · service rapide le midi"},
        {"nom": "Formule Grande Faim", "pv": 44.0,
         "desc": "Minimum 2 personnes · planche à partager + 2 pizzas ou pâtes + 2 desserts du jour"},
    ]
    split_formulas = (len(formula_items) + 1) // 2
    formulas_content = section("Formules — côté midi", formula_items[:split_formulas], "Pour une pause rapide et gourmande")
    formulas_content += section("Formules — à partager", formula_items[split_formulas:])
    formulas_page = page(
        "Formules", "Pause déjeuner, menu enfant et grande faim",
        formulas_content,
        "Offres à consommer sur place ou à emporter · Allergènes disponibles sur demande.",
        '<b>Pause déjeuner :</b> service rapide pour les actifs du quartier, sur place ou à emporter. '
        '<b>Grande Faim :</b> minimum 2 personnes.',
    )

    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "05-carte-salades.html").write_text(salads_page, encoding="utf-8")
    (OUTPUT / "06-carte-formules.html").write_text(formulas_page, encoding="utf-8")
    print("Cartes complémentaires A4 générées")


if __name__ == "__main__":
    main()
