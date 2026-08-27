# Vérification — Paiement direct, jonction Hiboutik & stocks (APK)

Analyse statique du bytecode (DEX) de `trato-11.3-unifie.apk`
(`com.trattoria.commande`). Ce rapport documente ce qui est **codé et
présent** dans l'application, et ce qui nécessite un appareil + les
identifiants Hiboutik pour être validé en conditions réelles.

> Méthode : décompilation des classes `Hiboutik`, `Stock`, `MainActivity`,
> `Site`, `ApiPublique` et du modèle `Modele$Ticket` (androguard),
> relecture des chaînes de ressources et des flux d'appels.

---

## 1. Paiement direct via l'application — en salle, terrasse, à emporter

**Statut : ✅ présent.**

Le ticket de caisse (`Modele$Ticket`) porte les champs qui distinguent
les trois modes :

| Champ | Rôle |
|---|---|
| `zone` | **`Salle` / `Terrasse` / `Emporter`** (les 3 valeurs sont dans les ressources) |
| `table` | n° de table (salle/terrasse) |
| `couverts` | nombre de couverts |
| `reglement` | mode de paiement |
| `hiboutikId` | identifiant de la vente côté Hiboutik |
| `serveur`, `ouvert`, `ferme`, `cloture` | traçabilité |

- L'UI de caisse dispose d'une vue **`zoneSalle`** (tables en salle
  intérieure / tables en terrasse) et du mode **Emporter**.
- La clôture (`cloturer`) affiche « **Encaisser la table N** » ou
  « **Encaisser N** » selon le mode.

### Modes de paiement proposés à la clôture
`Carte bancaire` · `Espèces` · `Titres restaurant` · `Autre`.

---

## 2. Jonction Hiboutik

**Statut : ✅ intégration complète présente dans le code.**

La classe `Hiboutik` implémente :

| Méthode | Rôle |
|---|---|
| `configure()` / `tester()` | Configuration + **test de la connexion** (site `*.hiboutik.com` + clé API) |
| `synchroniserCatalogue()` | Synchronise le catalogue : « Créer sur Hiboutik ceux qui n'existent pas encore ? » |
| `lierProduit()` / `idHiboutik()` / `nbLies()` | Mapping produit local ↔ produit Hiboutik |
| `enfiler(Ticket)` / `vider()` | **File de transmission** : les ventes sont mises en file et envoyées (fonctionne hors-ligne, puis rattrapage) |
| `envoyerVente(Ticket)` → `hiboutikId` | Envoie la vente, récupère l'identifiant Hiboutik (stocké sur le ticket) |
| `messageErreur()` | Gestion des refus (« Données refusées par Hiboutik (422) ») |

- Endpoint : `*.hiboutik.com/api` (le sous-domaine du site est saisi à la
  configuration : « pour `mapizzeria.hiboutik.com`, saisir `mapizzeria` »).
- Conformité : « **Quand la transmission à Hiboutik est activée, c'est
  Hiboutik qui enregistre officiellement vos encaissements** » — la
  transmission sert à la conformité (enregistrement officiel des
  encaissements), ce qui correspond au besoin de paiement « direct ».
- Le mode de règlement **`hiboutik`** existe comme valeur de `reglement`.
- Points d'entrée UI (vue Admin) : `Hiboutik.tester`,
  `Hiboutik.synchroniserCatalogue`, action « Transmettre les ventes à
  Hiboutik ».

**À valider sur appareil** (nécessite la clé API + le site Hiboutik du
restaurant) : un encaissement réel en salle / terrasse / emporter, la
création des ventes correspondantes dans le dashboard Hiboutik, et le
rattrapage de la file après une coupure réseau.

---

## 3. Jonction avec les stocks disponibles

**Statut : ✅ présente et cohérente.**

