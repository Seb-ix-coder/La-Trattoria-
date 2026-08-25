# Guide d'installation — APK durci « La Trattoria » 11.1 (tablettes et smartphones)

Ce guide détaille l'installation, la configuration et la mise en service de
l'APK durci `build/out/trato-11.1-durci.apk` (versionCode 16, signé v1+v2,
clé « La Trattoria » 2048 bits, valable jusqu'en 2056).

> ⚠️ **À lire en premier — changement de clé de signature.**
> L'APK 11.1 est signé avec une **nouvelle clé** (l'ancienne clé de la
> version 11.0 n'est pas disponible). Android interdit l'installation
> d'une mise à jour signée avec une autre clé : **il faut donc
> désinstaller la version 11.0 avant d'installer la 11.1**, ce qui
> efface les données locales de l'application (catalogue, tickets,
> stock, comptabilité, personnel, clé Hiboutik).
> **Avant de désinstaller :** vérifiez si l'application dispose d'un
> export des données (menu Administration) et sauvegardez-le ; préparez
> les identifiants Hiboutik et les réglages à ressaisir.

---

## 1. Prérequis

| Élément | Détail |
|---|---|
| APK | `build/out/trato-11.1-durci.apk` (~1,6 Mo) |
| Appareils | Tablettes/smartphones Android **5.0 → 14+** (minSdk 21, targetSdk 34) |
| Clé de signature | `~/trattoria-keystore/trattoria-release.p12` + mot de passe (**sauvegarde immédiate !**) |
| Sources d'installation | câble USB + `adb`, ou transfert du fichier APK |

---

## 2. Sauvegarder le keystore (AVANT TOUT)

```bash
# à faire sur l'ordinateur qui a servi au build, immédiatement :
mkdir -p /chemin/sûr/trattoria-backup
cp ~/trattoria-keystore/trattoria-release.p12 /chemin/sûr/trattoria-backup/
cp ~/trattoria-keystore/README-KEYSTORE.txt /chemin/sûr/trattoria-backup/
```
Conservez **2 copies** sur des supports différents (coffre, clé USB scellée,
gestionnaire de secrets). Sans ce fichier, aucune mise à jour future ne
pourra s'installer sans tout réinstaller.

---

## 3. Transférer l'APK sur l'appareil

Choisissez une méthode :

* **Câble USB (recommandé)** : connectez la tablette en mode « Transfert de
  fichiers », copiez `trato-11.1-durci.apk` dans `Téléchargements/`, puis
  déconnectez.
* **Via `adb` (avec un ordinateur)** :
  ```bash
  adb install -r build/out/trato-11.1-durci.apk
  # (sans -r si la 11.0 a déjà été désinstallée)
  ```
* **Via un lien de partage** (Drive, Dropbox, Nextcloud) : téléchargez le
  fichier sur l'appareil et ouvrez-le depuis le gestionnaire de fichiers.
* **Via le WiFi local** : depuis l'ordinateur, `python3 -m http.server` dans
  le dossier `build/out/`, puis sur la tablette ouvrez
  `http://<ip-de-l-ordinateur>:8000/trato-11.1-durci.apk`.

## 4. Autoriser l'installation

Sur chaque appareil (une seule fois) :

1. **Paramètres → Sécurité → Applications inconnues** (le libellé varie) :
   autorisez l'installation depuis le navigateur ou le gestionnaire de
   fichiers utilisé.
2. Ouvrez le fichier `trato-11.1-durci.apk`.
3. Android affiche la demande d'installation : vérifiez que le **nom du
   certificat est « La Trattoria »** (CN) puis validez.

> Si Android affiche « Application non installée » alors qu'une version
> existait : c'est le conflit de signature — **désinstallez l'ancienne
> version d'abord** (§ 5).

## 5. Migration depuis la version 11.0

```
1. Sauvegardez ce qui peut l'être depuis l'application (exports, notes).
2. Paramètres → Applications → La Trattoria → Désinstaller.
3. Installez la 11.1 (section 4).
4. À la première ouverture, ressaisissez :
   - les identifiants Hiboutik (compte, utilisateur, clé API, magasin),
   - le mode réseau (Maître / Satellite / Seul),
   - le catalogue (ou resynchronisation depuis une autre tablette),
   - les réglages du site public (nom, horaires, adresse, CGV…).
```

## 6. Configuration WiFi recommandée (sécurité)

