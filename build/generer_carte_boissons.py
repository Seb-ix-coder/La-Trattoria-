#!/usr/bin/env python3
"""Génère la carte boissons A4 avec illustration intégrée."""
from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "carte" / "donnees.js"
ILLUSTRATION = ROOT / "carte" / "impression" / "illustrations" / "boissons.jpg"
OUTPUT = ROOT / "carte" / "impression" / "08-carte-boissons.html"

CSS = r"""
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e9e7e1;color:#252521;font-family:Georgia,'Times New Roman',serif}.screen-actions{max-width:210mm;margin:10px auto;padding:8px 12px;display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #c9c3b7;border-radius:5px;font:14px Arial,sans-serif}.screen-actions button{cursor:pointer;border:1px solid #7a1018;border-radius:4px;background:#a51822;color:#fff;padding:8px 14px;font-weight:700}.screen-actions span{color:#605b54}.sheet{width:210mm;height:297mm;margin:10px auto;padding:7mm 10mm 6mm;background:#fff;display:flex;flex-direction:column}.brand{position:relative;text-align:center;border-bottom:2px solid #a51822;padding:0 35mm 2.5mm}.brand .name{color:#a51822;font-size:25px;font-weight:700;letter-spacing:.03em}.brand .city{margin-top:.5mm;color:#6e6a63;font:9px Arial,sans-serif;letter-spacing:.04em}.brand h1{margin:2mm 0 0;color:#252521;font-size:18px;line-height:1.05}.brand .tagline{margin:1mm 0 0;color:#5d663c;font-size:8.5px;font-style:italic}.hero-illustration{position:absolute;right:0;top:0;width:28mm;height:25mm;border-radius:2mm;object-fit:cover;filter:saturate(.85)}.notice{margin:2mm 0 0;padding:1.4mm 2mm;border:1px solid #c9c3b7;text-align:center;color:#57534c;font:7.5px/1.2 Arial,sans-serif}.menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8mm;flex:1;margin-top:1mm}.section{break-inside:avoid;page-break-inside:avoid;margin:2mm 0 0}.section h2{margin:0 0 .7mm;padding-bottom:.5mm;border-bottom:1px solid #a51822;color:#7a1018;font-size:12.5px;line-height:1.05}.section-note{margin:-.2mm 0 .7mm;color:#6e6a63;font-size:7.5px;font-style:italic}.menu-item{break-inside:avoid;page-break-inside:avoid;margin:.65mm 0}.item-top{display:flex;align-items:baseline;gap:1.5mm;line-height:1.02}.item-name{font-size:8.8px;font-weight:700}.dots{flex:1;min-width:2mm;border-bottom:1px dotted #b9b3a4;transform:translateY(-1px)}.price{white-space:nowrap;font-size:8.8px;font-weight:700}.item-desc{margin-top:.3mm;color:#57534c;font-size:6.7px;line-height:1.05}.footer{margin-top:auto;padding-top:2mm;border-top:1px solid #b9b3a4;text-align:center;color:#5d5a53;font:7px/1.2 Arial,sans-serif}.footer .legal{display:block;margin-top:.6mm;font-size:6.6px}@media screen{.sheet{box-shadow:0 2px 12px #bbb}}@media print{html,body{background:#fff}.screen-actions{display:none}.sheet{margin:0;box-shadow:none}}
"""

