#!/usr/bin/env python3
"""Génère des cartes A4 mono-page, sans dépendance, pour impression immédiate.

Usage : python3 build/generer_cartes_a4.py [dossier-sortie]
Les sources sont le catalogue JSON embarqué dans carte/donnees.js. Les fichiers
produits sont des HTML autonomes : ouvrir puis imprimer à 100 %, marges minimales.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE_JS = ROOT / "carte" / "donnees.js"
DEFAULT_OUTPUT = ROOT / "carte" / "impression"

CSS = r"""
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e9e7e1; }
body { color: #252521; font-family: Georgia, 'Times New Roman', serif; }
.screen-actions { max-width: 210mm; margin: 10px auto 0; padding: 8px 12px;
  display: flex; gap: 8px; align-items: center; font: 14px Arial, sans-serif;
  background: #fff; border: 1px solid #c9c3b7; border-radius: 5px; }
.screen-actions button { cursor: pointer; border: 1px solid #7a1018; border-radius: 4px;
  background: #a51822; color: white; padding: 8px 14px; font-weight: 700; }
.screen-actions span { color: #605b53; }
.sheet { width: 210mm; min-height: 297mm; margin: 10px auto; padding: 9mm 11mm 8mm;
  background: #fff; display: flex; flex-direction: column; }
.sheet.dense { padding-top: 8mm; padding-bottom: 7mm; }
.brand { text-align: center; border-bottom: 2px solid #a51822; padding-bottom: 4mm; }
.brand .name { color: #a51822; font-size: 29px; font-weight: 700; letter-spacing: .03em; }
.brand .city { margin-top: 1mm; color: #6e6a63; font: 11px Arial, sans-serif; letter-spacing: .04em; }
.brand h1 { margin: 3mm 0 0; color: #252521; font-size: 22px; line-height: 1.1; }
.brand .tagline { margin: 1.5mm 0 0; color: #5d663c; font-size: 11px; font-style: italic; }
.menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 9mm; margin-top: 1mm; }
.section { break-inside: avoid; page-break-inside: avoid; margin: 3.8mm 0 0; }
.dense .section { margin-top: 2.5mm; }
.section h2 { margin: 0 0 1.2mm; padding-bottom: .8mm; border-bottom: 1px solid #a51822;
  color: #7a1018; font-size: 15px; line-height: 1.1; }
.section .section-note { margin: -0.4mm 0 1.2mm; color: #6e6a63; font-size: 9.5px; font-style: italic; }
.menu-item { break-inside: avoid; page-break-inside: avoid; margin: 1.7mm 0; }
.dense .menu-item { margin: 1.1mm 0; }
.item-top { display: flex; align-items: baseline; gap: 2mm; line-height: 1.05; }
.item-name { font-size: 11.3px; font-weight: 700; }
.dense .item-name { font-size: 10.1px; }
.dots { flex: 1; min-width: 3mm; border-bottom: 1px dotted #b9b3a4; transform: translateY(-1px); }
.price { white-space: nowrap; font-size: 11.3px; font-weight: 700; }
.dense .price { font-size: 10.1px; }
.item-desc { margin-top: .7mm; color: #57534c; font-size: 9.3px; line-height: 1.18; }
.dense .item-desc { font-size: 8.2px; line-height: 1.12; }
.item-desc strong { color: #7a1018; }
.footer { margin-top: auto; padding-top: 3mm; border-top: 1px solid #b9b3a4; text-align: center;
  color: #5d5a53; font: 8.2px/1.3 Arial, sans-serif; }
.footer .legal { display: block; margin-top: 1mm; font-size: 7.7px; }
.callout { border: 1px solid #a51822; padding: 2mm 2.5mm; margin-top: 2mm; break-inside: avoid;
  font-size: 9px; line-height: 1.2; }
.callout b { color: #7a1018; }
@media screen { .sheet { box-shadow: 0 2px 12px #bbb; } }
@media print {
  html, body { background: #fff; }
  .screen-actions { display: none !important; }
  .sheet { margin: 0; width: 210mm; min-height: 297mm; height: 297mm; box-shadow: none; }
}
"""


def load_catalogue():
    source = CATALOGUE_JS.read_text(encoding="utf-8")
    match = re.search(r"window\.TRATTORIA_CATALOGUE\s*=\s*(\[.*\]);", source)
    if not match:
        raise RuntimeError("Catalogue introuvable dans carte/donnees.js")
    return json.loads(match.group(1))


def esc(value):
    return html.escape(str(value or ""), quote=True)


def price(value):
    return f"{float(value):.2f}".replace(".", ",") + " €"


def item(product, desc=None, name=None, marker=None):
    label = name or product.get("nom", "")
    description = product.get("desc", "") if desc is None else desc
    if marker:
        description = f"<strong>{esc(marker)}</strong> · {esc(description)}"
    else:
        description = esc(description)
    return (
        '<div class="menu-item"><div class="item-top">'
        f'<span class="item-name">{esc(label)}</span><span class="dots"></span>'
        f'<span class="price">{price(product["pv"]) if product.get("pv") is not None else ""}</span></div>'
        + (f'<div class="item-desc">{description}</div>' if description else "")
        + "</div>"
    )


def section(title, products, note="", dense=False):
    body = [f'<section class="section"><h2>{esc(title)}</h2>']
    if note:
        body.append(f'<p class="section-note">{esc(note)}</p>')
    body.extend(item(p) for p in products)
    body.append("</section>")
    return "".join(body)


def custom_item(name, amount, description, marker=None):
    marker_html = f'<strong>{esc(marker)}</strong> · ' if marker else ""
    return (
        '<div class="menu-item"><div class="item-top">'
        f'<span class="item-name">{esc(name)}</span><span class="dots"></span>'
        f'<span class="price">{price(amount)}</span></div>'
        f'<div class="item-desc">{marker_html}{esc(description)}</div></div>'
    )


def page(title, subtitle, content, footer, dense=False, callout=""):
    cls = "sheet dense" if dense else "sheet"
    callout_html = f'<div class="callout">{callout}</div>' if callout else ""
    return f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} — La Trattoria</title><style>{CSS}</style></head><body>
<div class="screen-actions"><button type="button" onclick="window.print()">🖨 Imprimer cette carte</button>
<span>Une carte = une page A4 · échelle 100 % · désactiver en-têtes/pieds du navigateur</span></div>
<main class="{cls}"><header class="brand"><div class="name">LA TRATTORIA</div><div class="city">SAINTES · 15 rue de la Poste</div>
<h1>{esc(title)}</h1><p class="tagline">{esc(subtitle)}</p></header>
{callout_html}<div class="menu-grid">{content}</div>
<footer class="footer">{footer}<span class="legal">Prix TTC, service compris · SIRET 106 050 263 00016 · 06 27 21 31 90</span></footer></main></body></html>
'''


def main_cards(catalogue):
    by_family = {}
    for p in catalogue:
        by_family.setdefault(p.get("fam"), []).append(p)
    pizzas = by_family.get("Pizzas", [])
    salads = by_family.get("Salades", [])
    pastas = by_family.get("Pâtes", [])
    desserts = [p for p in by_family.get("Desserts", []) if p["id"] in {"p30", "p31", "p32", "p33"}]
    desserts.append({"nom": "Tiramisu de saison", "pv": 6.50,
                     "desc": "Selon l’inspiration du jour · demander le parfum en caisse"})
    formulas = [p for p in by_family.get("Formules", []) if p["id"] in {"p41", "p42", "p43", "p44"}]
    main = "".join([
        section("Pizzas — pâte maison maturée 48 h", pizzas, dense=True),
        section("Salades fraîches", salads, dense=True),
        section("Pâtes fraîches", pastas, dense=True),
        section("Desserts du jour · Tiramisus maison", desserts, dense=True),
        section("Formules", formulas, dense=True),
        custom_item("Formule Midi Pâtes", 16, "Pâtes fraîches au choix + dessert du jour · service rapide le midi", "NOUVEAU"),
        custom_item("Formule Grande Faim", 44, "Minimum 2 personnes · planche à partager + 2 pizzas ou pâtes + 2 desserts du jour", "À PARTAGER"),
    ])
    return page(
        "Carte principale", "Pizzas · salades · pâtes fraîches · tiramisus · formules",
        main,
        "Tout est fait maison · Tout est frais · Bio dès que possible · Allergènes disponibles sur demande.",
        dense=True,
        callout='<b>Pause déjeuner :</b> formule pizza, salade ou pâtes + dessert du jour. Une solution rapide et gourmande pour les équipes du quartier.',
    )


def standalone_cards(catalogue):
    by_family = {}
    for p in catalogue:
        by_family.setdefault(p.get("fam"), []).append(p)
    pizzas = by_family.get("Pizzas", [])
    milieu = (len(pizzas) + 1) // 2
    pizza_content = (
        section("La carte des pizzas", pizzas[:milieu], "Sur place ou à emporter")
        + section("La carte des pizzas · suite", pizzas[milieu:])
    )
    pizza = page(
        "Pizzas artisanales", "Tomate ou crème · mozzarella · pâte fraîche maturée 48 h",
        pizza_content,
        "Pâte à pizza fraîche maturée 48 h · Allergènes : gluten, lait et selon recette.",
    )
    glaces = [p for p in by_family.get("Desserts", []) if p["id"] in {"p35", "p36", "p37", "p38", "p39", "p40"}]
    glace_content = section("Les parfums", [
        {"nom": "Parfums du moment", "pv": None, "desc": "Vanille Bourbon · chocolat noir · pistache · rhum-raisin · café · citron · framboise"}
    ]) + section("Glaces & sorbets", glaces, "L’Angelys · parfums selon disponibilités")
    glaces_page = page(
        "Glaces & sorbets L’Angelys", "Un dessert frais, artisanal et gourmand",
        glace_content,
        "Glaces artisanales L’Angelys · Lait, œuf et fruits à coque possibles selon les parfums.",
    )
    beers = [p for p in catalogue if p.get("cat") == "Bières"]
    beer_content = section("Bières du moment", beers, "Pression et bouteilles")
    beer_page = page(
        "Bières du moment", "Une bière fraîche avec la pizza",
        beer_content,
        "L’abus d’alcool est dangereux pour la santé, à consommer avec modération. Vente interdite aux mineurs.",
    )
    return {
        "01-carte-principale.html": main_cards(catalogue),
        "02-carte-pizzas.html": pizza,
        "03-glaces-langelys.html": glaces_page,
        "04-bieres-du-moment.html": beer_page,
    }


def main():
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output.mkdir(parents=True, exist_ok=True)
    cards = standalone_cards(load_catalogue())
    for filename, content in cards.items():
        (output / filename).write_text(content, encoding="utf-8")
    readme = output / "README.md"
    readme.write_text("""# Cartes A4 — impression urgente

Chaque fichier HTML est une carte indépendante conçue pour tenir sur **une
seule page A4** et fonctionner avec une imprimante standard, sans connexion ni
dépendance externe.

1. Ouvrir le fichier voulu dans Chrome, Edge, Firefox ou Safari ;
2. cliquer sur **Imprimer cette carte** ;
3. choisir papier **A4**, échelle **100 %** ou « taille réelle » ;
4. désactiver les en-têtes et pieds de page du navigateur ;
5. imprimer une seule page.

Fichiers :

- `01-carte-principale.html` — pizzas, salades, pâtes fraîches, tiramisus et formules ;
- `02-carte-pizzas.html` — carte pizzas seule ;
- `03-glaces-langelys.html` — glaces et sorbets L’Angelys seuls ;
- `04-bieres-du-moment.html` — bières du moment seule.

Les prix et le catalogue viennent de `carte/donnees.js`. Régénérer après une
modification avec :

```bash
python3 build/generer_cartes_a4.py
```

La « Formule Grande Faim » et la « Formule Midi Pâtes » sont des offres
commerciales ajoutées pour cette impression et doivent être confirmées en
caisse avant publication dans l’application.
""", encoding="utf-8")
    print("Cartes A4 générées dans", output)
    for filename in cards:
        print(" -", filename)


if __name__ == "__main__":
    main()
