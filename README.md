# La-Trattoria-

Application de gestion du restaurant **La Trattoria** (Saintes) — caisse, site public
local, comptabilité, stock, personnel, statistiques.

## Contenu du dépôt

| Élément | Description |
|---|---|
| `trato.apk` | Application Android v11.0 (`com.trattoria.commande`) — seul artefact compilé |
| `docs/ANALYSE.md` | Analyse complète de l'application (rétro-ingénierie de l'APK) et chemin d'intégration |
| `carte/` | **Gestion de la carte** : ajout de formules, plats, boissons et cocktails avec photos, descriptifs, et marge automatique ou manuelle. Préchargé avec les 84 produits de l'application |

## Le module `carte/` en bref

Ouvrir `carte/index.html` (ou servir le dossier) : gestion complète des produits avec
photos et descriptifs ; marge calculée automatiquement (PV HT − coût matière, taux,
coefficient) avec cible manuelle possible (en € ou en %) donnant le prix de vente à
appliquer ; alertes identiques à celles de l'application (coeff. 4,0 cuisine / 3,8
alcool) ; export JSON compatible avec le modèle de données de l'APK et export CSV
pour Excel.

Nouveautés : **cartes du jour** (plats du jour, bières du jour, carte des desserts)
composables et imprimables ; **synchronisation entre tablettes** via
`carte/serveur_carte.py` (Wi-Fi local, dernier écrivain fait foi) ; **page publique
clients** (`carte/public.html`) en lecture seule avec photos. Installable sur
tablette comme une application (PWA, hors ligne complet).

⚠️ Le dépôt ne contient pas le **code source** de l'application Android. L'intégration
de ces fonctions dans l'APK elle-même nécessite le projet source (Android Studio) —
voir `docs/ANALYSE.md` §5-6.
