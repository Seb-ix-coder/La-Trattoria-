# Paiement, carte de fidélité & produits — guide d'utilisation

Fonctionnalités intégrées à l'application (APK 11.2, même clé que la
version installée → mise à jour par-dessus sans perte de données).

---

## 1. 💳 Mode de paiement choisi par le client (commande en ligne)

Au moment de sa commande à emporter, le client choisit son **mode de
paiement prévu** parmi :

- **Espèces** (défaut)
- **Carte**
- **Tickets restaurant**
- **Chèque**
- **Bon de fidélité** (pizza offerte via la carte de fidélité)

Le choix s'affiche dans le récapitulatif (« Paiement prévu : … ») et est
ajouté à la **note de la commande** (`Paiement : Carte`) : le personnel le
voit à l'écran des commandes et l'encaisse **au retrait** (le paiement
reste sur place, conforme aux CGV).

## 2. 🎁 Carte de fidélité (programme classique)

**Règle** : 1 **tampon** par produit éligible (par défaut : les pizzas),
**10 tampons = 1 pizza offerte** (seuil configurable).

**Côté client** :
- une section « Carte de fidélité » explique le programme sur le site ;
- au moment de la commande, le client peut saisir son **numéro de carte
  (ou téléphone)** : `Carte fidélité : F-0042` est ajouté à la note pour
  que le personnel appose les tampons au retrait.

**Côté gestion (bouton ⚙ → « Fidélité », protégé par code PIN)** :
- créer une carte (numéro auto `F-0001` ou saisi),
- rechercher par n° ou téléphone,
- ajouter des tampons (`+1 tampon`),
- **offrir une pizza** quand le seuil est atteint (consomme les tampons),
- historique par carte (tampons et offres datés),
- **exporter le registre en CSV** (sauvegarde comptable).

⚠️ Les données de fidélité sont stockées **dans le navigateur de la
tablette** : pensez à exporter régulièrement le CSV. (Une persistance
native nécessiterait les sources de l'application.)

## 3. 🍕 Gestion des produits à la vente

**Dans l'application (modification, avec photo)** : Administration →
Catalogue. L'application native permet déjà de gérer chaque produit :
nom, famille, catégorie, description, prix de vente (TTC), TVA, coût
matière, actif/inactif, et **photo du plat** (prise avec l'appareil photo
de la tablette). C'est là que se fait la vraie gestion.

**Dans les outils web (bouton ⚙ → « Produits »)** : consultation du
catalogue en temps réel (nom, famille, prix TTC, TVA, disponibilité) et
**export CSV** (référence pour l'e-reporting, les menus imprimés, etc.).

> NB technique : le catalogue est défini dans le code de l'application
> (aucune persistance native découverte). Une édition persistante depuis
> le web nécessiterait les sources du projet.

## 4. 💶 Pourboires — règle comptable

- **Côté client** : le bloc « Pourboire pour l'équipe » (0/1/2/5 € ou
  montant libre) est disponible au moment de la commande ; un rappel
  indique « **Le pourboire est à déposer à la caisse au retrait** ».
- **Règle comptable** : les pourboires sont **déposés à la caisse** et
  **comptabilisés en espèces uniquement** (quelle que soit l'intention
  du client, c'est un décaissement espèces pour le personnel).
- **Statistiques** : dans l'outil **e-reporting** (bouton ⚙), saisissez
  les **pourboires reçus sur la période** → ils sont **inclus dans le
  tableau de stats**, dans le **CSV** (colonne `pourboires_especes` +
  ligne `TOTAL_PERIODE`) et dans le **XML**
  (`<pourboires_especes>`), avec le rappel de la règle.

## 5. Rappel d'accès

| Fonction | Accès |
|---|---|
| Paiement + fidélité (client) | page du site (commande en ligne) |
| e-reporting / factures / fidélité / produits (gestion) | bouton **⚙** (bas gauche) → **code PIN** (4 chiffres, défini à la première utilisation) |
