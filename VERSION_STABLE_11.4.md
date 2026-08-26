# Version stable 11.4 — « unifiée, compilée proprement »

**`trato-11.4-stable.apk`** (versionCode 19) est la première version produite
entièrement par le pipeline reproductible `build/run_build_stable.sh`,
en une seule commande, avec vérifications automatiques à chaque étape.

## Ce qui change par rapport à la 11.3

| | 11.3-unifie (précédente) | **11.4-stable (nouvelle)** |
|---|---|---|
| Build | scripts enchaînés à la main, versions codées en dur | **un seul pipeline** `run_build_stable.sh`, versions en options |
| Version | 11.3 / versionCode 18 | **11.4 / versionCode 19** |
| Reproductibilité | non mesurée | **SHA-256 identique à chaque exécution** (build déterministe) |
| Vérifications | manuelles | **automatiques** (manifeste, DEX, ZIP, signatures v1+v2, empreintes) |

Aucun changement fonctionnel : cette version fige et fiabilise le build.
Elle contient tout le 11.3 :

- application tablette (caisse, commandes, produits, marges, outils) — port 8720 ;
- correctifs de sécurité du rapport `ANALYSE_TRATO.md` (`allowBackup=false`,
  timeout sockets 2000 ms, prix de revient retiré de `/carte`) ;
- **module carte intégré** : bouton 📋 ou `/?carte` (84 produits, photos,
  marges, cartes du jour) ;
- module social / modes client & partenaire (`?client`, `?partenaire`) ;
- QR intégré, outils de conformité (e-reporting, Factur-X), pourboire,
  paiement + fidélité.

## Résumé du pipeline

```
trato.apk (11.0, vc 15)
   │  run_build.sh            patchs AXML (allowBackup, versions)
   │                          patchs DEX (timeout, /carte sans cout, /site/ventes)
   │                          patchs assets (API locale, QR, conformité,
   │                                    pourboire, paiement, modes App)
   ▼
build/out/trato-11.1-durci.apk (vc 17)  ← vérifié (verify_apk.py)
   │  integrer_carte.py       module carte/ assemblé en HTML autonome,
   │                          addon JS (iframe blob:, bouton 📋)
   ▼
trato-11.4-stable.apk (vc 19)           ← vérifié (verify_unifie.py)
```

## Empreintes (build du 26/08/2026)

| Élément | Valeur |
|---|---|
| APK | `trato-11.4-stable.apk` (1,80 Mo) |
| SHA-256 APK | `04b70dbb56143b6e8b81ce559ca1b479d9886f20048c7a9d212206e5420f6ffc` |
| Certificat | CN=La Trattoria, OU=Restaurant, O=La Trattoria, L=Saintes, C=FR |
| SHA-256 certificat | `e8d5cc0d082951a1690637f08780e7aca80519e1471defea5a08f91ff414d981` |
| Signatures | v1 (JAR) **et** v2 (APK Signature Scheme), bloc aligné 4096 |

## Installation

> ⚠️ **Désinstaller d'abord toute version 11.x précédente** : chaque release
> est signée avec un keystore local éphémère (politique du dépôt : aucune clé
> jamais commitée). Android refuse la mise à jour si la clé change —
> voir `GUIDE_INSTALLATION.md`.

1. Copier `trato-11.4-stable.apk` sur la tablette et l'installer.
2. Lancer l'application : le serveur local démarre sur le port `8720`.
3. Les clients scannent `qr/QR-app-client.png`, les partenaires
   `qr/QR-app-partenaire.png`.

## Reproduire ce build

```bash
pip install -r build/requirements.txt
./build/run_build_stable.sh
# → trato-11.4-stable.apk, toutes vérifications vertes

# version suivante :
./build/run_build_stable.sh --version-name=11.5 --version-code=20
```

Le build est déterministe : exécuter deux fois le pipeline produit deux
APK de SHA-256 identique (dates ZIP figées, keystore stable localement).
