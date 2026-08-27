#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch integrer_carte.py : point d'entrée « Éditer les cartes » dans
l'écran d'accueil de l'application (onglet en tête de nav + panneau
compact sous l'en-tête) — remplace l'injection dans la section #carte."""
import sys

CHEMIN = 'build/integrer_carte.py'
src = open(CHEMIN, encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom):
    if s.count(vieux) != 1:
        print('ECHEC %s' % nom)
        print(repr(vieux[:160]))
        sys.exit(1)
    return s.replace(vieux, neuf, 1)

# ---- 1. CSS : styles du bouton nav + panneau accueil (barre horizontale) ----
src = remplacer(src,
"""    st.textContent =
      '.panneau-cartes{margin:0 0 22px;padding:16px 18px;border:1px solid #D8CFC0;' +
      'border-radius:14px;background:#FDFAF3;box-shadow:0 2px 10px rgba(43,43,40,.08)}' +
      '.panneau-cartes .pc-tete{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}' +
      '.panneau-cartes .pc-tete b{font-family:Georgia,serif;color:#7A1018;font-size:17px}' +
      '.panneau-cartes .pc-tete span{font-size:13px;color:#6E6A63}' +
      '.panneau-cartes .pc-tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +""",
"""    st.textContent =
      '.cartes-nav{display:inline-flex;align-items:center;gap:6px;padding:0 14px;' +
      'min-height:44px;border-radius:22px;text-decoration:none;font-size:14.5px;' +
      'font-weight:700;white-space:nowrap;background:#24312B;color:#F5D677}' +
      '.cartes-nav:active{transform:scale(.97)}' +
      '.panneau-cartes{margin:12px 0 18px;padding:12px 14px;border:1px solid #D8CFC0;' +
      'border-radius:14px;background:#FDFAF3;box-shadow:0 2px 10px rgba(43,43,40,.10)}' +
      '.panneau-cartes .pc-tete{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap}' +
      '.panneau-cartes .pc-tete b{font-family:Georgia,serif;color:#7A1018;font-size:15.5px}' +
      '.panneau-cartes .pc-tete span{font-size:12px;color:#6E6A63}' +
      '.panneau-cartes .pc-tuiles{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
      '.panneau-cartes .pc-tuiles::-webkit-scrollbar{display:none}' +""", 'css panneau accueil')

# la tuile ne se réduit plus en largeur fixe (flex) + compacte
src = remplacer(src,
"""      '.pc-tuile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;' +
      'padding:10px 12px;border:1px solid #D8CFC0;border-radius:10px;background:#fff;' +
      'cursor:pointer;font:inherit;text-align:left;min-height:64px;' +
      '-webkit-tap-highlight-color:transparent;box-shadow:0 1px 4px rgba(43,43,40,.06)}' +""",
"""      '.pc-tuile{display:flex;flex-direction:column;align-items:flex-start;gap:1px;' +
      'flex:0 0 auto;min-width:128px;max-width:180px;padding:9px 11px;border:1px solid #D8CFC0;' +
      'border-radius:10px;background:#fff;cursor:pointer;font:inherit;text-align:left;' +
      'min-height:58px;-webkit-tap-highlight-color:transparent;box-shadow:0 1px 4px rgba(43,43,40,.06)}' +""", 'css tuile')

# ---- 2. injection : accueil (après header) + onglet en tête de nav ----
src = remplacer(src,
"""  function injecterPanneauCartes() {
    if (document.getElementById('panneau-cartes')) return;
    var section = document.getElementById('carte');
    var conteneur = section && section.querySelector('.conteneur');
    if (!conteneur) return;
    stylePanneau();
    var p = document.createElement('div');
    p.id = 'panneau-cartes';
    p.className = 'panneau-cartes';
    p.innerHTML =
      '<div class="pc-tete"><b>✏️ Éditer les cartes</b>' +
      '<span>La carte standard, les formules, les vins, les glaces, les bières, ' +
      'l\\'ardoise et le QR — tout se modifie ici, à la craie sur ardoise.</span></div>' +
      '<div class="pc-tuiles">' +
      tuileCarte('carte', '🍽️', 'La carte (standard)', 'Produits, catégories, lignes libres') +
      tuileCarte('carte&vue=formules', '🧾', 'Formules', 'Créer des formules (Menu enfant…)') +
      tuileCarte('carte&vue=vins', '🍷', 'Vins', 'Pichets et cave') +
      tuileCarte('carte&vue=glaces', '🍨', 'Glaces', 'Glaces et sorbets') +
      tuileCarte('carte&vue=bieres', '🍺', 'Bières', 'Pression et bouteilles') +
      tuileCarte('ardoise', '📋', 'Ardoise & QR', 'En-tête, badges, pâte 48 h, QR') +
      '</div>';
    p.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pc]');
      if (!t) return;
      ouvrirModule('#ecran-' + t.getAttribute('data-pc'));
    });
    conteneur.insertBefore(p, conteneur.firstChild);
  }""",
"""  function clicTuile(e) {
    var t = e.target.closest('[data-pc]');
    if (!t) return;
    ouvrirModule('#ecran-' + t.getAttribute('data-pc'));
  }

  /* Panneau compact en HAUT DE L'ÉCRAN D'ACCUEIL : inséré juste après le
     header (avant le bandeau d'état de service), visible dès l'ouverture
     de l'application, sans avoir à chercher un menu. */
  function injecterPanneauCartes() {
    stylePanneau();
    if (!document.getElementById('panneau-cartes')) {
      var header = document.querySelector('header');
      var ancre = header ? header.nextSibling : null;
      var hote = header && header.parentNode ? header.parentNode : null;
      if (hote) {
        var p = document.createElement('div');
        p.id = 'panneau-cartes';
        p.className = 'panneau-cartes';
        p.innerHTML =
          '<div class="pc-tete"><b>✏️ Éditer les cartes</b>' +
          '<span>carte standard · formules · vins · glaces · bières · ardoise &amp; QR</span></div>' +
          '<div class="pc-tuiles">' +
          tuileCarte('carte', '🍽️', 'La carte (standard)', 'Produits &amp; catégories') +
          tuileCarte('carte&vue=formules', '🧾', 'Formules', 'Menu enfant…') +
          tuileCarte('carte&vue=vins', '🍷', 'Vins', 'Pichets &amp; cave') +
          tuileCarte('carte&vue=glaces', '🍨', 'Glaces', 'Glaces &amp; sorbets') +
          tuileCarte('carte&vue=bieres', '🍺', 'Bières', 'Pression &amp; bouteilles') +
          tuileCarte('ardoise', '📋', 'Ardoise &amp; QR', 'En-tête, badges, QR') +
          '</div>';
        p.addEventListener('click', clicTuile);
        if (ancre && ancre.parentNode === hote) hote.insertBefore(p, ancre);
        else hote.appendChild(p);
      }
    }
    /* Onglet « ✏️ Cartes » en PREMIER dans la barre de navigation
       (nav.onglets), à côté de « Aujourd'hui » / « La carte ». */
    var nav = document.querySelector('nav.onglets');
    if (nav && !document.getElementById('nav-cartes')) {
      var a = document.createElement('a');
      a.id = 'nav-cartes';
      a.href = '#';
      a.className = 'cartes-nav';
      a.textContent = '✏️ Cartes';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        ouvrirModule('#ecran-carte');
      });
      nav.insertBefore(a, nav.firstChild);
    }
  }""", 'injection accueil + nav')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Patch accueil appliqué à integrer_carte.py')