CSS += r"""
/* Cohérence avec les cartes A4 premium générées par generer_cartes_a4.py. */
:root{--ink:#26332d;--soft:#66736c;--or:#b78a39;--paper:#fffdf8;--red:#8d1f2b}
html,body{background:#eee8dd;color:var(--ink)}.screen-actions{border-color:#d6bf87;border-radius:6px;box-shadow:0 4px 16px rgba(36,49,43,.08)}.screen-actions button{border-color:#7f1d29;background:var(--red);border-radius:4px}.sheet{background:var(--paper);border:1px solid #d6bf87;border-radius:5px;box-shadow:0 16px 44px rgba(36,49,43,.13)}.brand{border-bottom:1px solid var(--or);position:relative}.brand::after{content:"";position:absolute;bottom:-5px;left:50%;width:9px;height:9px;border:1px solid var(--or);background:var(--paper);transform:translateX(-50%) rotate(45deg)}.brand .name{color:var(--ink);letter-spacing:.12em}.brand .city{color:var(--soft);letter-spacing:.16em}.brand h1{color:var(--ink);letter-spacing:.035em;text-transform:uppercase}.brand .tagline{color:#977329}.section h2{border-bottom:1px solid #e3d7bd;color:var(--ink);text-transform:uppercase;letter-spacing:.035em}.section h2::before{content:"✦";color:var(--or);font-size:.7em;margin-right:5px}.section-note,.item-desc{color:var(--soft)}.menu-item{border-bottom:1px solid #f0eadd;padding-bottom:1mm}.item-name{color:var(--ink)}.dots{border-bottom-color:#cdbd9b}.price{color:var(--red)}.footer{border-top-color:var(--or);color:var(--soft)}.notice{border-color:#d6bf87;background:#fbf5e7;color:var(--soft)}
@media print{html,body{background:#fff}.sheet{border:0;border-radius:0;box-shadow:none}}
"""


def esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def euro(value: object) -> str:
    return f"{float(value):.2f}".replace(".", ",") + " €"


def load() -> list[dict]:
    match = re.search(r"window\.TRATTORIA_CATALOGUE\s*=\s*(\[.*\]);", DATA.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError("Catalogue introuvable")
    return json.loads(match.group(1))


def product(p: dict) -> str:
    desc = p.get("desc", "")
    return (f'<div class="menu-item"><div class="item-top"><span class="item-name">{esc(p["nom"])}</span>'
            f'<span class="dots"></span><span class="price">{euro(p["pv"])}</span></div>'
            f'<div class="item-desc">{esc(desc)}</div></div>')


def section(title: str, products: list[dict], note: str = "") -> str:
    note_html = f'<p class="section-note">{esc(note)}</p>' if note else ""
    return f'<section class="section"><h2>{esc(title)}</h2>{note_html}{"".join(product(p) for p in products)}</section>'


def main() -> None:
    data = load()
    by_family: dict[str, list[dict]] = {}
    by_id = {}
    for p in data:
        by_family.setdefault(p.get("fam", ""), []).append(p)
        by_id[p["id"]] = p
    aperitifs = by_family.get("Apéritif", [])
    sans = [by_id[f"p{i}"] for i in range(52, 66)]
    vins = [by_id[f"p{i}"] for i in range(66, 73)]
    beers = [by_id[f"p{i}"] for i in range(73, 78)]
    cafes = [by_id[f"p{i}"] for i in range(78, 83)]
    digestifs = [by_id[f"p{i}"] for i in range(83, 85)]
    illustration = base64.b64encode(ILLUSTRATION.read_bytes()).decode("ascii")
    left = section("Apéritifs", aperitifs, "À partager ou pour commencer") + section("Sans alcool & fraîches", sans)
    right = (section("Vins", vins, "Verre ou bouteille selon référence") + section("Bières du moment", beers)
             + section("Cafés & thés", cafes) + section("Digestifs", digestifs))
    page = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carte boissons A4 — La Trattoria</title><style>{CSS}</style></head><body>
<div class="screen-actions"><button onclick="window.print()">🖨 Imprimer la carte boissons</button><span>Une carte = une page A4 · 100 % · désactiver en-têtes/pieds du navigateur</span></div>
<main class="sheet"><header class="brand"><img class="hero-illustration" src="data:image/jpeg;base64,{illustration}" alt="Illustration de boissons"><div class="name">LA TRATTORIA</div><div class="city">SAINTES · 15 rue de la Poste</div><h1>Carte des boissons</h1><p class="tagline">À boire frais, avec la pizza ou pour prolonger le moment</p></header>
<p class="notice">L’abus d’alcool est dangereux pour la santé, à consommer avec modération. Vente interdite aux mineurs.</p><div class="menu-grid"><div>{left}</div><div>{right}</div></div><footer class="footer">Boissons fraîches · vins italiens · bières du moment · cafés et digestifs<span class="legal">Prix TTC, service compris · SIRET 106 050 263 00016 · 06 27 21 31 90</span></footer></main></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
