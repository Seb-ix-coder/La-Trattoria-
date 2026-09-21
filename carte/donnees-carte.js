/* ============================================================
   La Trattoria — configuration PAR DÉFAUT de l'ardoise
   (carte principale : titres, sous-titres, en-tête, QR).

   Tout est éditable dans l'écran « Ardoise & QR » du module
   de gestion (carte/index.html) ; ces valeurs ne servent que
   de point de départ et de repli. Le stockage/synchro passe
   par la clé « trattoria.config.v1 » (localStorage) et le
   champ « config » de l'API du serveur de carte.
   ============================================================ */
window.TRATTORIA_CONFIG_DEFAUT = {

  /* Adresse encodée dans le QR code affiché sur l'ardoise
     (et dans l'écran « Ardoise & QR »). */
  site: 'https://latrattoria-saintes.fr/',

  /* En-tête : les promesses de la maison. */
  badges: [
    'Tout est fait maison',
    'Tout est frais',
    'Bio dès que possible'
  ],

  /* Bandeau pâte à pizza. */
  pates: {
    titre: 'Pâte à pizza maison',
    sous: 'Fraîche, maturée 48 heures — légère et digeste'
  },

  /* Sous-titres PAR CATÉGORIE (une catégorie = une colonne
     « famille » du catalogue : Pizzas, Salades, Entrées…).
     Complété automatiquement à l'ouverture : toute nouvelle
     catégorie reçoit titre = son nom et sous-titre vide. */
  fams: {
    'Pizzas':   { titre: 'Nos pizzas',        sous: 'Pâte maison maturée 48 h · cuisson au feu de bois · garnitures choisies chaque matin' },
    'Salades':  { titre: 'Nos salades',       sous: 'Fraîches, colorées et préparées minute avec nos produits de saison' },
    'Entrées':  { titre: 'À partager',        sous: 'Pour ouvrir l’appétit : focaccia, bruschettas et bouchées italiennes maison' },
    'Pâtes':    { titre: 'Plats',          sous: 'Pâtes fraîches, recettes généreuses et sauces mijotées chaque matin' },
    'Desserts': { titre: 'Desserts maison', sous: 'Tiramisus, douceurs italiennes et desserts préparés dans notre cuisine' },
    'Apéritif': { titre: 'Apéritifs & cocktails', sous: 'Le moment de partager, avec des recettes italiennes et des produits soigneusement choisis' },
    'Boissons': { titre: 'Boissons & cafés',  sous: 'Vins, bières, cafés et boissons fraîches pour accompagner chaque assiette' }
  },

  /* Cartes additionnelles de l'ardoise (rendues après les
     catégories du catalogue) :
       formules — formules et menus (Menu enfant…), créables ;
       vins / bieres — produits du catalogue placés
         automatiquement (Vins au pichet, Notre cave, Bières) ;
       glaces — carte libre (exemples à éditer/supprimer).
     Chaque carte : titre, sous-titre, lignes réordonnables,
     lignes libres, produits choisis dans le catalogue. */
  extras: {
    formules: {
      titre: 'Nos formules',
      sous: 'Menus et formules du moment',
      libres: [
        { nom: 'Menu enfant', sous: 'Plat ou pâtes + dessert + boisson', prix: 9.5 }
      ]
    },
    vins: {
      titre: 'La carte des vins',
      sous: 'Au pichet et à la bouteille'
    },
    glaces: {
      titre: 'Glaces artisanales',
      sous: 'L’Angelys · glaces et sorbets pour finir sur une note fraîche',
      libres: [
        { nom: 'Une boule', prix: 2 },
        { nom: 'Deux boules', prix: 3.5 },
        { nom: 'Coupe colonel', sous: 'Sorbet citron, vodka glacé', prix: 6 },
        { nom: 'Café ou dessert glacé', sous: 'Selon la carte du jour', prix: 5.5 }
      ]
    },
    bieres: {
      titre: 'La carte des bières',
      sous: 'Pression et bouteilles'
    }
  }
};
