#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch integrer_carte.py : panneau « Éditer les cartes » dans la section
#carte de l'application + ouverture du module par lien profond (hash)."""
import sys

CHEMIN = 'build/integrer_carte.py'
src = open(CHEMIN, encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom):
    if s.count(vieux) != 1:
        print('ECHEC %s' % nom)
        print(repr(vieux[:160]))
        sys.exit(1)
    return s.replace(vieux, neuf, 1)

# ---- 1. ouvrirModule accepte un hash (recrée l'iframe si hash donné) ----
src = remplacer(src,
"""  function ouvrirModule() {
    if (document.getElementById('lt-carte-iframe')) return;
    var html = decodB64(BUNDLE_B64);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var fr = document.createElement('iframe');
    fr.id = 'lt-carte-iframe';
    fr.title = 'Gestion de la carte';
    fr.src = URL.createObjectURL(blob);""",
"""  function ouvrirModule(hash) {
    var ancien = document.getElementById('lt-carte-iframe');
    if (ancien && !hash) return;
    if (ancien) ancien.remove();
    var html = decodB64(BUNDLE_B64);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var fr = document.createElement('iframe');
    fr.id = 'lt-carte-iframe';
    fr.title = 'Gestion de la carte';
    fr.src = URL.createObjectURL(blob) + (hash || '');""", 'ouvrirModule hash')

# ---- 2. fonctions du panneau (après ouvrirModule) ----
src = remplacer(src,
"""    fr.style.cssText = 'position:fixed;left:0;top:0;width:100vw;' +
      'height:100vh;border:0;z-index:2147483647;background:#F4F1EA;';
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(fr);
  }""",
"""    fr.style.cssText = 'position:fixed;left:0;top:0;width:100vw;' +
      'height:100vh;border:0;z-index:2147483647;background:#F4F1EA;';
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(fr);
  }

  /* ------------------------------------------------------------------
     Panneau « Éditer les cartes » injecté dans la section #carte de
     l'application (mode personnel uniquement). Chaque tuile ouvre le
     module intégré directement sur le bon écran (lien profond #ecran-…).
     ------------------------------------------------------------------ */
  function stylePanneau() {
    if (document.getElementById('pc-style')) return;
    var st = document.createElement('style');
    st.id = 'pc-style';
    st.textContent =
      '.panneau-cartes{margin:0 0 22px;padding:16px 18px;border:1px solid #D8CFC0;' +
      'border-radius:14px;background:#FDFAF3;box-shadow:0 2px 10px rgba(43,43,40,.08)}' +
      '.panneau-cartes .pc-tete{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}' +
      '.panneau-cartes .pc-tete b{font-family:Georgia,serif;color:#7A1018;font-size:17px}' +
      '.panneau-cartes .pc-tete span{font-size:13px;color:#6E6A63}' +
      '.panneau-cartes .pc-tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +
      '.pc-tuile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;' +
      'padding:10px 12px;border:1px solid #D8CFC0;border-radius:10px;background:#fff;' +
      'cursor:pointer;font:inherit;text-align:left;min-height:64px;' +
      '-webkit-tap-highlight-color:transparent;box-shadow:0 1px 4px rgba(43,43,40,.06)}' +
      '.pc-tuile:active{transform:scale(.97);border-color:#A51822}' +
      '.pc-tuile .pc-i{font-size:20px;line-height:1}' +
      '.pc-tuile .pc-t{font-weight:700;font-size:14px;color:#2B2B28}' +
      '.pc-tuile .pc-s{font-size:11.5px;color:#6E6A63}';
    document.head.appendChild(st);
  }

  function tuileCarte(cible, icone, titre, sous) {
    return '<button type="button" class="pc-tuile" data-pc="' + cible + '">' +
      '<span class="pc-i">' + icone + '</span>' +
      '<span class="pc-t">' + titre + '</span>' +
      '<span class="pc-s">' + sous + '</span></button>';
  }

  function injecterPanneauCartes() {
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
  }""", 'panneau cartes')

# ---- 3. demarrer : injecter le panneau ----
src = remplacer(src,
"""    styleBouton();
    ajouterBouton();
    if (!document.getElementById('btn-carte')) setTimeout(demarrer, 300);""",
"""    styleBouton();
    ajouterBouton();
    injecterPanneauCartes();
    if (!document.getElementById('btn-carte')) setTimeout(demarrer, 300);""", 'demarrer panneau')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Patch panneau appliqué à integrer_carte.py')
