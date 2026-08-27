## ✏️ Panneau « Éditer les cartes » dans le menu Cartes de l'application — `trato-11.9-stable.apk` (versionCode 24)

Dans l'application (menu **« La carte »** de la tablette), un panneau
d'édition est désormais injecté en haut de la section :

> **✏️ Éditer les cartes** — *La carte standard, les formules, les vins, les
> glaces, les bières, l'ardoise et le QR — tout se modifie ici, à la craie
> sur ardoise.*

### Les 6 tuiles (ouverture directe sur le bon écran)
| Tuile | Écran ouvert |
|---|---|
| 🍽️ **La carte (standard)** | Produits, catégories, titres/sous-titres d'ardoise, lignes libres |
| 🧾 **Formules** | Créer des formules (Menu enfant…) |
| 🍷 **Vins** | La carte des vins (pichets + cave) |
| 🍨 **Glaces** | La carte des glaces |
| 🍺 **Bières** | La carte des bières |
| 📋 **Ardoise & QR** | En-tête, badges, pâte 48 h, QR du site |

Chaque tuile ouvre le module intégré **directement sur le bon écran**
(lien profond `#ecran-carte&vue=…`). Le bouton flottant 📋 et l'URL
`?carte` restent inchangés. Les liens profonds fonctionnent aussi en PWA
autonome (`…/index.html#ecran-carte&vue=vins`).

### Vérifications
- ✅ 21/21 tests (liens profonds + panneau) · 51/51 · 25/25 (suites existantes)
- ✅ Manifeste 11.9 (vc 24), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Addon panneau + module (528 Ko) vérifiés dans l'APK

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `0bf8a4ba7a9663ee12687008fb378442d73b0c6139f0fd9f890af2f930dc7ec2` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version 11.x avant (clé de signature différente).
**APK** : `trato-11.9-stable.apk` à la racine du dépôt (tag `v11.9-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v11.9-stable/trato-11.9-stable.apk
