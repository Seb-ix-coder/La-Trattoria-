# Build et signature de l'APK durci « La Trattoria » 11.1

Ce dossier contient l'outillage **reproductible** qui produit l'APK durci
`trato-11.1-durci.apk` (versionCode 16) à partir de l'APK d'origine
`trato.apk` (versionCode 15), en appliquant les correctifs de sécurité du
rapport `ANALYSE_TRATO.md`, puis en signant avec votre clé.

## Correctifs appliqués au build 11.1

| # | Correctif | Référence | Où |
|---|-----------|-----------|-----|
| P1 | `allowBackup=false` (fin de l'exfiltration par sauvegarde) | C5 | `patch_axml.py` |
| P2 | Timeout des sockets du serveur local 8000 → 2000 ms (mitigation du DoS mono-thread) | C3 | `patch_dex.py` |
| P3 | Prix de revient (`cout`) retiré de la route non authentifiée `/carte` | C2 | `patch_dex.py` |
| P4 | Commande en ligne réparée (découverte automatique de l'API locale) | B1 | `patch_assets.py` |
| P5 | versionCode 15→16, versionName 11.0→11.1 (nouvelle clé, nouveau build) | — | `patch_axml.py` |
| P6 | **Générateur de QR code intégré à l'application** : encodeur QR autonome (ISO/IEC 18004, niveau H, validé contre la référence) + interface tactile (bouton flottant, plein écran, ouverture auto sur `/qr`) | — | `patch_assets.py` + `qr_addon.js` / `qr_addon.css` |

> **Limites assumées de ce build (sans les sources) :** le serveur HTTP reste
> mono-thread (P2 n'est qu'une mitigation), les données au repos ne sont pas
> chiffrées (C4) et le trafic local reste en clair (C1) — ces trois points
> nécessitent une recompilation depuis les sources (voir « Évolution » plus
> bas). Les correctifs structurels (thread par connexion, chiffrement
> EncryptedSharedPreferences, HTTPS local) sont documentés dans le rapport.

## Arborescence

```
build/
├── patch_axml.py        # manifeste : allowBackup, versionCode, versionName
├── patch_dex.py         # DEX : timeout, suppression du "cout" de /carte
├── patch_assets.py      # site.js : API locale + addon QR ; site.css : styles QR
├── qr_addon.js          # encodeur QR (validé) + interface tactile
├── qr_addon.css         # styles de l'interface QR (petits écrans)
├── build_apk.py         # reconstruction ZIP déterministe (tout en DEFLATED)
├── sign_v1.py           # signature JAR (v1) — CMS sans attributs, comme Android
├── sign_v2.py           # signature APK Signature Scheme v2
├── verify_apk.py        # batterie de vérifications indépendantes
├── export_e_reporting.py # export e-reporting (CSV/XML) depuis l'API tablette
├── facturx_archivage.py  # contrôle + archivage des factures Factur-X reçues
├── surgical_resign.py    # re-signature d'un APK sans toucher aux octets ZIP
├── resign.py             # reconstruction + signature en préservant le ZIP
├── generate_keystore.py # génération du keystore PKCS#12 (local uniquement)
├── run_build.sh         # orchestration complète du build
└── requirements.txt     # dépendances Python (cryptography, asn1crypto, androguard)
```

## Utilisation locale

```bash
# 1. dépendances
pip install -r build/requirements.txt

# 2. build complet (génère le keystore au premier lancement si absent)
bash build/run_build.sh
#    → build/out/trato-11.1-durci.apk
#    → ~/trattoria-keystore/trattoria-release.p12 (+ mot de passe à côté)

# ou avec un keystore existant :
bash build/run_build.sh /chemin/trattoria-release.p12 "MOT_DE_PASSE"
```

Le script affiche les vérifications finales : manifeste, DEX, site.js,
signature v1 (vérifiée en interne **et** par `keytool`), signature v2
(vérifiée en interne **et** par l'outil indépendant `apksigtool`).

## Pipeline GitHub Actions (mises à jour automatiques)

Le workflow `.github/workflows/build-and-sign.yml` reconstruit et signe
l'APK à chaque tag `v*`, puis publie une Release avec l'APK en pièce
jointe.

Configuration unique (2 minutes) :

1. Dans GitHub → votre dépôt → **Settings → Secrets and variables →
   Actions**, créez les secrets :
   - `KEYSTORE_BASE64` : le keystore encodé en base64 (une seule ligne) :
     ```bash
     base64 -w0 ~/trattoria-keystore/trattoria-release.p12
     ```
   - `KEYSTORE_PASSWORD` : le mot de passe (cf. `README-KEYSTORE.txt`).
2. Poussez un tag pour déclencher le build :
   ```bash
   git tag v11.1.0 && git push origin v11.1.0
   ```
   (ou utilisez le bouton **Run workflow** pour un simple artifact).

## Signer une MISE À JOUR (après modification de l'APK source)

Le keystore est l'identité de l'application : **toute mise à jour doit être
signée avec la même clé**, sinon Android refuse l'installation par-dessus
l'ancienne version.

1. Remplacez `trato.apk` à la racine du dépôt par le nouvel APK.
2. Relancez `bash build/run_build.sh` (ou le pipeline) — les correctifs
   P1-P5 sont ré-appliqués automatiquement.
3. Vérifiez la sortie de `verify_apk.py` (doit se terminer par
   « TOUTES LES VÉRIFICATIONS SONT PASSÉES »).
4. Installez sur une tablette de test, puis diffusez.

## Sécurité du keystore — règles impératives

* Ne **jamais** committer le keystore ni le mot de passe (le `.gitignore`
  exclut `build/out/`, `build/work/` et tout fichier `*.p12`/`*.jks`).
* Conserver au moins 2 sauvegardes chiffrées (coffre, gestionnaire de
  secrets, clé USB scellée).
* Ne partager le keystore qu'avec les personnes autorisées à publier des
  mises à jour.
* Si le keystore est perdu : les tablettes devront être désinstallées puis
  réinstallées (perte des données locales de l'application).

## Évolution recommandée (correctifs structurels, nécessitent les sources)

Ces correctifs ne sont PAS réalisables par patch binaire et supposent de
retrouver/refaire le projet Gradle :

1. **Serveur multi-threads** : remplacer la boucle `accept()` synchrone de
   `Reseau$2.run()` par un pool de threads (8–16) — élimine le DoS par
   connexions lentes (C3).
2. **Chiffrement au repos** : `EncryptedSharedPreferences` (AndroidX
   Security) pour les données sensibles (NIR, pièces d'identité,
   signatures, clé Hiboutik) et chiffrement du dossier `justificatifs/`
   (C4).
3. **HTTPS local** : servir le site et l'API en HTTPS (certificat auto-signé
   généré par la tablette, ou proxy) — protège les données clients sur le
   WiFi (C1).
4. **Authentification des routes de synchro** : exiger la clé API sur
   `/carte`, `/tickets`, `/stock`, `/commande` (les satellites la
   recevraient au couplage) (C2).
5. **`SecureRandom`** pour la clé API et les codes de retrait (M2).
6. **Anti-CSRF** sur les POST `/site/*` (vérification `Origin`) (M3).

Le présent outillage de build restera compatible : il suffira de remplacer
`trato.apk` par l'APK compilé depuis les sources, les correctifs P1-P5
s'appliquant de la même façon (et les nouveaux correctifs seront ajoutés
aux scripts au fil de l'eau).
