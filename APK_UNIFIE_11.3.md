# APK unifié 11.3 — module « carte » intégré dans l'application

`trato-11.3-unifie.apk` est **l'application unique** du restaurant : la
tablette sert (port `8720`) la caisse, le site public avec **module
social** (appeler + avis Google/Facebook/Tripadvisor), l'espace
partenaires **et** le module de gestion de la carte (dossier `carte/`).

## Ce qu'apporte le 11.3 par rapport au 11.2 durci

| | 11.2 durci | **11.3 unifié** |
|---|---|---|
| Caisse, commandes, produits, marges | ✅ | ✅ |
| Site public + commande en ligne + réservation | ✅ | ✅ |
| **Module social** (appeler, avis Google/Facebook/Tripadvisor, `?client`) | ✅ | ✅ (conservé tel quel) |
| Espace partenaires (`?partenaire`) | ✅ | ✅ (conservé tel quel) |
| QR intégré, outils de conformité, pourboire, fidélité, produits | ✅ | ✅ (conservés tels quels) |
| **Gestion de la carte** (84 produits, photos, marges, cartes du jour, données) | dossier `carte/` séparé (PWA à servir) | ✅ **intégrée dans l'APK** |

## Ouvrir le module carte

Depuis n'importe quel appareil du Wi-Fi du restaurant :

```
http://<ip-tablette>:8720/?carte
```

Ou, sur la tablette (mode personnel) : le **bouton flottant 📋** au-dessus
du bouton ⚙ Outils.

Le module s'ouvre en plein écran. Ses données (produits modifiés, cartes
du jour, photos) sont conservées **sur la tablette** dans le stockage
local du navigateur (même origine que la page principale). Le badge
affiche « Mode autonome » : la synchronisation multi-tablettes
(`serveur_carte.py`) n'est pas applicable au mode intégré — pour
synchroniser des tablettes entre elles, continuez d'utiliser la PWA
standalone (dossier `carte/` servi par `serveur_carte.py`), dont les
données restent compatibles (même modèle, même export JSON).

## Comment c'est fait (aucune chirurgie DEX)

Le site client de l'application est une page unique produite par le DEX
avec `assets/site.css` / `assets/site.js` inclus en ligne. L'intégration
se limite donc à l'asset `site.js` :

1. le module `carte/` est assemblé en un **document HTML autonome**
   (CSS/JS inclus, icônes en data URI, manifest et `public.html`
   neutralisés) ;
2. ce document est encodé en base64 et embarqué dans un **addon JS**
   ajouté à la fin de `site.js` :
   - mode `?carte` → iframe `blob:` plein écran (même origine → le
     `localStorage` du module fonctionne) ;
   - bouton 📋 en mode personnel (masqué en `?client`/`?partenaire`) ;
3. `versionCode 17 → 18`, `versionName 11.2 → 11.3` (remplacement en
   place, même longueur) ;
4. reconstruction ZIP + signatures v1+v2 avec l'outillage existant
   (`resign.py`).

Le DEX est **inchangé byte à byte** (vérifié) : la logique serveur, le
module social et tous les builds 11.2 sont conservés.

## Vérifications effectuées (`build/verify_unifie.py`)

- manifeste : `com.trattoria.commande` 11.3 (vc 18), `allowBackup=false`,
  minSdk 21 / targetSdk 34 ;
- DEX inchangé byte à byte ;
- `site.js` : builds 11.2 conservés (QR, conformité, pourboire,
  paiement, fidélité, **module social**) + addon carte (bundle décodé et
  contrôlé : catalogue, onglets, synchro, icônes) ;
- ZIP : mêmes entrées que l'original, seuls `AndroidManifest.xml` et
  `assets/site.js` remplacés ;
- signatures v1 (JAR) et v2 (APK Signature Scheme) vérifiées ;
- test fonctionnel : module chargé dans un navigateur — 4 onglets,
  84 produits, zéro erreur JS.

```bash
python3 build/verify_unifie.py trato-11.3-unifie.apk trato-11.1-durci.apk
```

## Installation

> ⚠️ **Clé de signature** : ce build est signé avec une clé générée pour
> cette intégration (l'originale du 11.2 n'est pas dans le dépôt — elle
> ne doit pas y être). Android refusera une mise à jour par-dessus le
> 11.2 : **désinstallez l'application avant d'installer le 11.3**
> (pensez à exporter vos données d'abord, onglet Administration).

- la clé utilisée pour ce build est conservée hors dépôt :
  `/home/user/work-ks/trattoria-release.p12` + `README-KEYSTORE.txt`
  (mot de passe + empreinte). **Sauvegardez-la précieusement** : c'est
  la clé d'identité du 11.3 et des builds suivants.
- **Si vous possédez la clé d'origine** (celle du 11.2), vous pouvez
  signer le même build avec votre clé (aucune désinstallation
  nécessaire ensuite) :
  ```bash
  python3 build/integrer_carte.py trato-11.1-durci.apk carte \
      ~/trattoria-keystore/trattoria-release.p12 "MOT_DE_PASSE" \
      trato-11.3-unifie.apk
  ```

## Régénérer

```bash
# dépendances : pip install -r build/requirements.txt
python3 build/integrer_carte.py trato-11.1-durci.apk carte \
    /chemin/trattoria-release.p12 "MOT_DE_PASSE" trato-11.3-unifie.apk
python3 build/verify_unifie.py trato-11.3-unifie.apk trato-11.1-durci.apk
```
