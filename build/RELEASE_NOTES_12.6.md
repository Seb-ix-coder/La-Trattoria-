## ⚠️ Archive historique — `trato-12.6-stable.apk` (versionCode 31)

> Cette version est retirée de la chaîne de livraison : son ancienne clé de
> signature a été commitée par erreur et doit être considérée comme compromise.
> Ne pas l'utiliser comme base de mise à jour ni réutiliser son keystore. Voir
> `build/KEYSTORE_ROTATION.md` pour générer la nouvelle identité.

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

### Décision de livraison actuelle
Le keystore historique n'est plus accepté par les scripts et a été retiré de
l'arbre courant. Une nouvelle clé doit être générée hors dépôt et stockée dans
le CI ou un coffre. La première version ainsi signée nécessitera une
réinstallation Android ; exporter les données locales avant cette opération.

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
