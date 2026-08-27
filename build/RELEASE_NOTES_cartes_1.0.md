# 📱 NOUVELLE APPLICATION NATIVE — « La Trattoria — Édition des cartes » (v1.0)

Application **écrite et compilée de zéro** (option A) : le code source est
dans le dépôt (`build/app-src/src/`). Package **`com.trattoria.cartes`** :
elle s'installe **à côté** de l'application principale — **aucun conflit
d'installation possible** (packages différents).

## Ce qu'elle contient (menu natif « Cartes »)

### 1 · La carte standard
- Les **84 produits** : ajouter, modifier, supprimer — tout mémorisé
- Les **catégories** : ajouter, renommer, supprimer
- Chaque produit : nom, sous-titre, descriptif, prix TTC, TVA, visibilité
- Prix affichés **HT + TTC**

### 2 · Les cartes du moment (6 cartes)
- ✨ Plats · Boissons · **Vins & alcools** · **Glaces L'Angelys** · Desserts · Bières
- Chaque carte : **titre, descriptif, mentions obligatoires modifiables**
  (alcool : mineurs L. 3342-1 + abus dangereux ; allergènes ; L'Angelys)
- Lignes : reprendre des produits de la carte **ou** lignes libres —
  réordonnancement ▲▼, prix **HT** (TVA 10 %/20 %)
- **Illustrations craie par thème** (embarquées)

### 3 · L'ardoise
- Titre, promesses de la maison (fait maison / frais / bio), adresse du site

### Impression
- **Aperçu / Imprimer / PDF** : carte A4 standard (logo, promesses, pâte 48 h,
  SIRET) et chaque carte du moment en **ardoise craie** (police Caveat
  embarquée, illustrations)

### Données
- **Export / Import JSON** (format compatible avec le module carte du site)

## Installation
1. Ouvrir : https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v1.0-cartes/trato-cartes-1.0.apk
   (ou le .zip : même URL en `.zip`)
2. **Taille : 236 406 octets** (0,23 Mo) · SHA-256
   `e4c5b8c9bc5aa62a74410948f311cdb77fb19aca32260573d1cf20b3027dd25e`
3. Autoriser les applications inconnues si demandé → Installer
4. L'icône **« Édition des cartes »** apparaît à côté de La Trattoria —
   **aucune désinstallation nécessaire**, aucune interference

## Vérifications (11/11)
package · version · minSdk/target · activité · signature v1 · signature v2 ·
ZIP intègre · resources.arsc STORE+aligné · classes.dex valide · assets · icône

## Limites v1 (honnêteté)
- Pas d'écran QR dans l'app native (le QR du site reste sur l'ardoise
  imprimée par le module carte et sur le site)
- L'édition vit sur l'appareil (export/import JSON pour transférer) ;
  la publication au site passe par le module carte de l'application
  principale (port 8720)

## Toolchain (code source compilé depuis la sandbox réseau restreint)
ECJ 3.33 (compilateur) · d8 8.2.2 · aapt2 2.20 x64 · android.jar API 25/33 ·
apksigner 0.9 · keystore figé — tout récupéré via GitHub API / npm / pypi.
