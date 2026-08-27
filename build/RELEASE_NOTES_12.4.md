## ✏️ L'onglet « La carte » = miroir étendu de l'onglet natif « Cartes » — `trato-12.4-stable.apk` (versionCode 29)

**Corriger aussi : les prix produits affichaient « 0,00 € »** dans l'éditeur
et l'ardoise — corrigé partout (bug de double mise en forme).

### L'écran « La carte » reprend tout l'onglet natif « Cartes » — et va plus loin
L'écran natif « Produire les cartes » est **compilé dans le moteur** de
l'application (non modifiable sans crash documenté). Son **miroir complet**
vit désormais dans l'onglet **« La carte »** du module (à côté de l'app) :

| Onglet natif « Cartes » | Miroir dans « La carte » |
|---|---|
| **1 · La carte standard** (aperçu, imprimer, PDF) | **🍽️ Carte standard** : édition complète (titres/sous-titres par catégorie, sous-titres produits, lignes libres, photos) **+ 🖨️ Carte A4** : aperçu/impression/PDF depuis les données éditées |
| **2·3 · Les ardoises du jour** (plats, bières & apéritifs) | **🗓️ Ardoises du jour** (même éditeur, même impression) **+ l'ardoise principale craie** |
| — (absent du natif) | **🧾 Formules · 🍷 Vins · 🍨 Glaces · 🍺 Bières** : cartes éditables ligne par ligne |

L'aperçu **Carte A4** affiche : logo, adresse, téléphone, promesses
(maison/frais/bio, pâte 48 h), chaque catégorie avec son titre et sous-titre
édités, produits + prix, SIRET en pied — **Imprimer / Enregistrer en PDF**
directement.

### Accès (depuis l'application)
Panneau « ✏️ Éditer les cartes » en haut de l'accueil → tuile **🍽️ La carte
(standard)** — ou onglet **✏️ Cartes** — ou icône « Éditer les cartes »
(`127.0.0.1:8720/?carte`). Tout est publié automatiquement sur le site.

### Vérifications
- ✅ 17/17 tests miroir Cartes · suites existantes 51/51 · 25/25 · 14/14 · 26/26
- ✅ Manifeste 12.4 (vc 29), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Prix corrigés (10,00 € au lieu de 0,00 €)

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `f4fa93f27b8029ee5d58906d24194f3d49ee11eee1f1ea7f40d8a359fd545815` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Si une version **11.5 → 11.8** est installée : désinstallez d'abord
> (clé différente). Depuis **11.9, 12.0–12.3** : mise à jour directe.
**APK** : `trato-12.4-stable.apk` — **2 172 910 octets** —
https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v12.4-stable/trato-12.4-stable.apk
