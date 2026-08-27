# « Éditer les cartes » sur la tablette — icône sur l'écran d'accueil

Le menu « Cartes » de l'application est un écran **natif** compilé dans le
moteur (`classes.dex`). Modifier ce moteur fait planter l'application au
lancement (crash silencieux des versions 11.1→11.4 — voir
`DIAGNOSTIQUE_CRASH.md`). Le moteur reste donc intact, et l'édition
complète des cartes se pose **à côté**, en une icône sur l'écran
d'accueil de la tablette — comme une seconde application.

## Installation (une fois, ~2 minutes)

Prérequis : l'application **`trato-12.1-stable.apk`** (ou plus récente)
est installée et a été **lancée au moins une fois** (le serveur local
tourne dès que l'application est ouverte).

1. Sur la tablette, ouvrir **Chrome** (ou le navigateur installé).
2. Dans la barre d'adresse, taper :
   ```
   127.0.0.1:8720/?carte
   ```
   → le module **« Éditer les cartes »** s'ouvre en plein écran
   (logo, fond ardoise, écriture à la craie).
3. Menu **⋮** du navigateur (en haut à droite) →
   **« Ajouter à l'écran d'accueil »**.
4. Nommer le raccourci : **`Éditer les cartes`** → valider.

Une icône **« Éditer les cartes »** (logo du restaurant, fond crème)
apparaît sur l'écran d'accueil de la tablette, **à côté de l'icône
La Trattoria**.

## Utilisation

- Un **tap sur l'icône** ouvre le module plein écran :
  - 🍽️ **La carte (standard)** — produits, catégories, titres et
    sous-titres d'ardoise, lignes libres, photos ;
  - 🧾 **Formules** · 🍷 **Vins** · 🍨 **Glaces** · 🍺 **Bières** ;
  - 📋 **Ardoise & QR** (en-tête, badges, pâte 48 h, QR du site).
- Tout est publié **automatiquement sur le site** (page clients +
  `apercu-carte.html`) via le serveur local de l'application.

## Conditions de fonctionnement

- L'**application La Trattoria doit être ouverte** (au premier plan ou en
  arrière-plan) : c'est elle qui héberge le serveur local (port 8720) et
  les données. Le raccourci ouvre une page servie par l'application.
- Fonctionne **hors ligne** (réseau local uniquement, aucune connexion
  Internet requise).

## Pour aller plus loin

- **Multi-tablettes** : lancer `serveur_carte.py` (dossier `carte/` du
  dépôt, port 8080) sur la machine du réseau pour synchroniser les
  éditions entre tablettes — voir `carte/README.md`.
- **Intégration native** : l'ajout d'options dans le menu « Cartes »
  natif nécessiterait de recompiler l'application depuis ses sources
  (le moteur actuel n'a pas de sources dans le dépôt) — toute
  modification du `classes.dex` compilé provoque le crash documenté dans
  `DIAGNOSTIQUE_CRASH.md`.
