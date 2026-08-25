#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_assets.py — Correctifs des assets du site (build durci 11.1)
=================================================================

Deux correctifs appliqués aux assets servis par la tablette :

1. [B1] site.js — la commande en ligne est réparée.
   La page servie injecte `window.TRATTORIA = {"mode":"local","api":""}` :
   l'URL de l'API est vide, donc `site.js` basculait systématiquement sur
   le repli « commande par téléphone ». On retombe sur `location.origin`
   (la page est TOUJOURS servie par la tablette) : l'API locale est
   découverte automatiquement. En mode « statique » (site exporté), API
   reste vide et le repli téléphonique est conservé.

2. [QR] Génération de QR code intégrée à l'application.
   On ajoute à `site.js` un encodeur QR autonome (mode octets, versions
   1-10, niveau H — validé octet pour octet contre l'implémentation de
   référence ISO/IEC 18004) et une interface tactile :
     * bouton flottant « QR » (bas gauche, 58 px, zone sûre iOS),
     * plein écran : QR très grand (min(78vw,62vh)), bord blanc de
       sécurité, bouton Fermer ≥ 48 px,
     * ouverture automatique sur l'adresse `/qr` (affichage permanent
       sur la tablette).
   L'URL encodée est celle de la page elle-même : le QR pointe toujours
   vers le bon serveur. On ajoute aussi à `site.css` les styles dédiés
   (optimisés petits écrans tactiles).

Ces correctifs ne touchent que les assets : aucun bytecode modifié.

Usage :
  python3 patch_assets.py site.js site.css site_js_out.js site_css_out.css
"""

import os
import sys

# ---------------------------------------------------------------------------
#  B1 — découverte automatique de l'API locale (site.js)
# ---------------------------------------------------------------------------
ANCRE = (
    "  var MODE = (window.TRATTORIA && window.TRATTORIA.mode) || 'statique';\n"
    "  var API = (window.TRATTORIA && window.TRATTORIA.api) || '';\n"
    "  var TEL = (window.TRATTORIA && window.TRATTORIA.tel) || '';\n"
)

AJOUT = ANCRE + (
    "\n"
    "  // ==========================================================\n"
    "  //  Correctif durci 11.1 : découverte automatique de l'API locale\n"
    "  // ==========================================================\n"
    "  // En mode « local », la page est servie par la tablette du restaurant\n"
    "  // (port 8720). La version 11.0 n'injectait pas l'URL de l'API dans\n"
    "  // window.TRATTORIA (api = \"\"), ce qui rendait la commande en ligne\n"
    "  // inopérante : le script basculait systématiquement sur le repli\n"
    "  // « commande par téléphone ». On retombe donc sur location.origin,\n"
    "  // qui pointe toujours vers la tablette qui a servi la page.\n"
    "  // En mode « statique » (site exporté, sans serveur local), API reste\n"
    "  // vide et le repli téléphonique est conservé : aucun changement de\n"
    "  // comportement.\n"
    "  if (!API && MODE === 'local'\n"
    "      && location.protocol === 'http:' && location.hostname) {\n"
    "    API = location.origin;\n"
    "  }\n"
)


def _read(path: str) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def patch_site_js(source: str) -> str:
    """Applique le correctif B1 puis ajoute les addons QR + conformité."""
    # -- B1 (idempotent)
    if 'Correctif durci 11.1' not in source:
        if source.count(ANCRE) != 1:
            raise RuntimeError(
                'ancre introuvable ou ambiguë dans site.js '
                '(%d occurrence(s))' % source.count(ANCRE)
            )
        source = source.replace(ANCRE, AJOUT, 1)
        print('[patch] site.js : découverte automatique de l\'API locale (B1)')

    # -- addon QR (idempotent)
    if 'QR code du menu' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__), 'qr_addon.js'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.js : encodeur QR + interface tactile (QR)')

    # -- addon outils de conformité (idempotent)
    if 'Outils de conformité' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'outils_conformite.js'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.js : e-reporting + registre Factur-X (CONFORMITÉ)')

    # -- addon pourboire numérique (idempotent)
    if 'Pourboire numérique' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'pourboire.js'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.js : pourboire numérique (POURBOIRE)')

    # -- addon paiement + carte de fidélité (idempotent)
    if 'Mode de paiement prévu' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'paiement_fidelite.js'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.js : paiement + carte de fidélité (CLIENT)')

    # -- addon modes App client/partenaire (idempotent)
    if 'Modes App' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'mode_app.js'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.js : modes App client/partenaire (APP)')
    return source


def patch_site_css(source: str) -> str:
    """Ajoute les styles QR + conformité à site.css (idempotent)."""
    if 'QR code du menu' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__), 'qr_addon.css'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.css : styles de l\'interface QR (QR)')

    if 'Outils de conformité' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'outils_conformite.css'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.css : styles des outils de conformité')

    if 'Pourboire numérique' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'pourboire.css'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.css : styles du pourboire numérique')

    if 'Mode de paiement prévu' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'paiement_fidelite.css'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.css : styles paiement + fidélité (CLIENT)')

    if 'Modes App' not in source:
        addon = _read(os.path.join(os.path.dirname(__file__),
                                   'mode_app.css'))
        source = source.rstrip('\n') + '\n\n' + addon + '\n'
        print('[patch] site.css : styles modes App (APP)')
    return source


def main() -> None:
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    js_in, css_in, js_out, css_out = sys.argv[1:5]
    with open(js_out, 'w', encoding='utf-8') as f:
        f.write(patch_site_js(_read(js_in)))
    with open(css_out, 'w', encoding='utf-8') as f:
        f.write(patch_site_css(_read(css_in)))
    print('[ok] assets patchés : %s et %s' % (js_out, css_out))


if __name__ == '__main__':
    main()
