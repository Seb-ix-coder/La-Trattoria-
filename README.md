# La Trattoria

Projet unique du restaurant **La Trattoria** (Saintes, 17100) : application de
gestion, module de carte du jour, application client/partenaire avec module
social, cartes imprimables. **Tout le projet vit dans cette branche.**

## Contenu du dépôt

| Élément | Description |
|---|---|
| `trato.apk` | Application Android v11.0 (`com.trattoria.commande`) — artefact d'origine (moteur DEX de référence) |
| `trato-11.5-stable.apk` | **⭐ Version stable recommandée** (versionCode 20) : moteur DEX 11.0 **intact** (zéro patch DEX — correctif du crash au lancement) + toutes les fonctions couche web + manifeste durci — produite par `build/run_build_stable.sh` |
| `trato-11.4.apk` | Build 11.4 corrigé (versionCode 19) : première APK sans patch DEX (branche parallèle) |
| `trato-11.4-stable.apk` | ⚠️ build 11.4 avec DEX patché — **provoquait le crash au lancement**, retirée du dépôt (voir `DIAGNOSTIQUE_CRASH.md`) |
| `trato-11.1-durci.apk` | APK durci v11.2 (versionCode 17, signé v1+v2) : correctifs sécurité + QR intégré + outils de conformité + pourboire + paiement/fidélité + module social — ⚠️ DEX patché (crash au lancement) |
| `trato-11.3-unifie.apk` | Application unifiée 11.3 (versionCode 18) : tout le 11.2 **+ le module « carte » intégré** — voir `APK_UNIFIE_11.3.md` — ⚠️ DEX patché (crash au lancement) |
| `trato-11.1-temoin.apk`, `trato-temoin-chirurgical.apk` | Variantes témoins du build 11.1 |
| `build/` | Outillage reproductible du build APK (patch AXML/assets, **zéro patch DEX**, signature v1/v2, vérifications) |
| `build/mode_app.js` / `mode_app.css` | **Module social** + modes client/partenaire (barre sociale : avis Google/Facebook/Tripadvisor, appeler ; espace partenaires) |
| `carte/` | **Gestion de la carte** (PWA autonome et hors ligne) : produits, photos, marges, cartes du jour, **ardoise de la carte principale éditable** (titres/sous-titres par catégorie, lignes libres, photos, QR du site, design craie sur ardoise), synchro tablettes, page publique clients |
| `communaute/` | **Communauté** (build 3) : réseau social local pro — feed, fidélité, **gaming avancé** (niveaux, missions, badges, récompenses, classement), messages, offres partenaires, **envoi de client avec réservation auto**, **validation au comptoir** + **consentement** — voir `COMMUNAUTE.md` |
| `carte-de-visite.html` | Carte de visite 85 × 55 mm (recto/verso), charte du site, QR de téléchargement |
| `generer-carte.py`, `recuperer-logo.py` | Régénération de la carte de visite (QR + logo) |
| `qr/` | QR codes livrés (app client, app partenaire, site web, téléchargement APK, carte de visite) + logo |
| `carte-plats-du-jour.pdf` / `.png` | **Carte A4 des plats du jour** (style craie, logo, QR de téléchargement) — à imprimer |
| `ANALYSE_TRATO.md`, `docs/ANALYSE.md` | Analyses de l'APK (rétro-ingénierie) et chemin d'intégration |
| `DIAGNOSTIQUE_CRASH.md` | **Diagnostic du crash au lancement** (cause : patchs byte-à-byte du DEX) et correctif |
| `GUIDE_INSTALLATION.md` | Installation/mise en service de l'APK durci 11.1 |
| `APP_CLIENT_PARTENAIRE.md` | Application client & partenaire (QR, modes, module social) |
| `INFORMATIONS_LEGALES.md` | **Mentions légales / CGV / RGPD officielles** (SIRET, contact, LWS) — affichées sur le site et l'application |
| `FIDELITE_PAIEMENT_PRODUITS.md`, `FACTURATION_ELECTRONIQUE.md`, `MENTIONS_LEGALES_2027.md` | Fonctionnalités et conformité |

