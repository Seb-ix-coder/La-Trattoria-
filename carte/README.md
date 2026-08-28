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

## Installer comme une application (recommandé)

Le module est une **PWA** : après un premier chargement, il fonctionne
**entièrement hors ligne**, avec sa propre icône — sans passer par le Play Store.

1. Servir le dossier sur le Wi-Fi du restaurant (toute méthode convient ;
   sur Android, une application « serveur HTTP » suffit) ;
2. Ouvrir l'adresse dans Chrome (Android) ou Safari (iPad) ;
3. **Android** : menu ⋮ → *Ajouter à l'écran d'accueil* → l'icône rouge
   « La Carte » apparaît ;
4. **iPad/iPhone** : bouton *Partager* → *Sur l'écran d'accueil*.

Ensuite, tout est en cache : l'application se lance avec ou sans connexion,
exactement comme l'APK. Les photos, produits et marges saisis restent sur
chaque tablette (penser à l'export JSON pour synchroniser).

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

### Cartes du jour (ardoises)
Trois cartes prêtes à composer et à imprimer : **plats du jour**, **bières du jour**,
**carte des desserts** (titres modifiables).
- Composition depuis les produits du catalogue (recherche + cases à cocher) ou par
  **lignes libres** (nom, descriptif, prix) ;
- ordre réglable (↑ ↓), retrait d'un geste ; bières et desserts proposent une
  **sélection automatique** (catégorie « Bières », famille « Desserts ») ;
- **aperçu plein écran** et **impression** soignée (une carte par page, date du jour,
  mise en page trattoria), chacune séparément ou les trois d'un coup ;
- une carte vide n'est ni affichée ni imprimée.

Équivalent des « Ardoises » de l'application, en plus complet.

### Allergènes (réglementation UE)
- Les **14 allergènes déclarables** sont suivis produit par produit ;
- **pré-remplis automatiquement** d'après les ingrédients de la carte d'origine
  (63 produits sur 84 — à vérifier fiche par fiche) ;
- affichés en pictogrammes sur les fiches et la **page clients**, avec légende
  et filtres « sans gluten / sans lactose / sans œufs… ».

### Formats et prix (verre / bouteille, 25/50 cl…)
Un même produit peut avoir **plusieurs formats**, chacun avec son prix, son coût et
donc **sa marge propre** (affichée fiche, tableau des marges, page clients). Sans
format, le prix unique s'applique comme avant ; le prix affiché devient « dès X € »
quand le produit n'a que des formats.

### Vente à emporter
- **TVA à l'emporté dédiée** par produit (5,5 % / 10 % / 20 %, sinon celle de salle) ;
- la **marge à l'emporté** est calculée en regard (fiche + tableau + KPI
  « vendus à l'emporté ») et exportée dans le CSV.

### Synchronisation entre tablettes + page clients
Lancer **`serveur_carte.py`** (Python 3, sans dépendance) sur un appareil du restaurant :

```
python3 serveur_carte.py        # port 8080 par défaut
```

- toutes les tablettes ouvertes sur `http://<serveur>:8080/index.html` se
  **synchronisent automatiquement** (relevé toutes les 15 s ; la dernière
  modification fait foi) — le badge en haut de l'écran indique l'état ;
- **`public.html`** : page clients responsive avec accueil éditorial premium,
  belle photo mise en avant, sélection « À la une », boutons d'ajout et panier
  local conservé dans la session (confirmation de commande par téléphone), logo
  La Trattoria, visuel Petit Futé 2026 compact, navigation, recherche, carte
  filtrable, plats du jour, réservation, avis et partenaires ;
  les photos administrées sont prioritaires et les absences sont signalées.
  Le catalogue contient aussi 84 visuels générés haute définition de repli,
  homogènes (même angle trois-quarts, ardoise sombre, lumière chaude) et
  explicitement marqués « Visuel généré — à valider » tant que l'équipe ne
  les a pas validés.

### Données
- Préchargé avec les **84 produits** extraits de l'APK (`trato.apk` v11.0) ;
- `donnees.js` = catalogue d'origine, restaurable à tout moment (écran « Données ») ;
- **Export JSON** : format documenté, conforme au modèle `Catalogue.Produit` de
  l'application (champs `id, fam, cat, nom, desc, pv, cout, tva, actif` enrichis de
  `type, photo, margeManuelle`) + l'état des cartes du jour — prévu pour une
  réintégration dans l'APK ;
