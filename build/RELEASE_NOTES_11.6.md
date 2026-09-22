> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

## 🧾 Carte principale éditable « ardoise » — `trato-11.6-stable.apk` (versionCode 21)

**Nouveauté majeure** : la carte principale s'édite désormais comme les plats
du jour — et s'affiche en **ardoise pro, écriture manuscrite à la craie**.

### Édition (onglet « Ardoise & QR » du module carte)
- **Titre + sous-titre de chaque catégorie** (Pizzas, Salades, Entrées…)
- **Items éditables ligne par ligne** : fiche produit complète (avec nouveau
  champ *sous-titre*), réordonnancement ▲▼ à la main
- **Lignes libres** : ajoutez des lignes hors catalogue (nom, sous-titre,
  descriptif, prix)
- **Photos** : photo principale + **photo d'ardoise** (rendu polaroid craie),
  par produit
- **QR code du site** affiché sur l'ardoise, adresse modifiable, QR
  régénéré et vérifié (niveau d'erreur H)
- **Aperçu plein écran + impression / PDF** (l'impression ne sort que
  l'ardoise)

### Design « ardoise » (page publique `apercu-carte.html`)
- Fond ardoise avec cadre bois, écriture **Caveat** (manuscrite à la craie,
  licence OFL, polices embarquées → fonctionne hors ligne et dans l'APK)
- **Logo officiel en en-tête**
- **Header promesses** : « Tout est fait maison · Tout est frais · Bio dès
  que possible » (modifiables)
- **Bandeau pâte à pizza** : *Fraîche, maturée 48 heures*
- Sous-titre par catégorie, pointillés craie, prix à la craie jaune,
  couleurs de craie alternées, photos style polaroid
- **QR propre** encadré, pointant directement vers l'URL du site

### Publication & synchronisation
- La configuration voyage avec la carte : **API du serveur de carte**
  (champ `config`), synchro multi-tablettes, localStorage, export/import
  JSON (format v4)
- Page clients (`public.html`) : nouveau lien « 🧾 Voir l'ardoise du moment »
- **Embarquée dans l'APK** (module carte 503 Ko vérifié, tous marqueurs)

### Vérifications
- ✅ Manifeste 11.6 (vc 21), `allowBackup=false`, **DEX d'origine 11.0 intact**
- ✅ Signatures v1 (JAR) + v2 (APK Signature Scheme)
- ✅ 26/26 tests DOM éditeur (jsdom) · 8/8 tests page publique via API
- ✅ Build déterministe

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `9c1d080a5b30d3a7f0efbcf78f72beff7b99712fca60c2c996c4e3c26218f1f4` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version 11.x avant (clé de signature différente).
**APK** : `trato-11.6-stable.apk` à la racine du dépôt (tag `v11.6-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v11.6-stable/trato-11.6-stable.apk
