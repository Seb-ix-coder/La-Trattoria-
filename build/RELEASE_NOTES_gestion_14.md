# 🏪 App native « La Trattoria — Gestion » v1.4 — Site Web v2 + Gestion des commandes en ligne

Cette version **v1.4 (versionCode 5)** intègre la **v2 du site web clients** et une **gestion avancée des commandes en direct** dans l'application native.

---

## 🌟 Nouveautés majeures

### 🌐 1. Site Web Clients v2 (Serveur HTTP port 8721)
- **Interface responsive moderne & élégante** : charte graphique Trattoria italienne (Bordeaux `#8B111B`, Or `#C29B38`, Crème `#F8F6F0`), typographie soignée et ergonomie mobile.
- **En-tête & badges d'excellence** : logo, coordonnées (15 rue de la Poste, Saintes), badges qualité (*Fait maison*, *Pâte maturée 48 h*, *Produits frais*, *Circuit court*) et statut d'ouverture en direct.
- **Espace communications dynamiques** : affichage en bannières valorisées des messages du restaurant (📣 Annonces, 🔥 Promotions, 🆕 Nouveautés, ⭐ Suggestions).
- **Navigation par onglets de catégories & recherche** : filtres horizontaux instantanés (*Tous*, *Pizzas*, *Pâtes*, *Entrées*, *Plats*, *Desserts*, *Boissons*) + champ de recherche rapide en direct.
- **Panier interactif & Barre flottante** : compteur d'articles en direct, total calculé instantanément, tiroir/modal de récapitulatif avec ajustement des quantités (+/−).
- **Choix du mode de commande** :
  - 🥡 **À emporter** : sélection du créneau de retrait (*Dès que possible*, *12h15*, *12h30*, *19h30*, *20h00*, etc.).
  - 🍽️ **Sur place (À table)** : saisie du numéro de table.
- **Transmission & Confirmation** : attribution automatique d'un numéro de commande unique (ex: `#TR-428`), confirmation instantanée pour le client et transmission immédiate à la tablette du restaurant.

### 🪑 2. Gestion des commandes web dans la Salle & l'onglet Site
- **Cycle de vie des commandes en ligne** avec badges d'état couleur :
  - 🆕 **NOUVELLE** (ambre)
  - 👨‍🍳 **EN PRÉPARATION** (bleu)
  - 📦 **PRÊTE** (vert)
  - 💳 **ENCAISSÉE** (enregistrée dans le CA et archivée)
- **Détail complet** : client, téléphone, mode (à emporter / sur place), heure de retrait / table, notes/allergies, articles et total.
- **Impression du ticket de commande** : impression directe via WebView + PrintManager Android natif (ticket client & cuisine).
- **Encaissement en 1 tap** : intègre directement la vente dans le chiffre d'affaires, la TVA ventilée et les statistiques du jour.
- **Outil de test intégré** : bouton *« 📱 Simuler une commande web test »* dans l'écran Site pour tester le cycle complet sans téléphone externe.

---

## 📦 Rappel des modules intégrés

| Module | Fonctionnalités |
|---|---|
| 🪑 **Salle & commandes** | Plan de salle éditable (tables libres/occupées), prise de commande, encaissement, suivi des commandes du site en direct |
| 📈 **Ventes du jour** | CA, nombre de tickets, ticket moyen, meilleures ventes, réimpression de tickets |
| 🧾 **Cartes** | 84 produits standard éditables CRUD · 6 cartes du moment craie/illustrées (glaces L'Angelys…) · prix HT · mentions obligatoires · impression A4/PDF |
| 🌐 **Site en ligne v2** | Serveur HTTP port 8721, site web responsive v2, commandes en direct, aperçu intégré, partage |
| 📣 **Communication** | Bannières d'annonces, promotions et nouveautés en direct sur le site |
| 🎯 **Objectifs** | CA et couverts cibles du jour avec jauges d'avancement en direct |
| 📦 **Stock & fournisseurs** | Inventaire, alertes de seuils bas, commandes fournisseurs suggérées |
| 💼 **Comptabilité** | CA mensuel, TVA ventilée (10 %, 5,5 %, 20 %), dépenses et résultat estimé |
| ♻️ **Invendus** | Paniers anti-gaspi du jour |
| 👥 **Personnel** | Registre d'équipe, contrats et taux horaires |
| ⚙️ **Administration** | Configuration plan de salle, coordonnées, SIRET |
| 💾 **Données** | Export & Import JSON (interopérable avec le module carte) |

---

## 📥 Installation & Mise à jour directe
Cette version est signée avec la clé officielle stable commitée (`build/keystore/trattoria-release.p12`) : **mise à jour directe** depuis les versions 1.0, 1.1, 1.2 et 1.3 sans désinstallation.

- **APK** : `trato-gestion-1.4.apk` — **274 692 octets** (0,26 Mo)
- **SHA-256** : `5f5b778372bc2dd98672efea397579cf7b5a1bb74e304de6dab170298ac9ddf2`
- **Lien direct APK** : `https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v1.4-gestion/trato-gestion-1.4.apk`
- **Archive .zip** : `trato-gestion-1.4.zip` (même URL en `.zip`)

---

## ✅ Vérifications & Conformité
- Package : `com.trattoria.cartes` · VersionName : `1.4` · VersionCode : `5`
- Signatures : **v1 (JAR) + v2 (APK Signature Scheme v2)** vérifiées avec `apksigner`
- Structure ZIP : `resources.arsc` STORE et aligné sur 4 octets
- Bytecode : DEX valide compilé avec D8 (`--min-api 21`)
- Serveur HTTP v2 : routes `GET /`, `GET /api/carte`, `GET /api/comm`, `POST /api/commande` testées et validées (code 200)