- **Export CSV** (compatible Excel, séparateur « ; », virgule décimale) du tableau des
  marges, avec les cibles manuelles et les prix suggérés.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | structure des quatre écrans et des boîtes de dialogue |
| `carte.css` | identité visuelle reprise du site public (palette de l'APK) + styles d'impression |
| `carte.js` | logique : catalogue, photos, marges, cartes du jour, synchronisation, import/export |
| `donnees.js` | catalogue d'origine extrait de l'APK |
| `serveur_carte.py` | serveur local : synchronisation entre tablettes + page clients |
| `public.html` | page publique lecture seule : accueil responsive, logo, visuel Petit Futé 2026, carte, recherche, plats du jour, réservation, avis et partenaires |
| `manifest.webmanifest`, `sw.js`, `icones/` | installation PWA + fonctionnement hors ligne |

## Ardoise & QR (carte principale éditable)

Tout s'édite **depuis l'onglet « La carte »** de l'application : un sélecteur
de vues y donne accès à la **carte standard** (chacune de ses familles avec
son titre/sous-titre d'ardoise éditables en place, ses lignes libres, et la
fiche produit complète) et aux **cartes dédiées** (Formules, Vins, Glaces,
Bières — éditeur complet embarqué dans l'onglet). L'onglet **« Ardoise & QR »**
complète : aperçu plein écran, impression, QR, en-tête.

L'onglet **« Ardoise & QR »** édite aussi la carte principale affichée en ardoise
(fond ardoise, écriture manuscrite à la craie — police Caveat embarquée, OFL) :

- **titre + sous-titre par catégorie** (Pizzas, Salades, Entrées…) ;
- **items ligne par ligne** : chaque produit de la catégorie est éditable
  (fiche produit, avec **sous-titre** dédié) et réordonnable (▲▼) ;
- **lignes libres** : ajoutez des lignes hors catalogue (menu enfant,
  suggestion, tarif spécifique…) — nom, sous-titre, descriptif, prix ;
- **photos** : photo principale (fiche) et **photo d'ardoise** (format
  polaroid craie sur l'ardoise ; à défaut la photo principale est utilisée) ;
- **en-tête** : logo officiel + « tout est fait maison / tout est frais /
  bio dès que possible » (modifiables) + bandeau **pâte à pizza fraîche
  maturée 48 h** ;
- **cartes additionnelles** : **Nos formules** (créez vos formules — Menu
  enfant… — produits formules du catalogue + lignes libres), **La carte des
  vins** (pichets + cave, semées automatiquement), **La carte des glaces**
  (libre, exemples fournis) et **La carte des bières** (semée
  automatiquement) ; chaque carte : titre, sous-titre, réordonnancement,
  lignes libres, « ＋ Produit du catalogue » ; un produit placé dans une
  carte dédiée sort de sa catégorie d'origine ;
- **QR code du site** affiché sur l'ardoise (adresse modifiable, QR
  régénéré et vérifié — niveau H) ;
- **aperçu plein écran + impression/PDF** (l'impression n'imprime que
  l'ardoise).

Publication : la configuration (`config`) est synchronisée avec le serveur
de carte (`api/carte`, champ `config`) et affichée par la page publique
**`apercu-carte.html`** (fond ardoise, lecture seule, imprimable) —
accessible depuis `public.html` (« Voir l'ardoise du moment »).

Export/import JSON : la config voyage avec la carte (version 4 du format).
