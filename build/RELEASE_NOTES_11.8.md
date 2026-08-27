## 🍽️ Tout s'édite dans l'onglet « La carte » — `trato-11.8-stable.apk` (versionCode 23)

Suite aux retours : **plus besoin d'aller dans « Ardoise & QR »** — l'onglet
**« La carte »** de l'application permet désormais de modifier **la carte
standard ET toutes les cartes demandées**.

### Sélecteur de vues dans l'onglet « La carte »
`🍽️ Carte standard · 🧾 Formules · 🍷 Vins · 🍨 Glaces · 🍺 Bières`

### Vue « Carte standard »
- Chaque famille (Pizzas, Salades, Entrées…) affiche son **titre et
  sous-titre d'ardoise**, modifiables **en place** (bouton *✏️ Titre ardoise*)
- Bouton **« + Ligne libre »** par catégorie : lignes hors catalogue
  gérées directement dans la liste (chips ✏️ modifier / ✕ supprimer,
  édition inline : nom, sous-titre, prix)
- Fiche produit complète inchangée (sous-titre, photo, photo d'ardoise…)

### Vues « Formules / Vins / Glaces / Bières »
L'éditeur complet de chaque carte est **embarqué dans l'onglet** :
titre & sous-titre, ordre ▲▼, lignes libres (créer « Menu enfant »…),
**« ＋ Produit du catalogue »** (sélecteur avec recherche).

### Toujours synchronisé
Toutes ces modifications alimentent l'ardoise, la page publique
(`apercu-carte.html`) via l'API du serveur de carte, et le module embarqué
de l'APK — sur la tablette comme sur le site.

### Vérifications
- ✅ 25/25 tests DOM onglet « La carte » · 51/51 tests écran ardoise
- ✅ Manifeste 11.8 (vc 23), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Bundle carte embarqué 527 Ko (tous marqueurs)

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `3e5bbe5d8116a9ad041d62ab81582ee5c1abf4061e8eb6538d68c91f53ff651d` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version 11.x avant (clé de signature différente).
**APK** : `trato-11.8-stable.apk` à la racine du dépôt (tag `v11.8-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v11.8-stable/trato-11.8-stable.apk
