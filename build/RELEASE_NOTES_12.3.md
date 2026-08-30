> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

## 📦 Reconstruction 12.3 + solution à « impossible d'installer »

### Le diagnostic
L'APK est **techniquement parfait** (intégrité ZIP, `resources.arsc`
non compressé et aligné, signatures v1+v2, manifeste valide — tout vérifié).
La cause du refus d'installation est le **conflit de signature** :
les versions **11.5 → 11.8** portent une clé différente (empreinte
`e63be1f6…`) de la série **11.9 → 12.x** (`1eebb923…`). Android refuse
catégoriquement la mise à jour par-dessus → « **Application non installée** ».

### La solution
1. **Désinstaller** toute version existante de La Trattoria
   (appui long sur l'icône → Désinstaller) ;
2. Télécharger et installer **`trato-12.3-stable.apk`** ;
3. Si le téléchargement .apk échoue : prendre le **`.zip`** et le décompresser.

**Vérifier le téléchargement** : taille exacte **2 170 249 octets** —
SHA-256 `32bf792dc7fc1e785c00dc41a79e327c61def29be145ff592f9cfb1d2ac66525`

### Liens directs (raw)
- APK : https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v12.3-stable/trato-12.3-stable.apk
- ZIP : https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v12.3-stable/trato-12.3-stable.zip
- Guide complet + tableau des erreurs : `GUIDE_INSTALLATION_12.3.md`

### Contenu vérifié dans l'APK
- ✅ Panneau « ✏️ Éditer les cartes » à l'accueil (6 tuiles) + onglet nav « ✏️ Cartes »
- ✅ Vues d'édition dans l'onglet La carte : **standard, formules, vins, glaces, bières**
- ✅ Raccourci tablette `?carte` (titre + icône du restaurant)
- ✅ Ardoise craie (Caveat), logo, badges, pâte 48 h, QR du site
- ✅ Mentions légales / CGV / RGPD officiels (SIRET 106 050 263 00016, LWS)
- ✅ Moteur DEX = original 11.0 (byte à byte), signatures v1+v2, vc 28

### Menu « Cartes » natif
Ce menu est **compilé** dans le moteur (aucun WebView dans l'app) — le
modifier sans recompiler les sources provoque le crash silencieux documenté
des 11.1→11.4. Le moteur reste donc intact et l'édition est posée à côté
(panneau accueil, onglet, icône) — vérifié par décompilation, voir
`DIAGNOSTIQUE_CRASH.md`.
