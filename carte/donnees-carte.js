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
    'Pizzas':   { titre: 'Nos pizzas',        sous: 'Pâte maturée 48 h, cuisson au feu de bois' },
    'Salades':  { titre: 'Nos salades',       sous: 'Servies avec pain maison' },
    'Entrées':  { titre: 'À partager',        sous: 'Pour commencer en douceur' },
    'Pâtes':    { titre: 'Nos pâtes fraîches', sous: 'Préparées chaque matin' },
    'Desserts': { titre: 'Nos desserts maison', sous: 'Tiramisus et douceurs du jour' },
    'Apéritif': { titre: 'Apéritifs & cocktails', sous: 'À siroter entre amis' },
    'Boissons': { titre: 'Boissons & cafés',  sous: 'Avec ou sans alcool' }
  }
};
