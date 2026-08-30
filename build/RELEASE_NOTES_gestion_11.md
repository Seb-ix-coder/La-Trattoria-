> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

# 🏪 Application native « La Trattoria — Gestion » v1.1 — la gestion complète

Suite de votre demande : l'app native couvre désormais **les modules de
gestion quotidiens**, même organisation que l'application d'origine
(Salle · Ventes · Cartes · Site · Administration). Code source dans le
dépôt (`build/app-src/src/`), compilé avec la toolchain de la sandbox.

## Modules

### 🪑 Salle — Prise de commande
- **Plan de salle** : zones + tables (Interieur:8, Terrasse:6 par défaut —
  modifiable dans Administration), tables **libres / occupées** (rouge)
- **Commande par table** : produits de la carte par catégorie, quantités
  −/+, total en direct, **Encaisser** (vente enregistrée), ticket réimprimable,
  annulation
- Les **commandes du site** apparaissent en haut de la Salle avec
  **Encaisser** en un tap

### 📈 Ventes du jour
- **Chiffre d'affaires**, nombre de tickets, **ticket moyen**
- **Meilleures ventes** du jour
- Liste des tickets (détail + réimpression)

### 🌐 Site en ligne — serveur HTTP **intégré**
- Bouton **Démarrer/Arrêter** (port 8721, réseau Wi-Fi du restaurant)
- **Page clients servie** : la carte à jour, panier −/+, nom/téléphone,
  envoi de commande
- Les commandes arrivent **en direct** dans la Salle (toast + encaissement)
- Adresse affichée pour les clients (ex. `http://192.168.1.42:8721/`)

### 🧾 Cartes (déjà en v1.0, conservé)
- Carte standard : **84 produits éditables** + catégories éditables
- **6 cartes du moment** craie/illustrées (plats, boissons, vins & alcools,
  **glaces L'Angelys**, desserts, bières) — prix **HT**, mentions obligatoires
- Ardoise (promesses, site) — **impression A4 / craie / tickets** (PDF)

### ⚙️ Administration · 💾 Données
- Plan de salle, effacement historique, contact/SIRET
- **Export / Import JSON** (compatible module carte)

## 🔑 Clé de signature enfin stable
La clé était perdue à chaque session (exclue par `.gitignore` `*.p12`) →
d'où les « Application non installée » répétés. Elle est désormais
**commitée** (`build/keystore/`) : **toutes les versions à partir de
celle-ci (Gestion v1.1+, app principale 12.7+) se mettent à jour
directement**, sans désinstallation.

## Installation
Si la v1.0 « Édition des cartes » est installée : **mise à jour directe**
(même package). Sinon installation neuve — dans les deux cas :
```
https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v1.1-gestion/trato-gestion-1.1.apk
```
Taille : **250 543 octets** (0,24 Mo) · SHA-256
`0f0b5e0c4609daa42348a980cceca553bfa333447bd4276f649ec066d0f60649`
(.zip : même URL en `.zip`)

## Vérifications 12/12
package/version/label · signatures v1+v2 · INTERNET (serveur) · ZIP intègre ·
resources.arsc STORE+aligné · dex valide · assets complets

## Feuille de route (prochaines versions)
Modules restants de l'app d'origine, par priorité : Stock & commandes
fournisseurs · Comptabilité (TVA, résultat, factures) · Objectifs ·
Invendus anti-gaspi · Personnel/contrats · Impression tickets cuisine.
Dites l'ordre qui vous convient.
