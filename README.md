# La Trattoria

Projet unique du restaurant **La Trattoria** (Saintes, 17100) : application de
gestion, module de carte du jour, application client/partenaire avec module
social, cartes imprimables. **Tout le projet vit dans cette branche.**

## Contenu du dépôt

| Élément | Description |
|---|---|
| `trato.apk` | Application Android v11.0 (`com.trattoria.commande`) — artefact d'origine |
| `trato-11.1-durci.apk` | **APK durci v11.1** (versionCode 16, signé v1+v2) : correctifs sécurité + QR intégré + outils de conformité + pourboire + paiement/fidélité |
| `trato-11.1-temoin.apk`, `trato-temoin-chirurgical.apk` | Variantes témoins du build 11.1 |
| `build/` | Outillage reproductible du build APK (patch AXML/DEX/assets, signature v1/v2, vérifications) |
| `build/mode_app.js` / `mode_app.css` | **Module social** + modes client/partenaire (barre sociale : avis Google/Facebook/Tripadvisor, appeler ; espace partenaires) |
| `carte/` | **Gestion de la carte** (PWA autonome et hors ligne) : produits, photos, marges, cartes du jour, synchro tablettes, page publique clients |
| `carte-de-visite.html` | Carte de visite 85 × 55 mm (recto/verso), charte du site, QR de téléchargement |
| `generer-carte.py`, `recuperer-logo.py` | Régénération de la carte de visite (QR + logo) |
| `qr/` | QR codes livrés (app client, app partenaire, site web, téléchargement APK, carte de visite) + logo |
| `carte-plats-du-jour.pdf` / `.png` | **Carte A4 des plats du jour** (style craie, logo, QR de téléchargement) — à imprimer |
| `ANALYSE_TRATO.md`, `docs/ANALYSE.md` | Analyses de l'APK (rétro-ingénierie) et chemin d'intégration |
| `GUIDE_INSTALLATION.md` | Installation/mise en service de l'APK durci 11.1 |
| `APP_CLIENT_PARTENAIRE.md` | Application client & partenaire (QR, modes, module social) |
| `FIDELITE_PAIEMENT_PRODUITS.md`, `FACTURATION_ELECTRONIQUE.md`, `MENTIONS_LEGALES_2027.md` | Fonctionnalités et conformité |

## L'application unique

L'application La Trattoria sert elle-même ses pages sur le Wi-Fi local du
restaurant (port `8720`) :

| Mode | URL | Contenu |
|---|---|---|
| **Tablette (gestion)** | `http://<tablette>:8720/` | Caisse, commandes, produits, marges, outils, module de carte |
| **App Client** | `http://<tablette>:8720/?client` | Menu, cartes spéciales du jour, **module social** (avis Google/Facebook/Tripadvisor, appeler) |
| **App Partenaire** | `http://<tablette>:8720/?partenaire` | Comme le client + Espace Partenaires (message au restaurant) |
| **Module carte (PWA)** | `http://<tablette>:8720/carte/` | Gestion de la carte du jour installable (hors ligne) |

### Installer

1. Installer `trato-11.1-durci.apk` sur la tablette (désinstaller la 11.0 avant —
   voir `GUIDE_INSTALLATION.md` pour la clé de signature).
2. Lancer l'application : le serveur local démarre sur le port `8720`.
3. Les clients/partenaires scannent le QR `qr/QR-app-client.png` (salle) ou
   `qr/QR-app-partenaire.png` et ajoutent la page à leur écran d'accueil.
4. Le module carte est disponible sur `http://<tablette>:8720/carte/`
   (installable comme une application, fonctionne hors ligne).

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
