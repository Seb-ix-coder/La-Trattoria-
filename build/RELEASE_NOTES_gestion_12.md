> **Archive historique — non approuvée pour livraison.** Les APK et les
> identités de signature décrits ici sont historiques ; considérer
> les anciennes clés comme compromises et consulter
> `build/KEYSTORE_ROTATION.md` avant toute nouvelle diffusion.

# 🏪 Application native « La Trattoria — Gestion » v1.2 — **tous les modules**

L'intégralité des fonctionnalités de l'ancienne application, en natif —
code source dans le dépôt (`build/app-src/src/`), 90 classes compilées
sans erreur.

## Menu final — 9 modules + administration + données

| Module | Fonctionnalités |
|---|---|
| 🪑 **Salle & commandes** | Plan de salle éditable, tables libres/occupées, prise de commande (produits, quantités, total), encaissement, commandes du site encaissables en 1 tap |
| 📈 **Ventes du jour** | CA, tickets, ticket moyen, meilleures ventes, détail + réimpression |
| 🧾 **Cartes** | 84 produits éditables + catégories éditables · 6 cartes du moment craie/illustrées (glaces L'Angelys…) · prix HT · mentions · impression A4/craie |
| 🌐 **Site en ligne** | Serveur HTTP intégré (port 8721) : page clients avec panier, commandes en direct dans la Salle |
| 🎯 **Objectifs** | Jauges CA et couverts du jour, objectifs modifiables, % en direct |
| 📦 **Stock & fournisseurs** | Inventaire CRUD (qté, unité, seuil, fournisseur), alertes sous le seuil, commandes suggérées |
| 💼 **Comptabilité** | CA du mois, TVA ventilée 10 %/5,5 %/20 %, dépenses CRUD, résultat estimé |
| ♻️ **Invendus** | Paniers anti-gaspi : déclaration, marquage « Vendu », historique du jour |
| 👥 **Personnel** | Registre équipe : nom, contrat, heures, taux horaire — CRUD |
| ⚙️ Administration | Plan de salle, effacement historique, contact/SIRET |
| 💾 Données | Export/Import JSON |

## 📥 Installation (mise à jour directe depuis 1.0/1.1)
```
https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v1.2-gestion/trato-gestion-1.2.apk
```
**Taille : 260 228 octets** (0,25 Mo) · SHA-256 `9f4bc92c39575627f1649c8410187e54c8110fe9ea93aa3d05904ae45e050e9c`
(.zip : même URL en `.zip`)

Clé de signature **commitée** (`build/keystore/`) : toutes les versions
futures se mettent à jour directement, sans désinstallation.

## Vérifications
version 1.2 (vc 3) · signatures v1+v2 (clé stable) · ZIP intègre ·
resources.arsc STORE+aligné 4 · dex valide · assets complets
