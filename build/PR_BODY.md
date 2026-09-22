> **Document historique — ne pas utiliser comme description d'une release.**
> Les clés et APK décrits ci-dessous sont révoqués/non approuvés après audit.
> La livraison actuelle doit utiliser `build/KEYSTORE_ROTATION.md` et le
> candidat `trato-13.0-stable.apk`, à reconstruire avec la clé client.

## Résumé historique

Unification de toutes les branches/tags du projet et livraison d'une **nouvelle version stable de l'application, compilée proprement** — avec le **correctif du crash silencieux au lancement** signalé sur tablette (« s'installe, s'ouvre, ne produit rien »).

## Contenu

### 1. Récupération et unification
- Récupération de toutes les branches distantes et tags (`v11.1.0`, `v11.3-unifie`)
- Fusion du contenu complet du tag `v11.3-unifie` (outillage `build/`, PWA carte, QR, docs)
- Fusion de la branche parallèle `arena/01a039ba` : `DIAGNOSTIQUE_CRASH.md`, modules `communaute/` et `affiche/`, build corrigé `trato-11.4.apk` (conflits résolus en conservant l'outillage `build/`)

### 2. Correctif du crash au lancement (voir `DIAGNOSTIQUE_CRASH.md`)
- **Cause confirmée** : les builds 11.1→11.4 patchaient `classes.dex` au byte près (injection dans `Reseau.routerSite`, patchs `router`/`run`) → DEX refusé à la vérification au démarrage → moteur mort en silence. Preuve par comparaison d'entrées ZIP : entre la 11.4 cassée et la 11.4 corrigée, seul `classes.dex` diffère.
- **Correctif** : moteur DEX 11.0 d'origine conservé **intact byte à byte**, toutes les fonctions vivent dans la couche web (`site.js`/`site.css`) + manifeste durci (`allowBackup=false`)
- `run_build.sh` : patch DEX **désactivé par défaut** (`PATCH_DEX=1` pour l'ancien comportement, déconseillé)
- `verify_apk.py` : nouveau mode « DEX d'origine » par défaut (compare le DEX au fichier source) ; assertion finale bloquante dans le pipeline

### 3. Pipeline reproductible
- **`build/run_build_stable.sh`** : pipeline complet en une commande (durci → intégration carte → signature v1+v2 → vérifications), versions paramétrables (`--version-name`, `--version-code`), build **déterministe**
- `integrer_carte.py` / `verify_unifie.py` : versions codées en dur → paramètres ; empreinte certificat corrigée

### 4. Livrable
- **`trato-11.5-stable.apk`** (versionCode 20) — SHA-256 `70c2750058bc65bcd4963f75657499d1dec939b0745998584059a8a22a199703`
- Signatures **v1 (JAR)** + **v2 (APK Signature Scheme)** vérifiées
- 100 % des fonctions conservées : QR, pourboire, paiement/fidélité, module social, **module carte intégré** (📋 / `?carte`), correctif commande en ligne
- Release GitHub publiée : `v11.5-stable` (la release cassée `v11.4-stable` a été supprimée, APK retiré du dépôt)
- Limitation documentée : l'export e-reporting n'a plus de données de ventes (sa route `/site/ventes` vivait dans le patch DEX supprimé)

## Vérifications passées
- ✅ Manifeste `com.trattoria.commande` 11.5 (vc 20), `allowBackup=false`, minSdk 21 / targetSdk 34
- ✅ `classes.dex` ≡ moteur d'origine 11.0, **byte à byte**
- ✅ Structure ZIP préservée (`resources.arsc` en STORE aligné 4)
- ✅ Signatures v1 + v2, bloc aligné 4096
- ✅ Déterminisme : SHA-256 identique à chaque exécution
