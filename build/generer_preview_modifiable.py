#!/usr/bin/env python3
"""Construit une preview partageable et modifiable des cartes A4."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "carte" / "impression"
OUTPUT = SOURCE / "preview-modifiable.html"
CARDS = {
    "principale": "01-carte-principale.html",
    "pizzas": "02-carte-pizzas.html",
    "glaces": "03-glaces-langelys.html",
    "bieres": "04-bieres-du-moment.html",
}

EDITOR_CSS = r"""
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #eeeae2; color: #282621; font-family: Arial, sans-serif; }
header { padding: 22px 24px 16px; background: #fff; border-bottom: 3px solid #a51822; }
header h1 { margin: 0; color: #a51822; font: 700 25px Georgia, serif; }
header p { margin: 5px 0 0; color: #625d54; font-size: 14px; }
.toolbar { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; gap: 7px; align-items: center;
  padding: 10px 14px; background: #fff; border-bottom: 1px solid #c9c3b7; box-shadow: 0 1px 5px #bbb; }
button { cursor: pointer; border: 1px solid #9e9585; border-radius: 4px; padding: 8px 11px; background: #fff; color: #39352f; font-weight: 700; }
button:hover, button.active { border-color: #a51822; color: #fff; background: #a51822; }
button.action { border-color: #5d663c; color: #fff; background: #5d663c; }
button.action:hover { background: #41482b; }
#state { margin-left: auto; color: #625d54; font-size: 12px; }
#stage { padding: 20px; overflow: auto; }
#preview { display: block; width: 210mm; min-height: 297mm; margin: 0 auto; border: 0; background: white; box-shadow: 0 2px 14px #bcb7ad; }
.help { max-width: 210mm; margin: 14px auto 24px; color: #625d54; font-size: 12px; line-height: 1.4; }
@media (max-width: 850px) {
  header { padding: 16px; } .toolbar { position: static; } #state { width: 100%; margin-left: 0; }
  #stage { padding: 8px; overflow-x: auto; } .help { padding: 0 8px; }
}
"""

EDITOR_JS = r"""
const CARDS = __CARDS__;
const frame = document.getElementById('preview');
const state = document.getElementById('state');
let selected = 'principale';
let editing = false;
let saveTimer;

const labels = {
  principale: 'Carte principale', pizzas: 'Carte pizzas',
  glaces: 'Glaces L’Angelys', bieres: 'Bières du moment'
};

function savedKey(name) { return 'trattoria-a4-' + name; }
function currentDocument() { return frame.contentDocument || frame.contentWindow.document; }
function currentHtml() {
  return '<!doctype html>\n' + currentDocument().documentElement.outerHTML;
}
function updateState(message) { state.textContent = message; }
function setEditing(value) {
  editing = value;
  const doc = currentDocument();
  const sheet = doc && doc.querySelector('.sheet');
  if (sheet) sheet.contentEditable = editing ? 'true' : 'false';
  document.getElementById('edit').textContent = editing ? '✓ Modifications activées' : '✎ Modifier cette carte';
  document.getElementById('edit').classList.toggle('active', editing);
  updateState(editing ? 'Clique sur un texte pour le modifier — sauvegarde locale automatique.' : 'Mode aperçu');
}
function saveCurrent() {
  if (!editing || !frame.contentDocument) return;
  try {
    localStorage.setItem(savedKey(selected), currentHtml());
    updateState('Modifications sauvegardées dans ce navigateur.');
  } catch (error) { updateState('Aperçu modifiable sans sauvegarde locale.'); }
}
function load(name) {
  selected = name;
  document.querySelectorAll('[data-card]').forEach(button => button.classList.toggle('active', button.dataset.card === name));
  let source = CARDS[name];
  try { source = localStorage.getItem(savedKey(name)) || source; } catch (error) { /* stockage indisponible */ }
  frame.onload = () => {
    const doc = currentDocument();
    const style = doc.createElement('style');
    style.textContent = '.screen-actions{display:none!important}.sheet{margin:0 auto;box-shadow:none}';
    doc.head.appendChild(style);
    doc.addEventListener('input', () => {
      clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 300);
    });
    setEditing(editing);
    updateState(labels[name] + (localStorage.getItem(savedKey(name)) ? ' — version locale' : ' — aperçu'));
  };
  frame.srcdoc = source;
}

document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => load(button.dataset.card)));
document.getElementById('edit').addEventListener('click', () => setEditing(!editing));
document.getElementById('print').addEventListener('click', () => frame.contentWindow.print());
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Réinitialiser cette carte et supprimer les modifications locales ?')) return;
  try { localStorage.removeItem(savedKey(selected)); } catch (error) { /* rien */ }
  load(selected);
});
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([currentHtml()], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = selected + '-carte-a4-modifiee.html';
  link.click();
  URL.revokeObjectURL(link.href);
});
const hash = location.hash.slice(1);
load(labels[hash] ? hash : 'principale');
"""


def main() -> None:
    cards = {key: (SOURCE / filename).read_text(encoding="utf-8") for key, filename in CARDS.items()}
    payload = json.dumps(cards, ensure_ascii=False, separators=(",", ":"))
    script = EDITOR_JS.replace("__CARDS__", payload)
    output = f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview modifiable — cartes A4 — La Trattoria</title><style>{EDITOR_CSS}</style></head><body>
<header><h1>La Trattoria — preview des cartes A4</h1>
<p>Choisir une carte, l’ouvrir en aperçu, puis activer les modifications avant impression.</p></header>
<nav class="toolbar" aria-label="Choix de la carte">
<button data-card="principale">Carte principale</button><button data-card="pizzas">Pizzas</button>
<button data-card="glaces">Glaces L’Angelys</button><button data-card="bieres">Bières du moment</button>
<button id="edit" class="action">✎ Modifier cette carte</button><button id="print">🖨 Imprimer</button>
<button id="download">⇩ Télécharger la version modifiée</button><button id="reset">↺ Réinitialiser</button>
<span id="state" role="status">Chargement…</span></nav>
<section id="stage"><iframe id="preview" title="Preview de la carte A4"></iframe></section>
<p class="help"><strong>Important :</strong> les modifications sont locales au navigateur de la personne qui ouvre ce lien.
Elles ne modifient pas le dépôt. Pour transmettre une version corrigée, cliquer sur
« Télécharger la version modifiée », puis envoyer le fichier HTML obtenu.</p>
<script>{script}</script></body></html>
'''
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Preview modifiable créée : {OUTPUT}")


if __name__ == "__main__":
    main()
