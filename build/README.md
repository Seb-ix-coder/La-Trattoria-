# Build et livraison Android — La Trattoria

Ce dossier contient l'outillage de reconstruction des APK à partir de
l'artefact Android d'origine `trato.apk`. Le dépôt ne contient pas les sources
complètes de `com.trattoria.commande` : le pipeline peut remplacer le manifeste
et les assets web, mais ne remplace pas une vraie reconstruction Gradle du
moteur natif.

## État de sécurité

Les anciens fichiers de signature ont été retirés de Git. L'ancienne clé doit
être considérée comme compromise : elle ne doit plus signer de version diffusée.
Voir [`KEYSTORE_ROTATION.md`](KEYSTORE_ROTATION.md) avant tout nouveau build.
Les scripts refusent un keystore placé dans le dépôt, notamment sous
`build/keystore/`.

## Outils principaux

- `patch_axml.py` : manifeste et versions ;
- `patch_assets.py`, `integrer_carte.py` : assets web et module carte ;
- `resign.py`, `sign_v1.py`, `sign_v2.py` : reconstruction et signatures ;
- `verify_apk.py`, `verify_unifie.py` : contrôles indépendants ;
- `generate_keystore.py` : génération locale d'un nouveau keystore ;
- `run_build.sh` : build durci ;
- `run_build_stable.sh` : build durci + intégration carte + vérifications ;
- `app-src/` : sources de l'application distincte `com.trattoria.cartes`.

## Build local

Dépendances :

```bash
pip install -r build/requirements.txt
```

Les secrets doivent venir d'un coffre ou de variables d'environnement :

```bash
export KEYSTORE_PATH="$HOME/.secrets/la-trattoria-keystore/trattoria-release.p12"
export KEYSTORE_PASSWORD="$(secret-tool lookup service la-trattoria-android)"
./build/run_build_stable.sh --version-name=13.0 --version-code=32
```

Sans `KEYSTORE_PATH`, le script peut générer un keystore dans
`$HOME/trattoria-keystore`, jamais dans le dépôt ; le mot de passe généré n'est
pas écrit sur disque. `run_build.sh` accepte éventuellement le chemin du
keystore comme unique argument, mais le mot de passe doit toujours venir de
`KEYSTORE_PASSWORD` ou du mot de passe généré à usage unique.

Le résultat et le SHA-256 sont affichés à la fin du pipeline. Le pipeline a
produit dans ce dépôt un candidat `trato-13.0-stable.apk` (versionCode 32),
avec le DEX intact et les vérifications internes v1/v2 passées. Il est signé
avec une clé de validation générée hors dépôt pour cette exécution : pour une
production client, le reconstruire avec le keystore sauvegardé du client.
Empreinte SHA-256 du candidat actuel :
`869d39adf5d0e025429db15c3fe21384a3c3ad686a4ce25e6f2c3372c2e94834`.
Une validation Android sur appareil réel reste obligatoire avant diffusion ;
`apksigner`/`zipalign` ne sont pas disponibles sur cet hôte.

## CI GitHub

Aucun workflow GitHub Actions n'est actuellement présent dans ce dépôt. Si un
mainteneur ajoute un workflow, il doit charger exclusivement
`KEYSTORE_BASE64` et `KEYSTORE_PASSWORD` depuis les secrets GitHub, écrire le
keystore dans un fichier temporaire hors du dépôt, puis le supprimer en fin de
job. Ne pas recréer un fichier de mot de passe versionné.

## Application native de gestion `com.trattoria.cartes`

Les sources de cette application sont sous `app-src/src/`. Elle utilise un
serveur de commandes local sur le port 8721. Les commandes reçues sont
maintenant limitées, vérifiées contre le catalogue et recalculées côté serveur
avant leur enregistrement. La compilation/signature dépend toutefois de la
chaîne Android non fournie par cet hôte.

## Limites à ne pas masquer

- l'APK principal `com.trattoria.commande` reste un artefact sans code source ;
- le réseau local historique est en HTTP : ne pas exposer les ports à Internet ;
- les données locales de gestion ne sont pas un coffre-fort chiffré ;
- la première version signée avec une nouvelle clé nécessitera une
  désinstallation de l'ancienne application Android ;
- les fichiers APK historiques et leurs tags doivent être retirés ou marqués
  comme révoqués après rotation.
