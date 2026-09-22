> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

## 🧾🍷🍨🍺 Formules, carte des vins, des glaces et des bières — `trato-11.7-stable.apk` (versionCode 22)

Suite de l'ardoise (v11.6) : **4 cartes additionnelles éditables ligne par ligne**, sur la tablette **et** sur le site.

### Les nouvelles cartes
| Carte | Contenu initial |
|---|---|
| **Nos formules** | Les produits formules du catalogue (Menu Enfant, Formule Midi, Formule Complète, Formule Salade, Planches) + « Menu enfant » en ligne libre — **créez vos formules** en un clic |
| **La carte des vins** | Pichets + Notre cave, **semés automatiquement** du catalogue |
| **La carte des glaces** | Carte libre avec exemples éditables (boules, Coupe colonel…) |
| **La carte des bières** | Pression + bouteilles, **semées automatiquement** |

Chaque carte : **titre + sous-titre éditables**, items **réordonnables ▲▼**,
**lignes libres** (nom, sous-titre, descriptif, prix), **« ＋ Produit du
catalogue »** (sélecteur avec recherche). Un produit placé dans une carte
dédiée **sort de sa catégorie d'origine** (plus de doublon dans Boissons).

### Sur le site aussi
La page publique **`apercu-carte.html`** rend les 4 cartes — données servies
par l'API du serveur de carte (config `extras`), ou valeurs par défaut pour
l'embarqué hors ligne. Accessible depuis la page clients (« Voir l'ardoise
du moment »).

### Vérifications
- ✅ 47/47 tests DOM éditeur · 13/13 tests page publique via API réelle
- ✅ Manifeste 11.7 (vc 22), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Bundle carte embarqué 516 Ko (tous marqueurs présents)

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `38c1a8a0056810d72a1e363b78057186142a382e86f87d81327ef361ec9c4f66` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version 11.x avant (clé de signature différente).
**APK** : `trato-11.7-stable.apk` à la racine du dépôt (tag `v11.7-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v11.7-stable/trato-11.7-stable.apk
