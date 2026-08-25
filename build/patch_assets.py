#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_assets.py — Correctif de assets/site.js (build durci 11.1)
================================================================

Correctif [B1] : la commande en ligne servie par la tablette est inopérante
dans la version 11.0.

Cause racine
------------
La page servie par la tablette (`Reseau.servir()` -> `Site.page(true)`)
injecte `window.TRATTORIA = {"mode":"local","api":"","tel":"…"}` : l'URL de
l'API est VIDE. Or `site.js` refuse d'envoyer une commande ou une
réservation quand `api` est vide :
    if (MODE !== 'local' || !API) { … repli « Commande par téléphone » … }
Résultat : sur le WiFi, les clients voient le menu mais ne peuvent pas
commander — ils basculent sur l'appel téléphonique. Les routes
`/site/commande`, `/site/reservation` et `/site/etat` existent pourtant
côté serveur (port 8720).

Correctif
---------
En mode « local », si `api` est vide, on retombe sur `location.origin` :
la page est TOUJOURS servie par la tablette elle-même (le navigateur du
client l'a chargée depuis `http://<ip-tablette>:8720`), donc
`location.origin` pointe exactement vers l'API locale. Aucune donnée
externe nécessaire, aucun changement de comportement en mode « statique »
(site exporté) : dans ce cas `API` reste vide et le repli téléphonique
est conservé.

Ce correctif touche uniquement l'asset `assets/site.js` : il ne modifie
aucun bytecode, ce qui le rend sûr et facile à auditer.
"""

import sys

# Bloc ajouté juste après la définition de MODE / API / TEL (3 variables).
# L'insertion se fait par remplacement d'une ancre unique, vérifiée.
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


def patch_site_js(source: str) -> str:
    """Applique le correctif au contenu de site.js (idempotent)."""
    if "Correctif durci 11.1" in source:
        # déjà patché : on ne ré-applique pas (le script doit être
        # reproductible, même relancé plusieurs fois)
        print('[info] site.js déjà patché, aucune modification')
        return source
    if source.count(ANCRE) != 1:
        raise RuntimeError(
            'ancre introuvable ou ambiguë dans site.js '
            '(%d occurrence(s))' % source.count(ANCRE)
        )
    out = source.replace(ANCRE, AJOUT, 1)
    print('[patch] site.js : découverte automatique de l\'API locale (B1)')
    return out


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, 'r', encoding='utf-8') as f:
        content = f.read()
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(patch_site_js(content))
    print('[ok] site.js patché écrit : %s' % dst)


if __name__ == '__main__':
    main()
