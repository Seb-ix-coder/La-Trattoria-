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
Le type détermine la famille proposée par défaut. Toute famille existante reste
utilisable et de nouvelles rubriques peuvent être créées à la volée.

### Photos et descriptifs
- Photo par produit, prise à l'appareil photo ou choisie dans la galerie ;
- réduite automatiquement (640 px, JPEG) ;
- descriptif libre, repris sur le site public et les cartes imprimées.

### Marge
- **Automatique** : PV HT = prix TTC ÷ (1 + TVA), marge = PV HT − coût matière,
  taux de marge et coefficient calculés en direct ;
- **Manuelle** : cible en € HT ou en %, avec prix TTC nécessaire arrondi au 0,10 € ;
- alertes sous l'objectif de coefficient (4,0 cuisine, 3,8 alcool).

### Cartes du jour et formats
Cartes composables depuis le catalogue ou par lignes libres, ordre réglable,
aperçu plein écran et impression. Les formats verre/bouteille ou 25/50 cl ont
leur prix et leur coût propres. Une TVA emportée dédiée peut être définie.

### Synchronisation entre tablettes + page clients
Lancer **`serveur_carte.py`** (Python 3, sans dépendance) sur un appareil du restaurant :

```bash
python3 serveur_carte.py        # port 8080 par défaut
```

Au premier démarrage, le serveur génère un jeton dans
`~/.config/la-trattoria/carte-api-token` (droits 600). Copier ce jeton dans
l'onglet **Données** de chaque tablette de gestion. La lecture de la page
publique reste possible sans jeton, mais toute écriture `/api/carte` est
refusée sans l'en-tête `X-Carte-Token`. Pour un déploiement automatisé,
utiliser `CARTE_API_TOKEN` ou `CARTE_TOKEN_FILE` hors du dossier servi.

- les tablettes ouvertes sur `http://<serveur>:8080/index.html` se synchronisent
  automatiquement (relevé toutes les 15 s ; la dernière modification fait foi) ;
- **`public.html`** est une page clients en **lecture seule**, rafraîchie chaque
  minute ;
- `donnees-serveur.json` est conservé hors des fichiers statiques et n'est plus
  téléchargeable par HTTP.

### Connexion vérifiable et liens officiels

Dans **Données → Entre tablettes et avec les clients**, l'adresse du serveur
est affichée et mémorisée sur la tablette. Le bouton **Enregistrer et tester le
serveur** vérifie l'API, affiche la version publiée et met à jour les liens
**Page publique** et **État API** avec les adresses réellement servies par le
serveur. La page d'état `/api/liens` expose aussi les adresses officielles de
la gestion, de la page publique, de l'aperçu et de l'API : ne pas recopier un
chemin relatif à la main.

Si l'administration est hébergée sur une autre adresse que le serveur de carte,
autoriser explicitement son origine, sans jamais mettre le jeton Hiboutik dans
le navigateur :

```bash
CARTE_ALLOWED_ORIGINS="https://admin.example" python3 serveur_carte.py 8080
```

Le serveur accepte également plusieurs origines séparées par des virgules.
Pour un usage quotidien, ouvrir de préférence `http://adresse-du-serveur:8080/index.html` :
le champ est alors prérempli avec l'adresse active et les liens public,
apercu et API restent cohérents après un changement de port.

Le protocole reste du HTTP local : ne pas exposer ce serveur à Internet sans
reverse-proxy HTTPS et contrôle réseau adapté.

### Inventaire et création dans Hiboutik

Depuis l'onglet **Données**, l'application peut lire le catalogue Hiboutik,
mettre à jour les quantités disponibles et proposer la commande **Depuis
l'inventaire** lors de la composition d'une carte du jour. La commande
**Composer manuellement** reste toujours disponible, ainsi que l'ajout de
lignes libres.

La fiche **Ajouter** conserve aussi la création locale d'un produit. En cochant
**Créer aussi ce nouveau produit dans Hiboutik**, une confirmation explicite
est demandée puis le serveur de carte crée le produit dans Hiboutik. Le
navigateur ne reçoit jamais la clé API : elle doit rester dans l'environnement
du serveur :

