## ✏️ « Éditer les cartes » dès l'écran d'accueil de l'application — `trato-12.0-stable.apk` (versionCode 25)

Retour pris en compte : inutile de chercher un menu — le point d'entrée
d'édition est maintenant **impossible à rater**, dès l'ouverture de l'app.

### Deux points d'entrée sur l'écran d'accueil
1. **Panneau en haut de la page** (juste sous l'en-tête, avant le bandeau
   d'état de service) : 6 tuiles défilables —
   🍽️ La carte (standard) · 🧾 Formules · 🍷 Vins · 🍨 Glaces · 🍺 Bières · 📋 Ardoise & QR
2. **Onglet « ✏️ Cartes » en premier dans le menu de navigation**
   (la barre d'onglets en haut, à côté de « Aujourd'hui » / « La carte »)

Chaque tuile/onglet ouvre le module intégré **directement sur le bon écran**.
Les modes client/partenaire (`?client`, `?partenaire`) n'affichent **aucun**
de ces éléments (réservés au personnel). Le bouton flottant 📋 et `?carte`
restent inchangés.

### Pourquoi « 12.0 » ?
Le correctif du manifeste (binaire, sans recompilation) exige un numéro de
même longueur : « 11.10 » est impossible. On passe à **12.0** — changement de
majeure justifié par l'ampleur des évolutions (ardoise craie, édition
complète des cartes, publication site).

### Vérifications
- ✅ 14/14 tests accueil (position du panneau, tuiles, onglet nav, mode client)
- ✅ Suites existantes : 51/51 (écran ardoise) · 25/25 (onglet La carte)
- ✅ Manifeste 12.0 (vc 25), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Addon accueil + module vérifiés dans l'APK

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `6a0e4f2f58a470d080827c67c6845bfb64f0a2a5fc4ef81f54fcf99b617c7010` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version 11.x avant (clé de signature différente).
**APK** : `trato-12.0-stable.apk` à la racine du dépôt (tag `v12.0-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v12.0-stable/trato-12.0-stable.apk
