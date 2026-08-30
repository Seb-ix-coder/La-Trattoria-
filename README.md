# La Trattoria

> **Avis de livraison P0 — 30 août 2026 :** les APK historiques et l'ancienne
> clé de signature ne sont pas approuvés pour une nouvelle diffusion. Le
> keystore a été retiré de l'arbre courant après exposition ; générer une
> nouvelle identité hors dépôt et réinstaller la première version signée avec
> celle-ci. Voir `build/KEYSTORE_ROTATION.md`.

Projet unique du restaurant **La Trattoria** (Saintes, 17100) : application de
gestion, module de carte du jour, application client/partenaire avec module
social, cartes imprimables. **Tout le projet vit dans cette branche.**

## Contenu du dépôt

| Élément | Description |
|---|---|
| `trato.apk` | Application Android v11.0 (`com.trattoria.commande`) — artefact d'origine (moteur DEX de référence) |
| `trato-11.5-stable.apk` | Archive historique inspectée (versionCode 20) : moteur DEX 11.0 intact et couche web ; **non approuvée pour une nouvelle diffusion tant qu'elle n'est pas re-signée avec la nouvelle clé** |
| `trato-11.4.apk` | Build 11.4 corrigé (versionCode 19) : première APK sans patch DEX (branche parallèle) |
| `trato-11.4-stable.apk` | ⚠️ build 11.4 avec DEX patché — **provoquait le crash au lancement**, retirée du dépôt (voir `DIAGNOSTIQUE_CRASH.md`) |
| `trato-12.6-stable.apk` | Archive historique versionCode 31 ; **à ne pas diffuser** avant rotation de signature et validation sur appareil |
| `trato-13.0-stable.apk` | Candidat généré le 30/08/2026 (versionCode 32), DEX intact, manifeste durci, module carte intégré ; signature de validation hors dépôt — **reconstruire avec le keystore client avant production** |
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

## L'application unique

Après rotation de la signature et validation sur appareil, produire puis
installer l'APK générée par `build/run_build_stable.sh` : la tablette sert **toute** l'offre sur le Wi-Fi local du restaurant (port
`8720`) :

| Mode | URL | Contenu |
|---|---|---|
| **Tablette (gestion)** | `http://<tablette>:8720/` | Caisse, commandes, produits, marges, outils |
| **Module carte (intégré)** | `http://<tablette>:8720/?carte` (ou bouton 📋) | Gestion de la carte : 84 produits, photos, marges, cartes du jour, données |
| **App Client** | `http://<tablette>:8720/?client` | Menu, cartes spéciales du jour, **module social** (avis Google/Facebook/Tripadvisor, appeler) |
| **App Partenaire** | `http://<tablette>:8720/?partenaire` | Comme le client + Espace Partenaires (message au restaurant) |
| **Communauté** | `http://<machine>:8721/` | Réseau social local : feed, fidélité, **gaming** (niveaux/missions/badges/récompenses/classement), messages, offres, **envoi de client + réservation auto**, validation & consentement (voir `COMMUNAUTE.md`) |

Le module carte reste aussi disponible en **PWA standalone** (dossier
`carte/`, `serveur_carte.py`) pour la synchronisation multi-tablettes. Les
exports JSON acceptent désormais les deux noms de catalogue (`produits` et
`carte`) ; les structures de cartes du jour restent propres à chaque module et
doivent être vérifiées après import.

### Installer

1. Générer une nouvelle clé puis produire l'APK ; désinstaller l'archive
   historique avant la première installation signée avec cette nouvelle clé
   (voir `build/KEYSTORE_ROTATION.md`).
2. Lancer l'application : le serveur local démarre sur le port `8720`.
3. Les clients/partenaires scannent le QR `qr/QR-app-client.png` (salle) ou
   `qr/QR-app-partenaire.png` et ajoutent la page à leur écran d'accueil.
4. Le module carte s'ouvre via le bouton 📋 ou `http://<tablette>:8720/?carte`.
5. Le réseau social : définir `TRATTORIA_STAFF_PHONE` et
   `TRATTORIA_STAFF_PASSWORD` hors dépôt, puis lancer
   `python3 communaute/serveur_communaute.py` sur la machine du réseau
   (port 8721), QR `qr/QR-communaute.png` en salle — voir `COMMUNAUTE.md`.

## Régénérer les éléments imprimables

```bash
# Carte de visite (corriger l'IP de la tablette avant) :
python3 build/carte_visite.py

# QR codes :
python3 build/make_qrcode.py "http://<IP>:8720/?client" qr/QR-app-client.png --label "La Trattoria — Menu & avis"

# Carte A4 des plats du jour : voir les fichiers carte-plats-du-jour.* (prêts à imprimer)
```

> ⚠️ Le dépôt ne contient pas le **code source** de l'application Android ;
> l'intégration s'appuie sur l'outillage `build/` (patch + signature) —
> voir `build/README.md` et `docs/ANALYSE.md`.
