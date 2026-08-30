# Analyse historique de l'application « La Trattoria »

> **Rapport de référence statique.** Pour l'état de livraison actuel, consulter
> `build/README.md` et `build/KEYSTORE_ROTATION.md`. Les APK historiques ne
> doivent pas être diffusés.

Analyse réalisée par rétro-ingénierie de `trato.apk` (seul artefact présent dans le dépôt —
le code source n'y figure pas). Décompilation effectuée avec Androguard ; le code n'est pas
obfusqué, les noms de classes et de méthodes sont lisibles.

---

## 1. Fiche d'identité

| Élément | Valeur |
|---|---|
| Application | **La Trattoria** — gestion complète du restaurant |
| Paquet | `com.trattoria.commande` |
| Version | 11.0 (versionCode 15) |
| Android | minSdk 21 (Android 5) → cible 34 (Android 14) |
| Taille | 1,7 Mo |
| Permissions | Internet, Wi-Fi, état réseau, vibration, wake-lock |
| Exploitant (dans le code) | Alexandre Coudret — restaurant à Saintes (17100) |
| Architecture | Java natif, **aucune bibliothèque externe** hors `androidx` minimal (core, FileProvider) et Kotlin stdlib |

## 2. Ce que fait l'application

L'APK est une application de **caisse et de gestion « tout-en-un »**, conçue pour tourner
sur des tablettes du restaurant, **hors ligne** (tout repose sur le Wi-Fi local) :

| Module | Classes principales | Rôle |
|---|---|---|
| **Prise de commande / caisse** | `MainActivity`, `Modele.Ticket/Ligne` | Tables en salle (8) et terrasse (6), addition, encaissement (espèces, CB, titres restaurant), bons de cuisine,historique des ventes |
| **Site public local** | `Site`, `Pages`, `ApiPublique`, `EcranSite` | Serveur HTTP intégré (**port 8720**) qui sert le site du restaurant sur le Wi-Fi : carte, commande à emporter avec créneaux, réservation de table, pages légales (mentions RGPD complètes à paramétrer) |
| **Catalogue** | `Catalogue`, `Catalogue.Produit` | **84 produits codés en dur** dans le code (ci-dessous) |
| **Statistiques** | `Analyse`, `Graphes`, `Base.Stat/Vente` | CA, couverts, ticket moyen, palmarès des ventes, répartition par famille/produit/heure/jour, projection du jour, conseil automatique |
| **Seuil de rentabilité** | `Base`, `Analyse.Objectif` | Charges mensuelles 11 012 € sur 26 jours → charges/jour 423,50 € ; point mort, couverts au seuil, objectif du jour |
| **Comptabilité** | `Compta`, `EcranCompta` | Dépenses (achats matières, loyer, salaires…), TVA collectée/déductible, résultat, export CSV, scan de factures (photo + classement automatique par fournisseur), objectifs avec « niveaux » |
| **Stock** | `Stock`, `Ecrans` | Articles, mouvements, inventaires, alertes « stock bas », liste « à commander » |
| **Personnel** | `Personnel`, `EcranPersonnel` | Membres, contrats, bilan |
| **Anti-gaspillage** | `AntiGaspi` | Invendus, paniers anti-gaspi à prix réduit |
| **Ardoises** | `Ardoises` | Menus « du jour » modifiables (suggestions du moment) |
| **Réseau de tablettes** | `Reseau`, `EcranReseau` | Mode maître/satellite : plusieurs tablettes synchronisées en Wi-Fi local |
| **Réseautage local** | `Reseautage` | Partenaires, messagerie privée entre établissements |
| **Export caisse externe** | `Hiboutik` | Rapprochement et envoi des ventes vers la caisse **Hiboutik** (API + clé) |
| **Impression** | `Impression`, `Apercu` | Impression PDF des cartes, aperçu avant impression |
| **Photos** | `Scan`, `Site.photos` | Prise de photo des plats (appareil photo ou galerie), affichées sur le site public |

## 3. Le modèle produit actuel

Classe `Catalogue.Produit` (décompilée textuellement) :

```java
public class Produit {
    public boolean actif;
    public String id;     // « p1 »… « p84 »
    public String fam;    // famille   : Pizzas, Salades, Entrées, Pâtes, Desserts,
                          //             Formules, Apéritif, Boissons
    public String cat;    // catégorie : « Nos pizzas », « Vins au pichet »…
    public String nom;
    public String desc;   // descriptif affiché sur le site
    public double pv;     // prix de vente TTC
    public double cout;   // coût matière
    public double tva;    // 0,10 (cuisine) ou 0,20 (alcool)

    public double ht()    { return pv / (1 + tva); }
    public double marge() { return ht() - cout; }
    public double coef()  { return cout > 0 ? ht() / cout : 0; }
}
```

Constats importants pour la demande en cours :

1. **La marge existe déjà mais elle est figée** : calculée automatiquement,
   jamais modifiable à la main. L'écran d'administration affiche le tableau
   *« LA CARTE — 84 PRODUITS »* (Produit / Prix / Coût / Marge / Coeff) et colore en
   rouge un produit dont le coefficient passe sous 80 % de l'objectif
   (**coeff. 4,0** en cuisine, **3,8** pour l'alcool — `Base.objectifCoef` /
   `Base.objectifCoefAlc`) avec une marge < 5 €.
2. **Il n'existe aucun écran pour ajouter, modifier ou supprimer un produit.**
   Le catalogue est une liste statique compilée dans l'APK ; toute évolution de la
   carte exige de recompiler l'application.
3. **Les photos existent mais sont détachées du produit** : elles sont indexées par
   *nom* (`Site.photos : nom → chemin de fichier`), réduites (320 px, JPEG 74 %) et
   embarquées en base64 dans la page web servie en local. Pas de photo dans la fiche
   produit elle-même.
4. **Le descriptif existe** (`desc`, affiché sur le site public) mais n'est pas
   modifiable depuis l'application.
5. **Pas de « cocktails » proprement dits** : ils sont rangés dans la famille
   « Apéritif » (Spritz maison, Americano, Kir, Picon, apéritif sans alcool).
   Pas de famille dédiée.
6. **Persistance 100 % SharedPreferences + JSON** (tickets, commandes du site,
   dépenses, photos) : simple, mais aucune base pour un catalogue évolutif.

## 4. Le site public

`assets/site.js` + `assets/site.css` : soigné, accessible (ARIA), retours haptiques et
sonores, panier conservé en session, revalidation des prix côté DOM (« jamais NaN € »),
créneaux de retrait 11 h–14 h / 18 h–22 h par quarts d'heure, gestion dégradée
hors ligne (« appelez-nous »). La page complète est **générée par l'APK** (`Site.page()`)
à partir du catalogue.

## 5. Ce que demande la nouvelle fonctionnalité — ce qui bloque

Besoin exprimé :

1. Ajouter des **formules, plats, boissons et cocktails** à la carte ;
2. Leur adjoindre **photos et descriptifs** ;
3. **Calculer/évaluer la marge par produit automatiquement**, et pouvoir la
   **modifier manuellement**.

Blocage : le dépôt ne contient que l'**APK compilé**. Modifier proprement une
application Android exige son code source (projet Android Studio / Gradle), et la
recompilation avec le SDK Android. La rétro-ingénierie permet tout juste de lire le
code, pas de reconstruire un projet compilable fiable (2 500 classes, ressources, DEX).
**Pour intégrer ces fonctions *dans* l'APK, le code source est indispensable.**

## 6. Ce qui est livré en l'état

En attendant le code source, un module autonome **`carte/`** (application web
mobile-first, zéro dépendance, hors ligne — la même philosophie que votre application) :

- **CRUD complet** : création/modification/suppression de formules, plats, boissons,
  cocktails (la famille « Cocktails » est créée), avec activation/masquage temporaire ;
- **Photos** par produit (galerie ou appareil photo, réduction automatique à 640 px
  JPEG — la même approche que `Scan.reduire()` de l'APK) et **descriptifs** éditables ;
- **Marge automatique** : PV HT = TTC ÷ (1 + TVA) ; marge = PV HT − coût ; taux ;
  coefficient — avec les **mêmes seuils d'alerte** que votre écran d'administration
  (coeff. 4,0 cuisine / 3,8 alcool, alerte sous 80 % de l'objectif et marge < 5 €) ;
- **Marge manuelle** : une cible en € HT ou en % produit le **prix de vente à
  appliquer** (arrondi protecteur au 0,10 € supérieur), bouton « Appliquer ce prix »,
  retour possible en automatique à tout moment — la cible reste visible
  (badge « marge : … » sur la carte et colonne « Cible » du tableau) ;
- **Préchargée avec vos 84 produits réels**, extraits de l'APK (noms, familles,
  catégories, descriptifs, prix, coûts, TVA exacts) ;
- **Modèle de données strictement identique** à `Catalogue.Produit`
  (`id, fam, cat, nom, desc, pv, cout, tva, actif`) + `type, photo, margeManuelle`,
  avec **export JSON** (format documenté, pensé pour être réinjecté dans l'application
  native) et **export CSV** du tableau des marges (compatible Excel) ;
- Écran **Marges** : indicateurs (marge moyenne, taux moyen, produits sous objectif),
  tableau triable, statistiques par famille — l'équivalent de votre écran
  « LA CARTE — 84 PRODUITS », rendu interactif.

### Chemin d'intégration dans l'APK (une fois le code source fourni)

1. Ajouter `type`, `photo`, `margeManuelle` à `Catalogue.Produit` et rendre le
   catalogue persistant (SharedPreferences JSON, comme les tickets) avec import du
   JSON exporté par ce module ;
2. Rattacher `Site.photos` à `Produit.id` (au lieu de `nom`) ou fusionner dans le
   champ `photo` ;
3. Nouvel écran « Carte » en réutilisant `Ecrans`, `UI` et `Scan` (intents photo
   `DEMANDE_PHOTO_PLAT`/`DEMANDE_GALERIE_PLAT` déjà prévus) ;
4. Faire consommer `Site.page()` et `Impression` par le catalogue persistant pour
   publier automatiquement photos et descriptifs sur le site local et les cartes PDF.