Le site public et l'API sont servis par la tablette maître sur le port
**8720**, en **HTTP non chiffré** (le chiffrement nécessite une évolution
des sources, cf. `build/README.md`). Pour protéger les données clients
(noms, téléphones, allergies) et les données économiques (prix de revient,
stock) :

1. **Créez un réseau WiFi dédié** à la prise de commande (ex. `LaTrattoria-Commandes`),
   distinct du WiFi invité.
2. **WPA2/WPA3 avec un mot de passe fort**, connu du personnel uniquement —
   ne l'affichez pas en salle.
3. Si votre box/routeur le permet, activez **l'isolation des clients
   (AP isolation / client isolation)** sur ce réseau : chaque appareil ne
   peut dialoguer qu'avec la tablette maître, pas avec les autres clients.
4. Idéalement : **réseau invité séparé pour les clients** (navigation web)
   sans accès au réseau de commande.
5. Notez l'**adresse IP fixe** (réservation DHCP) de la tablette maître :
   elle est nécessaire aux tablettes satellites et au dépannage.

## 7. Verrouillage des tablettes (mode kiosque)

L'application ne possède pas de code PIN : protégez l'accès au niveau
système.

* **Épinglage d'écran (gratuit, natif)** :
  1. Paramètres → Sécurité → **Épinglage d'écran** → activer.
  2. Ouvrez La Trattoria → touchez le bouton « Récents » → l'icône
     d'épingle sur la carte de l'application.
  3. L'appareil reste bloqué sur l'application jusqu'à la combinaison
     (volume + retour) ; désactivez « Demander le code PIN avant de
     désépingler » selon votre besoin.
* **Mode kiosque professionnel (recommandé pour plusieurs tablettes)** :
  inscrivez les tablettes dans un gestionnaire de périphériques Android
  Enterprise (ex. Managed Google Play / Zero Touch) et déployez un launcher
  kiosque verrouillé.
* **Règle d'or** : mot de passe/verrouillage d'écran activé, **débogage USB
  désactivé** (Paramètres → Options développeur), chiffrement activé
  (actif par défaut sur Android moderne).

## 8. Mise à jour des versions suivantes (11.2, 12…)

Tant que les versions sont signées avec la **même clé**, la mise à jour
s'installe par-dessus sans perte de données :

1. Remplacez `trato.apk` par la nouvelle version dans le dépôt.
2. `bash build/run_build.sh` (ou le pipeline GitHub, cf. `build/README.md`).
3. Récupérez le nouvel APK et installez-le (`adb install -r` ou par
   transfert de fichier) : les données locales sont conservées.

## 9. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Application non installée » | Conflit de signature avec la 11.0 | Désinstaller la 11.0 puis réinstaller (§ 5) |
| « Fichier endommagé » | Téléchargement tronqué | Vérifier le SHA-256 de l'APK (voir sortie de `verify_apk.py`) et retélécharger |
| Le site des clients ne se charge pas | Tablette maître éteinte, hors WiFi, ou port 8720 occupé | Vérifier le réseau, relancer l'application, contrôler « Réseau » dans l'app |
| La commande en ligne reste sur « appelez-nous » | L'APK n'est pas la 11.1, ou la page a été mise en cache | Vérifier la version installée ; vider le cache du navigateur client |
| Les satellites ne trouvent pas la maître | Réseaux différents ou isolation client | Mettre tous les appareils sur le réseau dédié ; saisir l'IP de la maître en manuel |
| « Erreur HTTP 401 » sur l'API | Clé API absente/invalide | Régénérer la clé dans Réglages réseau et la redistribuer |

## 10. Checklist de mise en service

- [ ] Keystore sauvegardé (2 copies, hors dépôt Git)
- [ ] 11.0 désinstallée (ou première installation)
- [ ] 11.1 installée et vérifiée (certificat « La Trattoria »)
- [ ] Identifiants Hiboutik ressaisis + test d'une vente
- [ ] Tablette maître : mode « Maître », IP fixe, serveur actif (port 8720)
- [ ] Tablettes satellites couplées et synchronisées
- [ ] Réseau WiFi dédié créé, mot de passe fort, isolation activée si possible
- [ ] Épinglage d'écran / kiosque configuré, débogage USB désactivé
- [ ] Test réel : un téléphone client commande depuis le WiFi
- [ ] Pipeline GitHub configuré (secrets KEYSTORE_BASE64 / KEYSTORE_PASSWORD)
