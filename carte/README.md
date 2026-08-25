# Gestion de la carte — La Trattoria

Module web **autonome et hors ligne** (aucune dépendance, aucun serveur obligatoire)
pour gérer la carte du restaurant : formules, plats, boissons et cocktails,
avec photos, descriptifs et marges.

## Ouvrir

- Sur tablette/téléphone : servir le dossier (ex. `python3 -m http.server 8080` dans
  le dossier `carte/`) puis ouvrir `http://<adresse-du-poste>:8080` dans le navigateur ;
- ou simplement ouvrir `index.html` dans un navigateur récent.

Les données sont conservées **sur l'appareil** (stockage local du navigateur).
Exportez régulièrement la carte (JSON) pour la sauvegarder ou la passer d'une
tablette à l'autre.

## Fonctionnalités

### Types de produits
Chaque produit est un **plat**, une **formule**, une **boisson** ou un **cocktail**.
Le type détermine la famille proposée par défaut (une famille « Cocktails » est créée
au besoin). Toute famille existante (Pizzas, Pâtes, Vins au pichet…) reste utilisable,
et de nouvelles rubriques peuvent être créées à la volée.

### Photos et descriptifs
- Photo par produit, prise à l'appareil photo ou choisie dans la galerie ;
- réduite automatiquement (640 px, JPEG) comme le fait l'application (`Scan.reduire`) ;
- descriptif libre (400 caractères), pensé pour être repris tel quel sur le site public
  et les cartes imprimées.

### Marge
- **Automatique** (recalculée en direct dès qu'un prix, un coût ou une TVA change) :
  - PV HT = prix TTC ÷ (1 + TVA)
  - marge € = PV HT − coût matière
  - taux de marge = marge ÷ PV HT
  - coefficient = PV HT ÷ coût
- **Manuelle** : fixez une cible en **€ HT** ou en **%** ; le module calcule le prix de
  vente TTC nécessaire (arrondi protecteur au 0,10 €) — appliquez-le d'un bouton, ou
  gardez votre prix : la cible reste affichée sur la carte et dans le tableau.
  « Repasser en automatique » efface la cible.
- **Alertes identiques à l'application** : coefficient objectif 4,0 en cuisine
  (TVA 10 %/5,5 %) et 3,8 pour l'alcool (TVA 20 %) ; un produit passe en rouge sous
  80 % de l'objectif avec une marge < 5 €.

### Données
- Préchargé avec les **84 produits** extraits de l'APK (`trato.apk` v11.0) ;
- `donnees.js` = catalogue d'origine, restaurable à tout moment (écran « Données ») ;
- **Export JSON** : format documenté, conforme au modèle `Catalogue.Produit` de
  l'application (champs `id, fam, cat, nom, desc, pv, cout, tva, actif` enrichis de
  `type, photo, margeManuelle`) — prévu pour une réintégration dans l'APK ;
- **Export CSV** (compatible Excel, séparateur « ; », virgule décimale) du tableau des
  marges, avec les cibles manuelles et les prix suggérés.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | structure des trois écrans et de la fiche produit |
| `carte.css` | identité visuelle reprise du site public (palette de l'APK) |
| `carte.js` | logique : catalogue, photos, marges, import/export, persistance |
| `donnees.js` | catalogue d'origine extrait de l'APK |
