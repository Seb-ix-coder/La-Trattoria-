## ⭐ Version stable recommandée : `trato-11.4-stable.apk` (versionCode 19)

Première version produite **entièrement par le pipeline reproductible**
`build/run_build_stable.sh` — une commande, vérifications automatiques,
build déterministe.

### Contenu (tout le 11.3, rien de fonctionnel ne change)
- Application tablette : caisse, commandes, produits, marges, outils (port 8720)
- Correctifs de sécurité : `allowBackup=false`, timeout sockets 2000 ms, prix de revient retiré de `/carte`
- **Module carte intégré** : bouton 📋 ou `/?carte` (84 produits, photos, marges, cartes du jour)
- Modes client/partenaire + module social (avis Google/Facebook/Tripadvisor, appeler)
- QR intégré, outils de conformité (e-reporting, Factur-X), pourboire, paiement + fidélité

### Vérifications passées
- ✅ Manifeste : `com.trattoria.commande` 11.4 (vc 19), `allowBackup=false`, minSdk 21 / targetSdk 34
- ✅ DEX inchangé byte à byte, structure ZIP préservée (resources.arsc aligné)
- ✅ Signature **v1 (JAR)** et **v2 (APK Signature Scheme)** vérifiées, bloc aligné 4096
- ✅ Build déterministe : SHA-256 identique à chaque exécution du pipeline

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `04b70dbb56143b6e8b81ce559ca1b479d9886f20048c7a9d212206e5420f6ffc` |
| Certificat | CN=La Trattoria, OU=Restaurant, O=La Trattoria, L=Saintes, C=FR |
| SHA-256 certificat | `e8d5cc0d082951a1690637f08780e7aca80519e1471defea5a08f91ff414d981` |

### Installation
> ⚠️ **Désinstaller toute version 11.x avant** — chaque release est signée avec un keystore local éphémère (jamais commité), Android refuse donc la mise à jour directe. Voir `GUIDE_INSTALLATION.md`.

**Télécharger l'APK** : fichier `trato-11.4-stable.apk` à la **racine du dépôt**
(sur le tag `v11.4-stable`), comme pour toutes les versions du projet —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v11.4-stable/trato-11.4-stable.apk

1. Copier `trato-11.4-stable.apk` sur la tablette et l'installer
2. Lancer l'app : serveur local sur le port `8720`
3. Clients : QR `qr/QR-app-client.png` — Partenaires : `qr/QR-app-partenaire.png`

### Reproduire
```bash
pip install -r build/requirements.txt
./build/run_build_stable.sh                 # → 11.4
./build/run_build_stable.sh --version-name=11.5 --version-code=20   # version suivante
```