### Modèle
`Stock$Article` = article de stock, relié à un produit de carte par
`produitId`, avec :
- `suivi` (booléen — **est-ce que ce produit est suivi en stock ?**)
- `stock` (quantité disponible), `mini` (seuil d'alerte « stock bas »)
- `colis`, `parColis`, `unite`, `prixAchat` (réapprovisionnement)

### Flux
| Méthode | Rôle |
|---|---|
| `portionsPossibles(produitId)` | Nombre de portions réalisables = **min** sur toutes les matières premières de `floor(stock / besoin)`. **Retourne `-1` (illimité) si le produit n'a pas d'article stocké.** |
| `consommer(Ticket)` | Décrémente le stock à la clôture / à la confirmation d'une commande |
| `restituer(Ticket)` | Ré-intègre le stock (annulation) |
| `alertes()` | « Stock bas » + « Stocks à réapprovisionner » (seuil `mini`) |
| `commandeSuggeree()` | Suggestions d'approvisionnement |
| `cloturerInventaire()` / `exporter()` / `importer()` | Inventaires + sauvegarde |

### Où le stock est pris en compte
- **Caisse (POS)** : tuile produit (`paveProduit`) affiche **« ÉPUISÉ »**
  ou **« plus que N »** selon `portionsPossibles` ; alerte stock dans
  l'en-tête (`MainActivity.alerterStock`).
- **Site public** : la page servie aux clients (`Site.page`) et l'API
  publique (`ApiPublique.carte`, route `/api/v1/stock` & `/carte`)
  exposent les portions disponibles par produit.
- **Commandes en ligne** : `Site.recevoir` **rejette avec « rupture »**
  (« « X » ne figure plus à notre carte ») si la quantité demandée
  dépasse le stock — plus contrôles saturation, horaires, créneaux
  complets, taille de commande.

---

## 4. La règle demandée : « on évite de vendre ce qu'on n'a pas, **sauf les produits de la carte** »

**Statut : ✅ déjà implémentée structurellement.**

Le mécanisme repose sur le drapeau **`suivi`** et sur le comportement de
`portionsPossibles` :

- **Produit de la carte SANS article stocké** (ex. une pizza de la carte
  préparée à la demande) → `portionsPossibles` retourne **`-1` = illimité**
  → **toujours vendable**. C'est précisément l'exception « produits de la
  carte » demandée.
- **Produit SUIVI en stock** (`suivi = true`, matières premières déclarées)
  → limité à `min(floor(stock/besoin))` → **bloqué / « ÉPUISÉ » / « rupture »
  dès qu'il n'y a plus assez** (POS : badge ÉPUISÉ ; en ligne : refus
  rupture).

En pratique : seules les matières/produits marqués « suivi » sont
contrôlés ; le reste de la carte reste librement vendable. C'est le
comportement attendu.

### Points à surveiller / à valider
1. **Blocage dur à la caisse** : la tuile affiche « ÉPUISÉ » ; le blocage
   à l'ajout au panier doit être confirmé sur appareil (l'état visuel est
   certain, la garde au clic à vérifier sur un écran réel).
2. **Exhaustivité du suivi** : la règle n'est que aussi bonne que la
   saisie — un produit qu'on veut contrôler doit avoir son article stock
   créé et marqué « suivi ». Un produit mal saisi (suivi mais sans
   matières) peut afficher une disponibilité inexacte.
3. **Hiboutik réel** : la jonction est complète dans le code ; la preuve
   en conditions réelles (ventes visibles dans le dashboard, rattrapage
   hors-ligne) nécessite la clé API + un appareil.

---

## Conclusion

| Exigence | Résultat |
|---|---|
| Payer directement via l'app en salle / terrasse / emporter | ✅ Modes + encaissement codés (`zone`, `table`, `couverts`, `reglement`) |
| Jonction Hiboutik correcte | ✅ Intégration complète (test, sync catalogue, mapping, file, envoi, erreurs) — à confirmer sur appareil avec la clé API |
| Jonction stocks disponibles | ✅ Stock lié aux produits, décrément à la clôture, exposé au site, refus « rupture » en ligne, alertes |
| Ne pas vendre ce qu'on n'a pas, sauf produits de la carte | ✅ Déjà le cas : seuls les produits « suivis » sont contrôlés, les produits de carte non suivis sont illimités |

> Prochaine étape recommandée : un **test sur la tablette** avec un
> encaissement réel par mode (salle / terrasse / emporter) et
> transmission Hiboutik, plus la vérification du blocage d'ajout d'un
> produit ÉPUISÉ. Je peux fournir un protocole de test pas-à-pas.