## Livrable natif unifié

La version recommandée pour la branche de refonte est **`trato-unifie-1.4-stable.apk`**
(package `com.trattoria.cartes`, versionName `1.4`, versionCode `5`). Elle est
compilée depuis `build/app-src/src/com/trattoria/cartes/`, avec le header natif
premium et le site public intégré dans les assets de la base Gestion 1.3.
La stratégie de fusion et les limites de mise à jour sont décrites dans
[`docs/APK_FUSION_ANALYSIS.md`](docs/APK_FUSION_ANALYSIS.md).

Les APK `trato-12.6-stable.apk`, `trato-12.7-stable.apk` et
`trato-12.8-stable.apk` restent des références de la famille
`com.trattoria.commande` et ne sont pas modifiées. Elles ne sont pas
interchangeables avec le package natif `com.trattoria.cartes`.

## L'application unique

Installer **`trato-unifie-1.4-stable.apk`** pour la nouvelle base native. La
version historique **`trato-11.5-stable.apk`** reste documentée dans
`VERSION_STABLE_11.5.md` : la
tablette sert **toute** l'offre sur le Wi-Fi local du restaurant (port
`8720`) :

| Mode | URL | Contenu |
|---|---|---|
| **Tablette (gestion)** | `http://<tablette>:8720/` | Caisse, commandes, produits, marges, outils |
| **Module carte (intégré)** | `http://<tablette>:8720/?carte` (ou bouton 📋) | Gestion de la carte : 84 produits, photos, marges, cartes du jour, données |
| **App Client** | `http://<tablette>:8720/?client` | Menu, cartes spéciales du jour, **module social** (avis Google/Facebook/Tripadvisor, appeler) |
| **App Partenaire** | `http://<tablette>:8720/?partenaire` | Comme le client + Espace Partenaires (message au restaurant) |
| **Communauté** | `http://<machine>:8721/` | Réseau social local : feed, fidélité, **gaming** (niveaux/missions/badges/récompenses/classement), messages, offres, **envoi de client + réservation auto**, validation & consentement (voir `COMMUNAUTE.md`) |

Le module carte reste aussi disponible en **PWA standalone** (dossier
`carte/`, `serveur_carte.py`) pour la synchronisation multi-tablettes —
données compatibles avec le module intégré (même modèle, export JSON).

### Installer

1. Installer `trato-11.5-stable.apk` sur la tablette (désinstaller toute
   version 11.x avant — clé de signature différente ; voir
   `GUIDE_INSTALLATION.md` et `DIAGNOSTIQUE_CRASH.md` pour l'historique du
   crash au lancement).
2. Lancer l'application : le serveur local démarre sur le port `8720`.
3. Les clients/partenaires scannent le QR `qr/QR-app-client.png` (salle) ou
   `qr/QR-app-partenaire.png` et ajoutent la page à leur écran d'accueil.
4. Le module carte s'ouvre via le bouton 📋 ou `http://<tablette>:8720/?carte`.
5. Le réseau social : `python3 communaute/serveur_communaute.py` sur la machine
   du réseau (port 8721), QR `qr/QR-communaute.png` en salle — voir `COMMUNAUTE.md`.

## Régénérer les éléments imprimables

```bash
# Carte de visite (corriger l'IP de la tablette avant) :
python3 build/carte_visite.py

# QR codes :
python3 build/make_qrcode.py "http://<IP>:8720/?client" qr/QR-app-client.png --label "La Trattoria — Menu & avis"

# Carte A4 des plats du jour : voir les fichiers carte-plats-du-jour.* (prêts à imprimer)
```

> Le dépôt contient désormais la source Java native de la base Gestion dans
> `build/app-src/src/`, le shell public, les assets et le pipeline de
> recompilation. La compilation exige JDK 17 ; voir `build/README_UNIFIED.md`.
> L'ancienne famille `com.trattoria.commande` reste analysée mais n'est pas
> mélangée au DEX final.
