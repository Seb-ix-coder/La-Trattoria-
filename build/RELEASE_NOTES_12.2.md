> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

## ⚖️ Mentions légales, CGV et données personnelles officielles — `trato-12.2-stable.apk` (versionCode 27)

Intégration des **informations légales officielles** du restaurant sur le
site **et** dans l'application.

### Informations intégrées
- **Éditeur** : La Trattoria — entreprise individuelle — SIRET **106 050 263 00016** — 15 rue de la poste, 17100 Saintes — [06 27 21 31 90](tel:0627213190) — alexis.coudret@outlook.fr
- **Directeur de la publication** : le gérant de La Trattoria
- **Hébergeur** : LWS (Ligne Web Services)
- **CGV complètes** (10 articles) : objet, produits/prix TTC, disponibilité, modes de commande (Click & Collect, sur place, livraison), horaires, délai 15-20 min, annulation, paiement (espèces/CB/tickets + Stripe), remboursement (L. 221-28), litiges (médiateur L. 612-1, ressort de Saintes)
- **RGPD** : finalités, droits d'accès/suppression, conservation 3 ans, cookies techniques

### Où c'est affiché
| Endroit | Contenu |
|---|---|
| **Site de l'app** — page `#mentions` | Mentions légales complètes (remplace l'ancien contenu à l'affichage, sans toucher au moteur) |
| **Site de l'app** — page `#cgv` | CGV complètes |
| **Site de l'app** — page `#donnees` | Données personnelles & cookies |
| **Site de l'app** — section `#contact` | Encadré SIRET + coordonnées |
| **Page publique carte** | Pied de page SIRET + lien « Mentions légales · CGV · Données personnelles » |
| **`legal.html`** (nouveau) | Page légale complète dans la charte du site |
| **Ardoise imprimable** | Pied : adresse, téléphone, SIRET |

> Implémentation **100 % couche web** (site.js) : le moteur DEX reste intact
> (aucun risque de crash). Source de vérité : `INFORMATIONS_LEGALES.md`.

### Vérifications
- ✅ 26/26 tests addon légal · 6/6 `legal.html` servie · suites existantes 51/51 · 25/25 · 14/14
- ✅ Manifeste 12.2 (vc 27), **DEX d'origine 11.0 intact**, signatures v1 + v2
- ✅ Tout le contenu légal vérifié dans le `site.js` embarqué

### Empreintes
| Élément | Valeur |
|---|---|
| SHA-256 APK | `cbfc755045a4cfc7449616cf4c4f3a8f27962bc1e7762ceba2855652acd6098c` |
| Certificat SHA-256 | `1eebb923dd7cd71196279f52274c8900c2e56c5cc20e48de77c3266bcfa333c7` |

### Installation
> ⚠️ Désinstaller toute version antérieure (clé de signature différente).
**APK** : `trato-12.2-stable.apk` à la racine du dépôt (tag `v12.2-stable`) —
https://github.com/Seb-ix-coder/La-Trattoria-/blob/v12.2-stable/trato-12.2-stable.apk