```bash
export HIBOUTIK_ACCOUNT="mon-compte"
export HIBOUTIK_API_USER="utilisateur-api"
export HIBOUTIK_API_KEY="cle-api"
# IDs des taxes et de catégorie Hiboutik — à renseigner selon le compte
export HIBOUTIK_TAX_ID_055="3"
export HIBOUTIK_TAX_ID_10="2"
export HIBOUTIK_TAX_ID_20="1"
export HIBOUTIK_DEFAULT_CATEGORY_ID="5"
python3 serveur_carte.py 8080
```

Les IDs de catégorie, marque et fournisseur par défaut peuvent être fournis
avec `HIBOUTIK_DEFAULT_CATEGORY_ID`, `HIBOUTIK_DEFAULT_BRAND_ID` et
`HIBOUTIK_DEFAULT_SUPPLIER_ID`. Une création est protégée par le jeton de
gestion de la carte et un garde-fou refuse les doublons de nom ou de code-
barres. Une erreur Hiboutik ne supprime jamais le produit local.

### Allergènes
Les 14 allergènes déclarables sont suivis produit par produit, pré-remplis
d'après les ingrédients de la carte d'origine et affichés sur la page clients.
La liste doit être vérifiée fiche par fiche avant publication.

### Import/export
Le format JSON v4 contient `produits` et l'alias historique `carte`, ainsi que
`ardoises` et `config`. L'application native `com.trattoria.cartes` accepte les
deux noms de catalogue. Les structures détaillées de cartes du jour ne sont
pas identiques entre les deux modules : vérifier le rendu après transfert.

## Impression urgente — cartes A4 individuelles

Des fichiers autonomes, prêts pour une imprimante standard, sont disponibles
dans [`impression/`](impression/) : **une carte = une page A4**.

- [`preview-modifiable.html`](impression/preview-modifiable.html) — preview
  partageable des quatre cartes, avec édition locale, impression et téléchargement
  d’une version corrigée ;
- [`cartes-contact-a4.html`](impression/cartes-contact-a4.html) — planche A4 de
  10 cartes de contact au format 85 × 55 mm, à découper ;
- [`offre-20.html`](offre-20.html) — carte mobile spéciale -20 % avec collecte
  minimale d’un contact et consentement ;
- [`07-carte-restaurant-economique.html`](impression/07-carte-restaurant-economique.html)
  — menu complet compact sur une seule feuille A4 ;
- [`01-carte-principale.html`](impression/01-carte-principale.html) — pizzas,
  salades, pâtes fraîches, tiramisus du jour et formules ;
- [`02-carte-pizzas.html`](impression/02-carte-pizzas.html) — pizzas seules ;
- [`05-carte-salades.html`](impression/05-carte-salades.html) — salades seules ;
- [`06-carte-formules.html`](impression/06-carte-formules.html) — formules seules, adaptées au porte-vue ;
- [`08-carte-boissons.html`](impression/08-carte-boissons.html) — carte boissons illustrée ;
- [`03-glaces-langelys.html`](impression/03-glaces-langelys.html) — glaces et
  sorbets L’Angelys ;
- [`04-bieres-du-moment.html`](impression/04-bieres-du-moment.html) — bières
  seules.

Depuis l'application, le bloc **« Imprimer les cartes du restaurant »** ouvre
ces mêmes fiches, y compris dans l'APK unifiée : les fiches sont embarquées
pour fonctionner hors ligne. L'impression est en lecture seule : elle ne crée
aucune vente et n'envoie aucune écriture à Hiboutik. Avant impression, vérifier
que le catalogue et les prix de l'application correspondent à la caisse
Hiboutik validée.

Ouvrir le fichier puis cliquer sur **Imprimer cette carte**. Choisir A4,
échelle 100 %/taille réelle et désactiver les en-têtes et pieds de page du
navigateur. Régénérer après modification du catalogue :

```bash
python3 build/generer_cartes_a4.py
```

## Ardoise & QR

L'onglet **« Ardoise & QR »** édite la carte principale : titres et sous-titres
par catégorie, lignes libres, photos, cartes dédiées Formules/Vins/Glaces/Bières,
QR du site, aperçu et impression/PDF avec mentions obligatoires.
