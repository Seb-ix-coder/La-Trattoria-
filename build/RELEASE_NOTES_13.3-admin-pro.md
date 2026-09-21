# La Trattoria — 13.3 Admin Pro

## Administration intégrée

La version 13.3 conserve la base de l'application principale et ajoute le module d'administration de la carte sans recompilation du moteur Android :

- écran d'accueil d'administration en deux colonnes ;
- navigation par usages : carte standard, cartes du jour, ardoise & QR, marges, objectifs et données ;
- véritable logo et illustrations La Trattoria réutilisés dans le module ;
- interface tactile compacte, hiérarchisée et adaptée tablette/téléphone ;
- accès aux objectifs directement depuis le tableau de bord.

## Objectifs dynamiques

L'administrateur peut maintenant :

- ajouter autant d'objectifs que nécessaire ;
- modifier le nom, l'indicateur, la cible, l'unité et la période ;
- supprimer un objectif ;
- suivre une progression visuelle et l'état atteint / en cours ;
- utiliser les indicateurs automatiques : chiffre d'affaires, couverts/commandes,
  marge moyenne, produits actifs et rubriques publiées ;
- utiliser un objectif manuel quand la valeur provient d'un suivi externe.

Les ventes du jour sont récupérées depuis l'API locale lorsqu'elle est disponible,
avec repli automatique sur les données locales hors réseau. Les objectifs restent
persistés sur la tablette et n'empêchent pas l'utilisation de la carte hors ligne.

## Compatibilité et contrôle

- base : `trato-13.0-stable.apk` ;
- versionName : `13.3` ;
- versionCode : `34` ;
- DEX conservé byte à byte ;
- signatures v1 et v2 vérifiées ;
- carte standard, aperçu A4, impression, site public et fonctionnalités sociales conservés.

APK : `trato-13.3-admin-pro.apk`
