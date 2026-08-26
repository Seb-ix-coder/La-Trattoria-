# Version stable 11.5 — moteur d'origine intact, crash corrigé

**`trato-11.5-stable.apk`** (versionCode 20) est la version stable qui corrige
le **crash silencieux au lancement** des builds 11.1 à 11.4.

## Le crash et sa cause

**Symptôme** : l'APK s'installe, s'ouvre, puis ne produit rien (fermeture
silencieuse / écran vide).

**Cause** (voir `DIAGNOSTIQUE_CRASH.md`) : les builds « durci » 11.1/11.2/11.3
et la 11.4-stable modifiaient le **moteur de l'application (`classes.dex`)
au byte près** — notamment une **injection de code dans
`Reseau.routerSite`** (appel `ApiPublique.ventes`). Un DEX ainsi patché sans
recompilation est refusé/échoue à la vérification au démarrage : l'APK est
valide à l'installation mais le moteur plante au lancement.

**Correctif** : conserver le **moteur DEX d'origine 11.0, intact byte par
byte** (c'est le moteur qui fonctionne), et porter toutes les fonctions dans
la **couche web** (`assets/site.js` + `site.css`), qui n'est pas affectée :

- QR intégré, outils de conformité (e-reporting*, Factur-X), pourboire,
  paiement/fidélité, module social (client/partenaire), module carte intégré
  (bouton 📋 / `?carte`), correctif « commande en ligne » (découverte API).
- \* e-reporting : la route locale `/site/ventes` vivait dans le patch DEX
  (supprimé) — l'outil s'ouvre mais n'a plus de données de ventes. Limitation
  acceptée au profit de la stabilité ; sera restaurée via une évolution du
  serveur local, sans patch DEX.

## Ce qui est vérifié à chaque build (`build/run_build_stable.sh`)

| # | Vérification | Résultat |
|---|---|---|
| 1 | Manifeste | `com.trattoria.commande`, **11.5 (vc 20)**, `allowBackup=false`, minSdk 21, targetSdk 34 |
| 2 | **DEX final ≡ moteur d'origine 11.0** | **byte à byte** — la cause du crash est structurellement éliminée |
| 3 | site.js / site.css | QR + conformité + pourboire + paiement + modes App + module social + bundle carte (410 Ko) |
| 4 | Structure ZIP | entrées identiques à l'original, `resources.arsc` en STORE aligné 4 |
| 5 | Signature v1 (JAR) + v2 (APK Signature Scheme) | vérifiées, bloc aligné 4096 |
| 6 | Déterminisme | SHA-256 identique à chaque exécution du pipeline |

## Empreintes (build du 26/08/2026)

| Élément | Valeur |
|---|---|
| APK | `trato-11.5-stable.apk` (1,81 Mo) |
| SHA-256 APK | `70c2750058bc65bcd4963f75657499d1dec939b0745998584059a8a22a199703` |
| Certificat | CN=La Trattoria, OU=Restaurant, O=La Trattoria, L=Saintes, C=FR |
| SHA-256 certificat | `e63be1f661d852c42cdd70016fe0e43d83b2012ce2e3fadac61d3c860c117a30` |
| Signatures | v1 (JAR) **et** v2 (APK Signature Scheme) |

## Installation

> ⚠️ **Désinstaller d'abord toute version 11.x** (11.0/11.1/11.3/11.4…).
> Chaque release est signée avec un keystore local éphémère (jamais commité) :
> Android refuse la mise à jour si la clé change — voir
> `GUIDE_INSTALLATION.md`.

1. Copier `trato-11.5-stable.apk` sur la tablette et l'installer.
2. Lancer l'application : le serveur local démarre sur le port `8720`
   (caisse, commandes, produits, marges, outils).
3. `?carte` ou bouton 📋 : gestion de la carte. `?client` / `?partenaire` :
   apps client et partenaire (QR `qr/QR-app-client.png`,
   `qr/QR-app-partenaire.png`).

## En cas de problème

Si jamais un crash se reproduisait malgré le moteur d'origine, récupérer le
log : `adb logcat -b crash -d > crash.txt` (voir la marche à suivre dans
`DIAGNOSTIQUE_CRASH.md`) — la ligne `Caused by:` donne la cause exacte.

## Reproduire

```bash
pip install -r build/requirements.txt
./build/run_build_stable.sh                                  # → 11.5
./build/run_build_stable.sh --version-name=11.6 --version-code=21   # version suivante
```

Historique des versions : 11.0 (origine, moteur de référence) → 11.1/11.2/11.3
et 11.4-stable (⚠️ DEX patché, crash au lancement, retirées) → **11.5-stable
(cette version, moteur intact)**. Le build intermédiaire corrigé
`trato-11.4.apk` (vc 19) est conservé dans le dépôt.
