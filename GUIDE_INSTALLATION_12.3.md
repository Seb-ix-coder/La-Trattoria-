# Installer l'application — guide définitif (v12.3)

## ⚠️ La règle d'or : DÉSINSTALLER AVANT

Chaque grande série de versions est signée avec une **clé différente**
(politique du dépôt : aucune clé privée n'est conservée/commitée). Android
**refuse** d'installer par-dessus une version signée avec une autre clé —
message « **Application non installée** » sans autre explication.

| Version installée sur la tablette | Installation de 12.3 |
|---|---|
| **Aucune**, 11.0 (origine), 11.1 → 11.8 | ✅ **installe directement** |
| 11.9, 12.0, 12.1, 12.2 | ✅ **met à jour directement** (même clé) |
| une 11.x déjà désinstallée | ✅ |

> En cas de doute : **désinstallez toujours l'ancienne version d'abord**
> (icône app → appui long → Désinstaller, ou Paramètres → Applications →
> La Trattoria → Désinstaller). Les données de la carte sont conservées
> dans le module (voir ci-dessous).

## Téléchargement (2 formats)

| Fichier | Lien direct | Quand l'utiliser |
|---|---|---|
| `trato-12.3-stable.apk` | https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v12.3-stable/trato-12.3-stable.apk | le format normal |
| `trato-12.3-stable.zip` | https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v12.3-stable/trato-12.3-stable.zip | si le téléchargement .apk échoue ou s'ouvre en erreur : décompresser pour extraire l'APK |

**Vérifier le téléchargement** : le fichier doit faire exactement
**2 170 249 octets** (2,07 Mo).
SHA-256 : `32bf792dc7fc1e785c00dc41a79e327c61def29be145ff592f9cfb1d2ac66525`

⚠️ Ne pas passer par la page GitHub « blob » : utiliser les liens **raw**
ci-dessus (ou la release : https://github.com/Seb-ix-coder/La-Trattoria-/releases/tag/v12.3-stable).

## Installation pas à pas

1. **Désinstaller** toute version existante de La Trattoria (voir ci-dessus).
2. Télécharger l'APK sur la tablette (lien raw ci-dessus).
3. Ouvrir le fichier téléchargé (notification ou application **Fichiers** →
   Dossiers → Download).
4. Si Android demande « Autoriser l'installation d'applications inconnues »
   pour le navigateur/l'application Fichiers : **Autoriser** (une fois).
5. Toucher **Installer** → **Ouvrir**.

## Tableau des erreurs

| Message Android | Cause | Solution |
|---|---|---|
| **Application non installée** | version précédente signée avec une autre clé encore installée | désinstaller l'ancienne version puis réinstaller |
| **Application non installée** (après désinstallation) | fichier incomplet/corrompu | retélécharger (vérifier la taille : 2 170 249 octets) ; ou prendre le `.zip` |
| **Impossible d'ouvrir le fichier** | téléchargement reçu en HTML (page GitHub au lieu du fichier) | utiliser le lien **raw** ci-dessus |
| **Blocs de analyse/scan** (Play Protect) | APK hors Play Store | « Installer quand même » / « Plus de détails » → installation |
| Rien ne se passe au lancement (ancien problème 11.x) | corrigé depuis la 11.5 | utiliser la 12.3 — le moteur est celui de l'original, vérifié à chaque build |

## Après l'installation

1. **Lancer La Trattoria** (le serveur local démarre sur le port 8720).
2. **Éditer les cartes** — trois points d'entrée :
   - **panneau « ✏️ Éditer les cartes »** en haut de l'écran d'accueil
     (6 tuiles : carte standard, formules, vins, glaces, bières, ardoise & QR) ;
   - **onglet « ✏️ Cartes »** en tête du menu de navigation ;
   - **icône « Éditer les cartes »** sur l'écran d'accueil Android :
     Chrome → `127.0.0.1:8720/?carte` → menu ⋮ → « Ajouter à l'écran
     d'accueil » (voir `GUIDE_EDITION_TABLETTE.md`).

> ℹ️ **Pourquoi l'édition n'est pas dans le menu natif « Cartes »** : ce menu
> est un écran **compilé** dans le moteur de l'application (`classes.dex`).
> Le modifier sans recompiler les sources provoque un crash silencieux au
> lancement — c'est exactement la cause des versions 11.1→11.4 cassées
> (`DIAGNOSTIQUE_CRASH.md`). Le moteur de la 12.3 est donc **identique à
> l'original, octet par octet** (vérifié automatiquement à chaque build), et
> toutes les fonctions d'édition vivent dans la couche web, sans aucun risque.

## Données de la carte

L'édition vit dans le **module carte** (localStorage de la page d'édition +
serveur de synchronisation optionnel `carte/serveur_carte.py`). Désinstaller
l'APK ne supprime pas les données du module autonome ; en revanche, pensez à
**exporter la carte (JSON)** depuis l'écran **Données** avant de changer de
tablette. Voir `carte/README.md`.
