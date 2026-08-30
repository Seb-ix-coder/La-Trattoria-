> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

## 📱 Icône « Éditer les cartes » sur l'écran d'accueil de la tablette — `trato-12.1-stable.apk` (versionCode 26)

### Pourquoi ce fonctionnement
Le menu « Cartes » de l'application est un écran **natif**, compilé dans le
moteur (`classes.dex`) — vérifié par décompilation
(`MainActivity` → `Ecrans.cartes()`, aucun WebView dans toute l'app).
Le modifier provoque le **crash silencieux** déjà rencontré (versions
11.1→11.4, cf. `DIAGNOSTIQUE_CRASH.md`). Le moteur reste donc intact, et
l'édition se pose en **icône sur l'écran d'accueil** de la tablette —
une application « Éditer les cartes » à côté de La Trattoria.

### Installation (une fois, ~2 minutes — voir `GUIDE_EDITION_TABLETTE.md`)
1. Installer et **lancer** `trato-12.1-stable.apk`
2. Sur la tablette, ouvrir Chrome → `127.0.0.1:8720/?carte`
3. Menu **⋮** → **« Ajouter à l'écran d'accueil »** → nommer `Éditer les cartes`
4. ✅ L'icône (logo du restaurant) apparaît sur l'écran d'accueil

**Un tap** → le module complet en plein écran : 🍽️ Carte standard ·
🧾 Formules · 🍷 Vins · 🍨 Glaces · 🍺 Bières · 📋 Ardoise & QR —
publié automatiquement sur le site.

### Vérifications
- ✅ 5/5 tests mode autonome (titre, favicon/logo, thème)
- ✅ Suites existantes : 51/51 · 25/25 · 14/14
- ✅ Manifeste 12.1 (vc 26), **DEX d'origine 11.0 intact**, signatures v1 + v2

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `e233e989611bd0b52e2a2803f7468fa778843f16260627bcf38ed60e4473a839` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version 11.x/12.0 avant (clé de signature différente).
**APK** : `trato-12.1-stable.apk` à la racine du dépôt (tag `v12.1-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v12.1-stable/trato-12.1-stable.apk
