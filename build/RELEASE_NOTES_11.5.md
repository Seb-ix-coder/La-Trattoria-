## 🛠️ Correctif du crash au lancement — version stable recommandée : `trato-11.5-stable.apk` (versionCode 20)

**Cette version remplace la 11.4-stable (retirée)** qui s'installait,
s'ouvrait puis **ne produisait rien** (crash silencieux).

### Cause du crash (voir `DIAGNOSTIQUE_CRASH.md`)
Les builds 11.1 → 11.4 patchaient le **moteur de l'application
(`classes.dex`) au byte près** — dont une injection de code dans
`Reseau.routerSite`. Un DEX patché sans recompilation échoue à la
vérification au démarrage : APK valide à l'installation, moteur mort au
lancement.

### Correctif
- **Moteur DEX d'origine 11.0 conservé INTACT** (byte à byte, vérifié à
  chaque build) — c'est le moteur qui fonctionne sur la tablette ;
- **100 % des fonctions conservées** : elles vivent dans la couche web
  (`site.js`/`site.css`) — QR, pourboire, paiement/fidélité, module social
  (client/partenaire), **module carte intégré** (📋 / `?carte`), manifeste
  durci (`allowBackup=false`) ;
- Pipeline reproductible : `build/run_build_stable.sh` (zéro patch DEX par
  défaut, versions paramétrables, build déterministe).

### Vérifications passées
- ✅ Manifeste : `com.trattoria.commande` **11.5 (vc 20)**, `allowBackup=false`, minSdk 21 / targetSdk 34
- ✅ **`classes.dex` ≡ moteur d'origine 11.0, byte à byte** — la cause du crash est éliminée
- ✅ Signature **v1 (JAR)** et **v2 (APK Signature Scheme)** vérifiées
- ✅ Build déterministe (SHA-256 identique à chaque exécution)

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `70c2750058bc65bcd4963f75657499d1dec939b0745998584059a8a22a199703` |
| Certificat | CN=La Trattoria, OU=Restaurant, O=La Trattoria, L=Saintes, C=FR |
| SHA-256 certificat | `e63be1f661d852c42cdd70016fe0e43d83b2012ce2e3fadac61d3c860c117a30` |

### Installation
> ⚠️ **Désinstaller toute version 11.x avant** (clé de signature différente à
> chaque release — voir `GUIDE_INSTALLATION.md`).

**Télécharger l'APK** : fichier `trato-11.5-stable.apk` à la **racine du
dépôt** (tag `v11.5-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v11.5-stable/trato-11.5-stable.apk

1. Copier `trato-11.5-stable.apk` sur la tablette et l'installer
2. Lancer l'app : serveur local sur le port `8720`
3. Carte : bouton 📋 ou `?carte` — Clients : `qr/QR-app-client.png` —
   Partenaires : `qr/QR-app-partenaire.png`

### Limitation connue
- L'export **e-reporting** (`#ereporting`) n'a plus de données de ventes :
  sa route `/site/ventes` vivait dans le patch DEX (supprimé avec lui).
  Les autres outils (Factur-X, registre) restent fonctionnels. Restauration
  prévue via le serveur local, sans patch DEX.

### Reproduire
```bash
pip install -r build/requirements.txt
./build/run_build_stable.sh                 # → 11.5
./build/run_build_stable.sh --version-name=11.6 --version-code=21
```
