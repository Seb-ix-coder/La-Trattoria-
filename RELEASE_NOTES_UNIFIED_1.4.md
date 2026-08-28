# La Trattoria — 1.4 native unifiée

## Artefact

- Nom exact : `trato-unifie-1.4-stable.apk`
- versionName : `1.4`
- versionCode : `5`
- package : `com.trattoria.cartes`
- activité launcher : `com.trattoria.cartes.MainActivity`
- taille : `18001478` octets
- SHA-256 APK : `08463016986ea2cdb584d203578e7cd5021484539af44532bb913e32c4604c04`
- certificat v1/v2 SHA-256 : `46d7c630da555edf45c3edcd1cda4a5c50be9c01ade5fc59f20516c234100090`
- signature : v1 JAR + v2 APK Signature Scheme ; v3/v4 non présents
- minSdk : 21 · targetSdk : 33 · HTTP local autorisé pour les serveurs 8720/8721

## Intégration réellement livrée

- source Java native recompilée depuis `build/app-src/src/com/trattoria/cartes` ;
- accueil public premium : hero éditorial avec belle photo, sélection « À la une » en cartes photo généreuses, titres et descriptifs hiérarchisés, boutons « Ajouter » et sélection persistante ;
- identité visuelle remplacée par le médaillon La Trattoria fourni : logo web vectoriel, icônes PWA, icône APK, en-têtes communauté et aperçu ardoise harmonisés ;
- panier corrigé : panneau latéral avec fond, largeur, défilement, fermeture accessible et commandes +/− correctement visibles ;
- carte complète repensée en grandes cartes verticales : photo prioritaire, catégorie, prix et bouton d’ajout aligné, avec responsive smartphone/tablette ;
- header natif compilé à deux niveaux : logo officiel, établissement, écran courant,
  recherche clavier avec état vide, navigation tactile défilante ;
- gestion native : accueil, salle, commande, ventes, tickets, cartes standard,
  cartes du jour, ardoise, QR, stock, comptabilité, objectifs, invendus,
  personnel, communication, administration, données, import/export,
  impression/PDF et serveur local ;
- site public local dans les assets de la même APK : cartes administrées,
  84 visuels générés haute définition, angle et éclairage homogènes sur ardoise,
  produits et identifiants stables, photos administrées prioritaires,
  fallback explicitement identifié, plats du jour, slider, réservation,
  panier, paiement prévu, pourboire, fidélité, conformité, modes client et
  partenaire ;
- notation serveur : session, achat structuré, `plat_id`, note 1–5, une note
  par utilisateur et plat, modification, moyenne et compteur ;
- backend social natif `ServeurCommunaute.java` embarqué dans l'APK sur le
  port 8721 : inscription, connexion, profils, photos, posts publics,
  commentaires, réactions, messages, partenaires, offres, fidélité, missions,
  badges, classement, consentements, parrainage et validation ;
- migration additive du serveur communauté Python : lignes d'achat, sauvegarde
  pré-migration, conservation du texte legacy, refus de noter une ligne sans
  identifiant stable.

Aucun faux avis n'est prérempli : l'état initial est vide et professionnel.

## Vérifications exécutées

- diagnostic AXML/package/activité/versions/SDK/permissions des APK sources ;
- `git diff --check` ;
- `python3 -m py_compile build/*.py communaute/serveur_communaute.py` ;
- `node --check` sur les scripts du site ;
- contrôle HTTP du site standalone : placeholders retirés, 84 références produits, sélection et boutons d’ajout présents ;
- contrôle de parité : `public-shell.html`, `site.js` et `unified-client.css` embarqués identiques aux sources buildées ;
- contrôle de parité logo : SVG, PNG, icônes PWA et icône APK extraites avec le nouvel emblème ; ressource Android recompilée par AAPT2 ;
- test HTTP d'intégration du serveur communauté : refus sans achat, acceptation
  après ligne achetée, modification et moyenne ;
- compilation ECJ + D8 de 4 sources natives, puis assemblage ;
- `aapt2-x64 dump badging` ;
- intégrité ZIP ;
- signature v1 et v2 par vérificateur Python indépendant ;
- `apksigner.jar verify --verbose` : v1=true, v2=true ;
- contrôle GitHub API : le fichier distant sur la branche de session a la
  même taille et le même SHA-256 que l'artefact local.

## Vérifications impossibles ici

- aucun appareil Android réel, émulateur ou `adb` n'était disponible ;
- installation propre, lancement graphique, rotation, retour arrière réel,
  test tactile sur petit écran et mise à jour Android n'ont donc pas été
  exécutés ;
- aucun test par-dessus `trato-12.6-stable.apk` ou `trato-12.8-stable.apk` ne
  peut être déclaré : leur package est `com.trattoria.commande`, alors que la
  finale est `com.trattoria.cartes`.

## Installation

1. Désinstaller une ancienne application `com.trattoria.cartes` seulement si
   elle n'est pas signée avec le certificat `46d7…0090`, après export JSON.
2. Installer l'APK par sideload Android.
3. Ouvrir La Trattoria : le serveur local est démarré sur le port `8720`.
4. Depuis le Wi-Fi du restaurant, ouvrir l'adresse affichée dans l'écran
   **Site** ou scanner le QR.

La communauté native est disponible dans l'APK sur le port 8721. La 1.4 n'est pas une mise à jour de la famille `com.trattoria.commande`.
Pour migrer cette famille, exporter ses données, installer séparément la
nouvelle application puis réimporter les données compatibles ; voir
`docs/APK_FUSION_ANALYSIS.md` et `docs/MIGRATION_RATING.md`.

## Lien

Le nom final est distinct des APK historiques. Le lien raw de livraison est
fourni dans le rapport de l'agent et pointe vers la branche de session
`arena/01a046da-la-trattoria`.
