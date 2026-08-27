## 🔑 Fin des conflits de signature — keystore officiel figé — `trato-12.6-stable.apk` (versionCode 31)

### La cause, enfin identifiée précisément
« Application non installée » = **conflit de signature**. Chaque session de
build générait une **nouvelle clé** (le keystore était perdu à chaque purge
de l'environnement de build) :

| Versions | Clé (empreinte) |
|---|---|
| 11.5 – 11.8 | `e63be1f6…` |
| 11.9 – 12.4 | `1eebb923…` |
| 12.5 | `188bacf2…` |

Android refuse catégoriquement une mise à jour signée avec une autre clé.

### La solution définitive
Le **keystore officiel est désormais figé dans le dépôt**
(`build/keystore/`) et utilisé automatiquement par le pipeline : **toutes
les versions à partir de la 12.5 partagent la même clé** — les mises à jour
se font **directement, sans jamais désinstaller**.
(Compromis de sécurité assumé et documenté dans `build/keystore/MOT_DE_PASSE.txt`,
avec la procédure de rotation.)

### À faire UNE DERNIÈRE FOIS sur la tablette
1. **Désinstaller** la version installée (12.4 ou autre) — appui long → Désinstaller
2. Installer **`trato-12.6-stable.apk`** :
   https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v12.6-stable/trato-12.6-stable.apk
   — **2 270 763 octets** · SHA-256 `3d7fa32acfb463cc5d3ef69d88e60e438a4c6caca5abdad1556a791b2f6a44e5`
3. ✅ **C'est la dernière désinstallation** : toutes les versions suivantes
   (12.7, 13.0…) s'installeront par-dessus sans rien perdre.

### Contenu (identique à la 12.5)
- 84 produits éditables + catégories éditables (onglet Carte standard)
- Cartes annexes : formules, vins, glaces, bières
- **6 cartes du moment** craie/illustrées : plats, boissons, **vins & alcools**,
  **glaces L'Angelys**, desserts, bières — prix **HT**, mentions obligatoires
- Aperçu/impression **A4**, ardoise principale craie + QR, mentions légales/CGV/RGPD
- Tout publié sur le site

### Vérifications
- ✅ Empreinte certificat 12.6 = 12.5 (`188bacf2…`) — même clé, mises à jour garanties
- ✅ Manifeste 12.6 (vc 31), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Suites de tests : moment 28/28 · non-régression complète OK
