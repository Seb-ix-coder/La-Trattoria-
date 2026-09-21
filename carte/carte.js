/* ============================================================
   La Trattoria — gestion de la carte
   Ajout de formules, plats, boissons et cocktails, avec photos,
   descriptifs, et marge calculée automatiquement ou fixée à la
   main. Cartes du jour (plats, bières, desserts) composables et
   imprimables. Synchronisation entre tablettes via le serveur
   local (serveur_carte.py). Aucune dépendance : fonctionne hors
   ligne, sur le wifi du restaurant.
   ============================================================ */
(function () {
  'use strict';

  // Mêmes objectifs de coefficient que l'application (Base.objectifCoef /
  // Base.objectifCoefAlc) : la cuisine vise un coeff. 4,0, l'alcool 3,8.
  var COEF_CIBLE_CUISINE = 4.0;
  var COEF_CIBLE_ALCOOL = 3.8;
  var SEUIL_COEFF = 0.8;          // alerte sous 80 % de l'objectif…
  var SEUIL_MARGE = 5;            // …et marge inférieure à 5 € (vueAdmin de l'APK)
  var CLE_STOCK = 'trattoria_carte_v1';
  var CLE_ARDOISES = 'trattoria_ardoises_v1';
  var EMPOTER_MIN = 1e-9;

  // Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011).
  var ALLERGENES = [
    ['gluten', 'Gluten', '🌾'], ['crustaces', 'Crustacés', '🦐'],
    ['oeufs', 'Œufs', '🥚'], ['poissons', 'Poissons', '🐟'],
    ['arachides', 'Arachides', '🥜'], ['soja', 'Soja', '🌿'],
    ['lactose', 'Lactose', '🥛'], ['fruitsacoque', 'Fruits à coque', '🌰'],
    ['celeri', 'Céleri', '🥬'], ['moutarde', 'Moutarde', '🟡'],
    ['sesame', 'Sésame', '◻️'], ['sulfites', 'Sulfites', '🍷'],
    ['lupin', 'Lupin', '🌼'], ['mollusques', 'Mollusques', '🐚']
  ];
  var ADRESSE = 'La Trattoria · Rue de La Poste · 17100 Saintes';

  var TYPES = { formule: 'Formule', plat: 'Plat', boisson: 'Boisson', cocktail: 'Cocktail' };

  // Les trois cartes du jour : source des candidats et sélection automatique.
  var ARDOISE_DEFS = {
    plats:    { titre: 'Les plats du jour',     sous: 'Ce midi et ce soir' },
    bieres:   { titre: 'Les bières du jour',    sous: 'Pression et bouteilles' },
    desserts: { titre: 'La carte des desserts', sous: 'Faits maison chaque matin' }
  };

  var CARTE = [];
  var ARDOISES = null;
  var ECRAN = 'carte';
  var FILTRE_TYPE = 'tout';
  var RECHERCHE = '';
  var TRI = { cle: 'fam', sens: 1 };
  var EN_EDITION = null;      // id du produit en cours d'édition, null = création
  var PHOTO_BROUILLON = null; // data-URL en cours dans la fiche (null = aucune)
  var CUEILLETTE = null;      // {cle, choisis:[ids]} pendant la composition d'une carte
  var SYNC = { actif: false, version: 0, minuteur: null };
  var CLE_SYNC_TOKEN = 'trattoria.sync_token.v1';
  var SYNC_TOKEN = localStorage.getItem(CLE_SYNC_TOKEN) || '';
  var CLE_HIBOUTIK = 'trattoria.hiboutik_catalogue.v1';
  var CLE_LIVRAISON = 'trattoria.delivery.v1';
  var LIVRAISON = { sur_place: 0, uber: 4.5, livraison_urbaine: 3.0 };
  var HIBOUTIK = { configure: false, creation: false, produits: [], maj: null, chargement: false };

  // Objectifs de pilotage : extensibles, persistants et alimentés par les
  // ventes/catalogue disponibles. Cette couche reste indépendante du DEX :
  // elle se synchronise avec l'API locale quand celle-ci est joignable et
  // conserve toujours un repli local hors réseau.
  var CLE_OBJECTIFS = 'trattoria.objectifs.v1';
  var OBJECTIFS = [];
  var OBJECTIF_VENTES = [];
  var OBJECTIF_EDIT = null;

  // Ardoise (carte principale) : titres/sous-titres de catégories,
  // lignes libres, ordre, en-tête (badges, pâte 48 h), QR du site.
  var CLE_CONFIG = 'trattoria.config.v1';
  var CF = null;              // objet configuration (voir configNormalisee)
  var PHOTO_ARDOISE_BROUILLON = null; // data-URL « photo d'ardoise » de la fiche
  var LIGNE_A_EDITER = null;  // id de ligne libre à éditer après le prochain rendu
  var CPT_CRAIE = 0;          // alternance des couleurs de craie
  var CARTE_VIEW = 'standard'; // vue de l'onglet « La carte » : standard | formules | vins | glaces | bieres | boissons
  var LF_A_EDITER = null;     // {fam, id} : ligne libre (catégorie) à éditer après rendu

  // ==========================================================
  //  Utilitaires
  // ==========================================================
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function eur(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2).replace('.', ',') + ' €';
  }
  function pct(v) { return (v * 100).toFixed(1).replace('.', ',') + ' %'; }
  function txtCoef(v) {
    if (!isFinite(v) || v <= 0) return '—';
    return '×' + v.toFixed(2).replace('.', ',');
  }
  function arrondi10(v) { return Math.ceil(v * 10 - 1e-9) / 10; } // au 0,10 € protecteur

  function echap(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function dateDuJour() {
    try {
      return new Date().toLocaleDateString('fr-FR',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function livraisonCharger() {
    var src = null;
    try { src = JSON.parse(localStorage.getItem(CLE_LIVRAISON) || 'null'); } catch (e) { }
    if (!src || typeof src !== 'object') return;
    ['sur_place', 'uber', 'livraison_urbaine'].forEach(function (id) {
      var n = Number(src[id]);
      if (isFinite(n) && n >= 0 && n <= 100) LIVRAISON[id] = Math.round(n * 100) / 100;
    });
  }

  function livraisonAfficher() {
    var ids = { sur_place: 'tarif-sur-place', uber: 'tarif-uber', livraison_urbaine: 'tarif-livraison-urbaine' };
    Object.keys(ids).forEach(function (id) {
      var input = $('#' + ids[id]);
      if (input) input.value = LIVRAISON[id].toFixed(2);
    });
  }

  function livraisonSauver() {
    var ids = { sur_place: 'tarif-sur-place', uber: 'tarif-uber', livraison_urbaine: 'tarif-livraison-urbaine' };
    Object.keys(ids).forEach(function (id) {
      var input = $('#' + ids[id]);
      var n = input ? Number(String(input.value).replace(',', '.')) : LIVRAISON[id];
      if (!isFinite(n) || n < 0) n = 0;
      LIVRAISON[id] = Math.round(Math.min(100, n) * 100) / 100;
    });
    try { localStorage.setItem(CLE_LIVRAISON, JSON.stringify(LIVRAISON)); } catch (e) { }
    var info = $('#info-livraison');
    if (info) info.textContent = 'Tarifs enregistrés sur cette tablette.';
    toast('Tarifs de livraison enregistrés');
  }

  var minuteurToast;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  // ==========================================================
  //  Calculs de marge
  //  pv  = prix de vente TTC, cout = coût matière, tva = taux (0,10 / 0,20)
  //  marge € = PV HT − coût ; taux = marge / PV HT ; coef = PV HT / coût
  // ==========================================================
  function pvHT(p) { return p.pv / (1 + p.tva); }
  function margeAuto(p) { return pvHT(p) - p.cout; }
  function tauxMargeEur(prixHT, cout) { return prixHT > 0 ? (prixHT - cout) / prixHT : 0; }
  function tauxMarge(p) { return tauxMargeEur(pvHT(p), p.cout); }
  function coef(p) { return p.cout > 0 ? pvHT(p) / p.cout : 0; }
  function objectifCoef(p) { return p.tva === 0.2 ? COEF_CIBLE_ALCOOL : COEF_CIBLE_CUISINE; }

  // Un produit est « sous objectif » avec la même règle que l'écran
  // d'administration de l'application : coefficient faible ET marge faible.
  function sousObjectif(p) {
    return p.cout > 0 && coef(p) < objectifCoef(p) * SEUIL_COEFF && margeAuto(p) < SEUIL_MARGE;
  }

  /** Prix TTC nécessaire pour atteindre une marge cible fixée à la main. */
  function prixPourMargeCible(p) {
    if (!p.margeManuelle) return null;
    var mm = p.margeManuelle, ht;
    if (mm.unite === 'taux') {
      if (!(mm.valeur > 0 && mm.valeur < 100)) return null;
      ht = p.cout / (1 - mm.valeur / 100);
    } else {
      if (!(mm.valeur > 0)) return null;
      ht = p.cout + mm.valeur;
    }
    return arrondi10(ht * (1 + p.tva));
  }

  function libelleCible(p) {
    var mm = p.margeManuelle;
    if (!mm) return '';
    return mm.unite === 'taux' ? pct(mm.valeur / 100) : eur(mm.valeur) + ' HT';
  }

  // ==========================================================
  //  Persistance locale + synchronisation entre tablettes
  // ==========================================================
  function sauver() {
    try {
      localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
      localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
      if (CF) localStorage.setItem(CLE_CONFIG, JSON.stringify(CF));
    } catch (e) {
      toast('Espace de stockage insuffisant — photo trop lourde ?');
    }
    majInfoDonnees();
    planifierEnvoi(false);
  }

  function produitNormalise(p, i) {
    return {
      id: String(p.id || ('u' + Date.now().toString(36) + i)),
      type: TYPES[p.type] ? p.type : 'plat',
      fam: String(p.fam || 'Divers'),
      cat: String(p.cat || ''),
      nom: String(p.nom || 'Sans nom'),
      desc: String(p.desc || ''),
      pv: Math.max(0, Number(p.pv) || 0),
      cout: Math.max(0, Number(p.cout) || 0),
      tva: [0.2, 0.1, 0.055].indexOf(Number(p.tva)) >= 0 ? Number(p.tva) : 0.1,
      tvaEmporter: (p.tvaEmporter != null && [0.2, 0.1, 0.055].indexOf(Number(p.tvaEmporter)) >= 0)
        ? Number(p.tvaEmporter) : null,
      actif: p.actif !== false,
      suiviStock: p.suiviStock === true || p.suiviStock === 1 || p.suiviStock === '1',
      stock: Math.max(0, Number(p.stock) || 0),
      stockMini: Math.max(0, Number(p.stockMini) || 0),
      hiboutikId: p.hiboutikId != null ? String(p.hiboutikId).slice(0, 80) : '',
      hiboutikBarcode: typeof p.hiboutikBarcode === 'string' ? p.hiboutikBarcode.slice(0, 80) : '',
      hiboutikStock: p.hiboutikStock != null && isFinite(Number(p.hiboutikStock))
        ? Number(p.hiboutikStock) : null,
      allergenes: (Object.prototype.toString.call(p.allergenes) === '[object Array]')
        ? p.allergenes.filter(function (c) {
            return ALLERGENES.some(function (a) { return a[0] === c; });
          })
        : semencerAllergenes(p),
      formats: (Object.prototype.toString.call(p.formats) === '[object Array]')
        ? p.formats.filter(function (f) {
            return f && (String(f.nom || '').trim() || Number(f.pv) > 0);
          }).map(function (f) {
            return {
              nom: String(f.nom || '').trim().slice(0, 40),
              pv: Math.max(0, Math.round(Number(f.pv) * 100) / 100 || 0),
              cout: Math.max(0, Math.round(Number(f.cout) * 100) / 100 || 0)
            };
          })
        : [],
      photo: typeof p.photo === 'string' && p.photo.indexOf('data:image/') === 0 ? p.photo : null,
      sous: typeof p.sous === 'string' ? p.sous.slice(0, 90) : '',
      photoArdoise: typeof p.photoArdoise === 'string' && p.photoArdoise.indexOf('data:image/') === 0
        ? p.photoArdoise : null,
      margeManuelle: (p.margeManuelle && p.margeManuelle.valeur > 0)
        ? { unite: p.margeManuelle.unite === 'taux' ? 'taux' : 'eur', valeur: Number(p.margeManuelle.valeur) }
        : null
    };
  }

  // Pré-remplissage des allergènes d'après les ingrédients (à vérifier).
  var REGLES_ALG = [
    ['gluten', /pizza|pate|tagliatelle|penne|lasagne|pain|focaccia|bruschetta|crouton|biscuit|speculoos|batonnet|tiramisu/],
    ['crustaces', /crustac|crevette/],
    ['oeufs', /oeuf/],
    ['poissons', /poisson|saumon|anchois|thon/],
    ['arachides', /arachide|cacahuete/],
    ['soja', /soja/],
    ['lactose', /mozzarella|parmesan|burrata|fromage|creme|ricotta|emmental|chevre|pecorino|bechamel|glace|chantilly|mascarpone|bleu|camembert|tiramisu|reblochon/],
    ['fruitsacoque', /noix|noisette|pignon|amande|pistache/],
    ['celeri', /celeri/],
    ['moutarde', /moutarde/],
    ['sesame', /sesame/],
    ['sulfites', /vin|chianti|pinot|prosecco|rose|kir|spritz|pichet|amaretto|limoncello|vermouth|americano/],
    ['lupin', /lupin/],
    ['mollusques', /mollusque|moule|huitre|calamar/]
  ];

  function semencerAllergenes(p) {
    var texte = norm(p.nom + ' ' + p.desc + ' ' + p.cat);
    var trouves = {};
    REGLES_ALG.forEach(function (r) {
      if (r[1].test(texte)) trouves[r[0]] = 1;
    });
    if (p.fam === 'Pizzas' || p.fam === 'Pâtes') trouves.gluten = 1;
    return Object.keys(trouves).filter(function (c) {
      return ALLERGENES.some(function (a) { return a[0] === c; });
    });
  }

  function allergenesInfo(codes) {
    return (codes || []).map(function (c) {
      for (var i = 0; i < ALLERGENES.length; i++)
        if (ALLERGENES[i][0] === c) return ALLERGENES[i];
      return null;
    }).filter(Boolean);
  }

  /** Prix affiché : formats multiples le cas échéant, prix unique sinon. */
  function prixAffiche(p) {
    if (p.formats && p.formats.length) {
      var min = Infinity;
      p.formats.forEach(function (f) { if (f.pv > 0 && f.pv < min) min = f.pv; });
      if (min < Infinity) return 'dès ' + eur(min);
    }
    return eur(p.pv);
  }

  /** TVA effective à l'emporté (dédiée, sinon celle de salle). */
  function tvaEmporterEff(p) { return p.tvaEmporter != null ? p.tvaEmporter : p.tva; }
  function margeEmporter(p) { return p.pv / (1 + tvaEmporterEff(p)) - p.cout; }

  function parId(id) {
    for (var i = 0; i < CARTE.length; i++) if (CARTE[i].id === id) return CARTE[i];
    return null;
  }

  function stockProduit(p) {
    if (p.hiboutikStock != null) return Number(p.hiboutikStock);
    return p.suiviStock ? Number(p.stock) || 0 : null;
  }

  function produitDisponible(p) {
    var qte = stockProduit(p);
    return qte == null || qte > 0;
  }

  function libelleStock(p) {
    var qte = stockProduit(p);
    if (qte == null) return 'stock non suivi';
    return (qte > 0 ? 'disponible' : 'épuisé') + ' · ' + qte.toLocaleString('fr-FR') +
      (p.hiboutikStock != null ? ' Hiboutik' : ' local');
  }

  /** Sélection automatique proposée à la création d'une carte du jour. */
  function semencesPour(cle) {
    var ids = [];
    CARTE.forEach(function (p) {
      if (!p.actif || !produitDisponible(p)) return;
      if (cle === 'plats' && (p.type === 'plat' || p.type === 'formule')) ids.push(p.id);
      if (cle === 'bieres' && p.type === 'boisson' && norm(p.cat).indexOf('biere') >= 0) ids.push(p.id);
      if (cle === 'desserts' && norm(p.fam).indexOf('dessert') >= 0) ids.push(p.id);
    });
    return ids;
  }

  function ardoisesDefaut() {
    var a = {};
    Object.keys(ARDOISE_DEFS).forEach(function (cle) {
      a[cle] = {
        titre: ARDOISE_DEFS[cle].titre,
        sous: ARDOISE_DEFS[cle].sous,
        selection: semencesPour(cle),
        libres: []
      };
    });
    return a;
  }

  function ardoiseNormalisee(a, cle) {
    var def = ARDOISE_DEFS[cle];
    var out = { titre: def.titre, sous: def.sous, selection: [], libres: [] };
    if (!a || typeof a !== 'object') return out;
    if (typeof a.titre === 'string' && a.titre.trim()) out.titre = a.titre.slice(0, 80);
    if (typeof a.sous === 'string' && a.sous.trim()) out.sous = a.sous.slice(0, 120);
    if (Object.prototype.toString.call(a.selection) === '[object Array]') {
      a.selection.forEach(function (id) {
        id = String(id);
        if (parId(id) && out.selection.indexOf(id) < 0) out.selection.push(id);
      });
    }
    if (Object.prototype.toString.call(a.libres) === '[object Array]') {
      a.libres.forEach(function (l) {
        if (l && l.nom) out.libres.push({
          nom: String(l.nom).slice(0, 80),
          desc: String(l.desc || '').slice(0, 160),
          prix: Math.max(0, Number(l.prix) || 0)
        });
      });
    }
    return out;
  }

  function ardoisesToutesNormalisees(a) {
    var out = ardoisesDefaut();
    if (a && typeof a === 'object') {
      Object.keys(ARDOISE_DEFS).forEach(function (cle) {
        if (a[cle]) out[cle] = ardoiseNormalisee(a[cle], cle);
      });
    }
    return out;
  }

  // ==========================================================
  //  Ardoise — carte principale (titres, sous-titres, lignes,
  //  photos, en-tête « fait maison », QR du site)
  // ==========================================================

  // Liste ordonnée des catégories (= familles) présentes au catalogue.
  function famsCatalogue() {
    var vu = {}, out = [];
    CARTE.forEach(function (p) {
      var f = String(p.fam || 'Divers');
      if (!vu[f]) { vu[f] = true; out.push(f); }
    });
    return out;
  }

  function configDefaut() {
    var d = window.TRATTORIA_CONFIG_DEFAUT || {};
    var fams = {};
    famsCatalogue().forEach(function (f) {
      var def = (d.fams && d.fams[f]) || {};
      fams[f] = {
        titre: def.titre || f,
        sous: def.sous || '',
        ordre: CARTE.filter(function (p) { return String(p.fam) === f; })
          .map(function (p) { return p.id; }),
        exclus: [],
        libres: []
      };
    });
    return {
      site: d.site || 'https://latrattoria-saintes.fr/',
      badges: (d.badges || []).slice(0, 4),
      pates: {
        titre: (d.pates && d.pates.titre) || 'Pâte à pizza maison',
        sous: (d.pates && d.pates.sous) || 'Fraîche, maturée 48 heures'
      },
      fams: fams,
      extras: extrasDefaut(),
      moment: (function () {
        var m = {};
        MOMENT_ORDRE.forEach(function (cle) { m[cle] = momentConfDefaut(cle); });
        return m;
      })()
    };
  }

  function configNormalisee(c) {
    var def = configDefaut();
    if (!c || typeof c !== 'object') return def;
    var out = {
      site: String(c.site || '').trim() || def.site,
      badges: (Object.prototype.toString.call(c.badges) === '[object Array]')
        ? c.badges.filter(function (b) { return typeof b === 'string' && b.trim(); })
          .map(function (b) { return b.trim().slice(0, 40); }).slice(0, 4)
        : def.badges,
      pates: {
        titre: String((c.pates && c.pates.titre) || '').trim().slice(0, 60) || def.pates.titre,
        sous: String((c.pates && c.pates.sous) || '').trim().slice(0, 120) || def.pates.sous
      },
      fams: {},
      extras: {},
      moment: {}
    };
    famsCatalogue().forEach(function (f) {
      var src = (c.fams && c.fams[f]) || def.fams[f] || {};
      var presents = CARTE.filter(function (p) { return String(p.fam) === f; })
        .map(function (p) { return p.id; });
      var exclus = (Object.prototype.toString.call(src.exclus) === '[object Array]')
        ? src.exclus.map(String).filter(function (id) { return presents.indexOf(id) >= 0; }) : [];
      var ordre = (Object.prototype.toString.call(src.ordre) === '[object Array]')
        ? src.ordre.filter(function (id) { return presents.indexOf(id) >= 0 && exclus.indexOf(id) < 0; })
        : [];
      presents.forEach(function (id) { if (exclus.indexOf(id) < 0 && ordre.indexOf(id) < 0) ordre.push(id); });
      var libres = (Object.prototype.toString.call(src.libres) === '[object Array]')
        ? src.libres.slice(0, 30).map(function (l, i) {
            if (!l || typeof l !== 'object') return null;
            var nom = String(l.nom || '').trim().slice(0, 60);
            if (!nom) return null;
            return {
              id: String(l.id || ('l' + Date.now().toString(36) + i)).slice(0, 24),
              nom: nom,
              sous: String(l.sous || '').trim().slice(0, 90),
              desc: String(l.desc || '').trim().slice(0, 200),
              prix: Math.max(0, Math.round(Number(l.prix) * 100) / 100 || 0),
              allergenes: allergenesLibres(l.allergenes || l.alg)
            };
          }).filter(Boolean)
        : [];
      out.fams[f] = {
        titre: String(src.titre || '').trim().slice(0, 60) || (def.fams[f] ? def.fams[f].titre : f),
        sous: String(src.sous || '').trim().slice(0, 120),
        ordre: ordre,
        exclus: exclus,
        libres: libres
      };
    });
    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle]);
    });
    MOMENT_ORDRE.forEach(function (cle) {
      var confMo = (c.moment && typeof c.moment === 'object') ? c.moment[cle] : null;
      out.moment[cle] = momentConfNormalisee(confMo, cle);
    });
    return out;
  }

  function configCharger() {
    var brut = null;
    try { brut = JSON.parse(localStorage.getItem(CLE_CONFIG) || 'null'); } catch (e) { }
    CF = configNormalisee(brut);
  }

  // Items d'une catégorie, dans l'ordre édité : produits et lignes libres.
  function itemsFamille(fam) {
    var conf = CF.fams[fam] || { ordre: [], libres: [] };
    var libres = {};
    conf.libres.forEach(function (l) { libres[l.id] = l; });
    return (conf.ordre || []).map(function (id) {
      if (libres[id]) return { kind: 'l', l: libres[id] };
      var p = parId(id);
      return (p && String(p.fam) === fam) ? { kind: 'p', p: p } : null;
    }).filter(Boolean);
  }

  function photoArdoiseDe(p) {
    return p ? (p.photoArdoise || p.photo || null) : null;
  }

  // Illustration déjà générée pour la famille de produit. Les photos
  // choisies dans l'éditeur restent prioritaires ; sinon on réutilise les
  // illustrations craie embarquées dans ardoise-assets.js. Ainsi un produit
  // ajouté par l'administrateur apparaît immédiatement avec le visuel de sa
  // famille, sans fabriquer ni substituer une image générique.
  function illustrationProduit(p) {
    var explicite = photoArdoiseDe(p);
    if (explicite) return explicite;
    var assets = (window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.moment) || {};
    var texte = norm((p && p.type || '') + ' ' + (p && p.fam || '') + ' ' +
      (p && p.cat || '') + ' ' + (p && p.nom || ''));
    var cle = 'plats';
    if (/glace|sorbet|angelys/.test(texte)) cle = 'glaces';
    else if (/dessert|tiramisu|panna|cafe gourmand/.test(texte)) cle = 'desserts';
    else if (/biere|peroni|moretti|pression/.test(texte)) cle = 'bieres';
    else if (/vin|cave|prosecco|chianti|pinot|rose de provence/.test(texte)) cle = 'vins';
    else if (/formule|menu/.test(texte)) cle = 'formules';
    else if (/boisson|cocktail|aperitif|sans alcool|limonade|eau |coca|jus /.test(texte)) cle = 'boissons';
    return assets[cle] || assets.plats || null;
  }

  // ---------- rendu HTML de l'ardoise (aperçu, impression, public) ----------
  var CRAIE_CLASSES = ['craie--jaune', 'craie--blanc', 'craie--rose', 'craie--verte', 'craie--bleue'];

  function htmlArdoise(cfg) {
    var logo = (window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.logo) || '';
    var h = '<div class="cadreBois">';
    h += '<header class="enteteArdoise">' +
      '<img class="logoCercle" alt="Logo La Trattoria" src="' + logo + '">' +
      '<h1 class="craie--blanc">La Trattoria</h1>' +
      '<div class="lieu craie--jaune">Saintes</div>' +
      '<div class="filetCraie"></div>';
    if (cfg.badges.length) {
      h += '<div class="badgesCraie">' + cfg.badges.map(function (b) {
        return '<span class="craie--verte">' + echap(b) + '</span>';
      }).join('') + '</div>';
    }
    h += '<div class="pateCraie"><span class="t craie--jaune">🍕 ' +
      echap(cfg.pates.titre) + '</span><span class="s craie--blanc">' +
      echap(cfg.pates.sous) + '</span></div>';
    h += '</header>';

    CPT_CRAIE = 0;
    var dansExtras = idsDansExtras();
    famsCatalogue().forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam).filter(function (it) {
        if (it.kind === 'p') {
          if (!it.p.actif) return false;
          if (dansExtras[it.p.id]) return false; // déjà dans une carte dédiée
        }
        return true;
      });
      if (!items.length) return;
      h += htmlCategorieArdoise(conf.titre, conf.sous, items);
    });

    // cartes additionnelles : formules, vins, glaces, bières
    h += htmlArdoiseExtras(cfg);

    // bloc QR : accès direct au site
    h += '<div class="qrBlocArdoise">' +
      '<div class="t craie--blanc">Retrouvez-nous en ligne</div>' +
      '<span class="s">Scannez pour ouvrir le site, la carte et commander</span>' +
      '<div class="qrCraie"><canvas id="qr-ardoise" aria-label="QR code du site"></canvas></div>' +
      '<span class="url craie--jaune">' + echap(cfg.site) + '</span></div>';
    h += '<div class="piedArdoise">La Trattoria — 15 rue de la Poste, 17100 Saintes — 06 27 21 31 90' +
      '<span class="coords">SIRET 106 050 263 00016 · Tout est fait maison, dans la plus belle tradition italienne.</span></div>';
    h += '</div>';
    return h;
  }

  function dessinerQRDans(canvas, texte, px) {
    if (!canvas || !window.TrattoriaQR) return;
    var url = String(texte || '').trim();
    if (url && url.indexOf('://') < 0) url = 'https://' + url;
    var m = window.TrattoriaQR.makeMatrix(url, 'H');
    if (!m) { canvas.width = 1; canvas.height = 1; return; }
    window.TrattoriaQR.render(canvas, m, px || 512);
  }

  // ---------- overlay plein écran (aperçu + impression) ----------
  function fermerArdoise() {
    var ov = document.getElementById('ardoise-overlay');
    if (ov) ov.remove();
    document.body.classList.remove('impression-ardoise');
    document.body.style.overflow = '';
  }

  function ouvrirArdoise() {
    fermerArdoise();
    var ov = document.createElement('div');
    ov.id = 'ardoise-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Aperçu de l\'ardoise');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;' +
      'background:rgba(10,14,12,.82);padding:14px;';
    ov.innerHTML =
      '<div class="sansImpression" style="max-width:1080px;margin:0 auto 12px;' +
        'display:flex;gap:10px;justify-content:flex-end;align-items:center;">' +
        '<span style="color:#F3F1E7;font-family:Georgia,serif;font-size:14px;' +
          'margin-right:auto;">Aperçu de l\'ardoise — telle que les clients la verront</span>' +
        '<button type="button" id="btn-ardoise-imprimer" class="btn btn-s">🖨 Imprimer / PDF</button>' +
        '<button type="button" id="btn-ardoise-fermer" class="btn btn-s">Fermer</button>' +
      '</div>' +
      '<div id="ardoise-page" class="fondArdoise" style="border-radius:6px;">' +
        htmlArdoise(CF) + '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    dessinerQRDans(ov.querySelector('#qr-ardoise'), CF.site, 512);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) fermerArdoise();
      if (e.target.closest('#btn-ardoise-fermer')) fermerArdoise();
      if (e.target.closest('#btn-ardoise-imprimer')) {
        document.body.classList.add('impression-ardoise');
        window.print();
        setTimeout(function () { document.body.classList.remove('impression-ardoise'); }, 400);
      }
    });
    document.addEventListener('keydown', ardoiseEchap);
  }

  function ardoiseEchap(e) {
    if (e.key === 'Escape') {
      fermerArdoise();
      document.removeEventListener('keydown', ardoiseEchap);
    }
  }

  // ---------- éditeur de l'ardoise (écran « Ardoise & QR ») ----------
  function dessinerCF() {
    var hote = $('#liste-cf');
    if (!hote || !CF) return;
    var h = '';
    var dansEx = idsDansExtras();
    famsCatalogue().forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam).filter(function (it) {
        return it.kind === 'l' || !dansEx[it.p.id];
      });
      var nPhotos = items.filter(function (it) {
        return it.kind === 'p' && photoArdoiseDe(it.p);
      }).length;
      h += '<div class="cf-fam carte-bloc" data-fam="' + echap(fam) + '">' +
        '<div class="cf-tete">' +
          '<div><b>' + echap(conf.titre) + '</b>' +
          '<span class="cf-meta">' + echap(fam) + ' · ' + items.length + ' ligne' +
          (items.length > 1 ? 's' : '') + (nPhotos ? ' · ' + nPhotos + ' photo' + (nPhotos > 1 ? 's' : '') : '') +
          '</span></div>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-s btn-mini" data-cf="titre">✏️ Titre &amp; sous-titre</button>' +
            '<button type="button" class="btn btn-s btn-mini" data-cf="ligne">+ Ligne libre</button>' +
          '</span>' +
        '</div>' +
        '<div class="cf-edition-titre" hidden>' +
          '<label class="champ"><span>Titre affiché</span>' +
          '<input type="text" data-cf-champ="titre" maxlength="60" value="' + echap(conf.titre) + '"></label>' +
          '<label class="champ"><span>Sous-titre de la catégorie</span>' +
          '<input type="text" data-cf-champ="sous" maxlength="120" value="' + echap(conf.sous) + '" ' +
          'placeholder="Ex. : pâte maturée 48 h, cuisson au feu de bois"></label>' +
          '<div class="cf-rangee"><button type="button" class="btn btn-p btn-mini" data-cf="titre-ok">Enregistrer</button>' +
          '<button type="button" class="btn btn-s btn-mini" data-cf="titre-annule">Annuler</button></div>' +
        '</div>' +
        '<ol class="cf-lignes">';
      items.forEach(function (it, i) {
        var premier = i === 0, dernier = i === items.length - 1;
        if (it.kind === 'p') {
          var p = it.p;
          var aPhoto = !!photoArdoiseDe(p);
          h += '<li class="cf-ligne' + (p.actif ? '' : ' cf-inactif') + '" data-cf-id="' + echap(p.id) + '">' +
            '<span class="cf-ordre">' +
              '<button type="button" class="btn btn-mini" data-cf="monter" aria-label="Monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
              '<button type="button" class="btn btn-mini" data-cf="descendre" aria-label="Descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
            '</span>' +
            '<span class="cf-nom">' + echap(p.nom) +
              (p.sous ? '<small>' + echap(p.sous) + '</small>' : '') +
              (!p.actif ? '<small class="cf-off">masqué de la carte</small>' : '') +
            '</span>' +
            '<span class="cf-prix">' + prixAffiche(p) + '</span>' +
            '<span class="cf-actions">' +
              '<button type="button" class="btn btn-mini" data-cf="photo" title="Photo pour l\'ardoise">' +
                (aPhoto ? '🖼️' : '📷') + '</button>' +
              '<button type="button" class="btn btn-mini" data-cf="editer" title="Modifier le produit">✏️</button>' +
            '</span></li>';
        } else {
          var l = it.l;
          h += '<li class="cf-ligne cf-libre" data-cf-id="' + echap(l.id) + '">' +
            '<span class="cf-ordre">' +
              '<button type="button" class="btn btn-mini" data-cf="monter" aria-label="Monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
              '<button type="button" class="btn btn-mini" data-cf="descendre" aria-label="Descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
            '</span>' +
            '<span class="cf-nom">' + echap(l.nom) +
              '<small class="cf-badge">ligne libre</small>' +
              (l.sous ? '<small>' + echap(l.sous) + '</small>' : '') +
            '</span>' +
            '<span class="cf-prix">' + (l.prix > 0 ? eur(l.prix) : '—') + '</span>' +
            '<span class="cf-actions">' +
              '<button type="button" class="btn btn-mini" data-cf="libre-editer" title="Modifier">✏️</button>' +
              '<button type="button" class="btn btn-mini" data-cf="libre-supprimer" title="Supprimer">✕</button>' +
            '</span></li>';
        }
      });
      h += '</ol></div>';
    });
    hote.innerHTML = h;
    dessinerCFExtras();
    if (LIGNE_A_EDITER && ECRAN === 'ardoise') ouvrirEditeurDiffere(hote);
  }

  // Ouvre l'éditeur de la ligne libre posée dans LIGNE_A_EDITER (et consomme).
  function ouvrirEditeurDiffere(hote) {
    if (!LIGNE_A_EDITER || !hote) return;
    var liE = hote.querySelector('li[data-cf-id="' + LIGNE_A_EDITER + '"]');
    var cardE = liE && liE.closest('.cf-fam');
    if (liE && cardE) editerLigneLibre(cardE, LIGNE_A_EDITER);
    LIGNE_A_EDITER = null;
  }

  function montrerEditionTitre(card, on) {
    var zone = $('.cf-edition-titre', card);
    if (zone) zone.hidden = !on;
    if (on) $('input[data-cf-champ="titre"]', zone).focus();
  }

  function enregistrerTitreFamille(card) {
    var conf = confDeCarte(card);
    if (!conf) return;
    var fam = card.getAttribute('data-fam') || 'Divers';
    conf.titre = String($('[data-cf-champ="titre"]', card).value || '').trim().slice(0, 60) || fam;
    conf.sous = String($('[data-cf-champ="sous"]', card).value || '').trim().slice(0, 120);
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
    toast('Catégorie mise à jour : ' + conf.titre);
  }

  function deplacerLigneCF(card, id, delta) {
    var conf = confDeCarte(card);
    if (!conf) return;
    var ordre = conf.ordre;
    var i = ordre.indexOf(id);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= ordre.length) return;
    var tmp = ordre[i]; ordre[i] = ordre[j]; ordre[j] = tmp;
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
  }

  function ajouterLigneLibre(card) {
    var conf = confDeCarte(card);
    if (!conf) return;
    if (conf.libres.length >= 30) { toast('Maximum 30 lignes libres par catégorie'); return; }
    var l = {
      id: 'l' + Date.now().toString(36),
      nom: 'Nouvelle ligne', sous: '', desc: '', prix: 0, allergenes: []
    };
    conf.libres.push(l);
    conf.ordre.push(l.id);
    LIGNE_A_EDITER = l.id;
    LF_A_EDITER = null;
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
  }

  function editerLigneLibre(card, id) {
    var conf = confDeCarte(card);
    var l = conf && conf.libres.filter(function (x) { return x.id === id; })[0];
    var li = card.querySelector('li[data-cf-id="' + id + '"]');
    if (!l || !li) return;
    li.innerHTML =
      '<div class="cf-libre-form">' +
        '<input type="text" data-cf-l="nom" maxlength="60" value="' + echap(l.nom) + '" placeholder="Nom (ex. : Menu enfant)">' +
        '<input type="text" data-cf-l="sous" maxlength="90" value="' + echap(l.sous) + '" placeholder="Sous-titre (facultatif)">' +
        '<input type="text" data-cf-l="desc" maxlength="200" value="' + echap(l.desc) + '" placeholder="Descriptif vendeur (facultatif)">' +
        '<input type="text" data-cf-l="allergenes" maxlength="180" value="' + echap((l.allergenes || []).join(', ')) + '" placeholder="Allergènes : gluten, lactose…">' +
        '<input type="text" data-cf-l="prix" inputmode="decimal" value="' +
          (l.prix > 0 ? String(l.prix).replace('.', ',') : '') + '" placeholder="Prix €">' +
        '<button type="button" class="btn btn-p btn-mini" data-cf="libre-ok">OK</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="libre-annule">Annuler</button>' +
      '</div>';
    $('input[data-cf-l="nom"]', li).focus();
  }

  function enregistrerLigneLibre(card, id) {
    var conf = confDeCarte(card);
    var l = conf && conf.libres.filter(function (x) { return x.id === id; })[0];
    var li = card.querySelector('li[data-cf-id="' + id + '"]');
    if (!l || !li) return;
    var nom = String($('[data-cf-l="nom"]', li).value || '').trim();
    if (!nom) { toast('Le nom de la ligne est obligatoire'); return; }
    l.nom = nom.slice(0, 60);
    l.sous = String($('[data-cf-l="sous"]', li).value || '').trim().slice(0, 90);
    l.desc = String($('[data-cf-l="desc"]', li).value || '').trim().slice(0, 200);
    l.allergenes = allergenesLibres($('[data-cf-l="allergenes"]', li).value || '');
    l.prix = Math.max(0, Math.round((parseFloat(String($('[data-cf-l="prix"]', li).value).replace(',', '.')) || 0) * 100) / 100);
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
    toast('Ligne enregistrée');
  }

  function supprimerLigneLibre(card, id) {
    var conf = confDeCarte(card);
    if (!conf) return;
    var l = conf.libres.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    if (!confirm('Supprimer la ligne libre « ' + l.nom + ' » ?')) return;
    conf.libres = conf.libres.filter(function (x) { return x.id !== id; });
    conf.ordre = conf.ordre.filter(function (x) { return x !== id; });
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
    toast('Ligne supprimée');
  }

  // Clics dans l'écran ardoise (délégation) — renvoie true si traité.
  function clicArdoise(t) {
    var card = t.closest('.cf-fam');
    if (!card) return false;
    var li = t.closest('li[data-cf-id]');
    var id = li ? li.dataset.cfId : null;
    var act = t.closest('[data-cf]');
    if (!act) return false;
    var a = act.dataset.cf;
    if (a === 'titre') { montrerEditionTitre(card, true); return true; }
    if (a === 'titre-annule') { montrerEditionTitre(card, false); return true; }
    if (a === 'titre-ok') { enregistrerTitreFamille(card); return true; }
    if (a === 'ligne') { ajouterLigneLibre(card); return true; }
    if (a === 'produit' && card.dataset.ex) { ouvrirCueilletteExtra(card.dataset.ex); return true; }
    if (a === 'monter' && id) { deplacerLigneCF(card, id, -1); return true; }
    if (a === 'descendre' && id) { deplacerLigneCF(card, id, +1); return true; }
    if (a === 'photo' && id) { CIBLE_PHOTO_ARDOISE = id; $('#champ-photo-ardoise').click(); return true; }
    if (a === 'editer' && id) { ouvrirFiche(id); return true; }
    if (a === 'libre-editer' && id) { editerLigneLibre(card, id); return true; }
    if (a === 'libre-ok' && id) { enregistrerLigneLibre(card, id); return true; }
    if (a === 'libre-annule' && id) { dessinerCF(); return true; }
    if (a === 'libre-supprimer' && id) { supprimerLigneLibre(card, id); return true; }
    return false;
  }

  // Clics de l'onglet « La carte » : vues + édition en place.
  function clicCarteStandard(t) {
    if (ECRAN !== 'carte') return false;
    var saut = t.closest('[data-cv-saut]');
    if (saut) { montrer(saut.getAttribute('data-cv-saut')); return true; }
    if (t.closest('[data-cv-imprimer]') || t.closest('[data-standard-preview]')) { ouvrirImpressionCarte(); return true; }
    if (t.closest('[data-standard-formules]')) {
      CARTE_VIEW = 'formules';
      $$('.cv').forEach(function (b) { var on = b.dataset.cv === CARTE_VIEW; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      dessinerCarte();
      return true;
    }
    var cv = t.closest('.cv[data-cv]');
    if (cv) {
      CARTE_VIEW = cv.dataset.cv;
      $$('.cv').forEach(function (b) {
        var on = b === cv;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      dessinerCarte();
      return true;
    }
    var section = t.closest('.famille[data-fam]');
    if (!section) return false;
    var fam = section.dataset.fam;
    // Ouvrir directement la fiche depuis chaque ligne de la carte générale.
    // Ce traitement prioritaire évite toute dépendance à un autre écran.
    var productEdit = t.closest('[data-editer]');
    if (productEdit) {
      ouvrirFiche(productEdit.getAttribute('data-editer'));
      return true;
    }
    var confF = CF && CF.fams[fam];
    if (!confF) return false;
    if (t.closest('[data-fam-edit]')) {
      var zone = $('.fam-edit', section);
      if (zone) { zone.hidden = false; $('input[data-fe="titre"]', zone).focus(); }
      return true;
    }
    if (t.closest('[data-fam-annule]')) {
      var zone2 = $('.fam-edit', section);
      if (zone2) zone2.hidden = true;
      return true;
    }
    if (t.closest('[data-fam-ok]')) {
      confF.titre = String($('[data-fe="titre"]', section).value || '').trim().slice(0, 60) || fam;
      confF.sous = String($('[data-fe="sous"]', section).value || '').trim().slice(0, 120);
      sauver(); dessinerCF(); dessinerCarte();
      toast('Catégorie mise à jour : ' + confF.titre);
      return true;
    }
    if (t.closest('[data-fam-ligne]')) {
      if (confF.libres.length >= 30) { toast('Maximum 30 lignes libres par catégorie'); return true; }
      var ln = { id: 'l' + Date.now().toString(36), nom: 'Nouvelle ligne', sous: '', desc: '', prix: 0 };
      confF.libres.push(ln);
      confF.ordre.push(ln.id);
      LF_A_EDITER = { fam: fam, id: ln.id };
      sauver(); dessinerCF(); dessinerCarte();
      return true;
    }
    var reintegrer = t.closest('[data-standard-reintegrer]');
    if (reintegrer) {
      var reinSection = reintegrer.closest('.famille[data-fam]');
      var reinConf = reinSection && CF.fams[reinSection.dataset.fam];
      var reinSelect = reinSection && $('[data-standard-reintegrer-select]', reinSection);
      var reinId = reinSelect && reinSelect.value;
      if (reinConf && reinId) {
        reinConf.exclus = (reinConf.exclus || []).filter(function (id) { return id !== reinId; });
        if (reinConf.ordre.indexOf(reinId) < 0) reinConf.ordre.push(reinId);
        sauver(); dessinerStandardStructure(); dessinerCarte();
        toast('Ligne réintégrée dans la carte standard');
      }
      return true;
    }
    var removeStandard = t.closest('[data-standard-remove]');
    if (removeStandard) {
      var removeId = removeStandard.getAttribute('data-standard-remove');
      if (confF.ordre.indexOf(removeId) >= 0) confF.ordre = confF.ordre.filter(function (id) { return id !== removeId; });
      confF.exclus = confF.exclus || [];
      if (confF.exclus.indexOf(removeId) < 0) confF.exclus.push(removeId);
      sauver(); dessinerStandardStructure(); dessinerCarte();
      toast('Ligne retirée de la carte standard');
      return true;
    }
    var orderButton = t.closest('[data-standard-order]');
    if (orderButton) {
      var moveId = orderButton.getAttribute('data-standard-id');
      var order = confF.ordre || [];
      var pos = order.indexOf(moveId);
      if (pos < 0) { order.push(moveId); pos = order.length - 1; }
      var target = orderButton.getAttribute('data-standard-order') === 'up' ? pos - 1 : pos + 1;
      if (target >= 0 && target < order.length) {
        var tmp = order[pos]; order[pos] = order[target]; order[target] = tmp;
        confF.ordre = order; sauver(); dessinerCarte();
      }
      return true;
    }
    var lfEdit = t.closest('[data-lf-edit]');
    if (lfEdit) {
      LF_A_EDITER = { fam: fam, id: lfEdit.getAttribute('data-lf-edit') };
      dessinerCarte();
      return true;
    }
    if (t.closest('[data-lf-annule]')) { LF_A_EDITER = null; dessinerCarte(); return true; }
    var lfOk = t.closest('[data-lf-ok]');
    if (lfOk) {
      var idOk = lfOk.getAttribute('data-lf-ok');
      var lOk = confF.libres.filter(function (x) { return x.id === idOk; })[0];
      if (lOk) {
        var nomOk = String($('[data-lf-champ="nom"]', section).value || '').trim();
        if (!nomOk) { toast('Le nom de la ligne est obligatoire'); return true; }
        lOk.nom = nomOk.slice(0, 60);
        lOk.sous = String($('[data-lf-champ="sous"]', section).value || '').trim().slice(0, 90);
        lOk.desc = String($('[data-lf-champ="desc"]', section).value || '').trim().slice(0, 200);
        lOk.allergenes = allergenesLibres($('[data-lf-champ="allergenes"]', section).value || '');
        lOk.prix = Math.max(0, Math.round(
          (parseFloat(String($('[data-lf-champ="prix"]', section).value).replace(',', '.')) || 0) * 100) / 100);
        LF_A_EDITER = null;
        sauver(); dessinerCF(); dessinerCarte();
        toast('Ligne enregistrée');
      }
      return true;
    }
    var lfDel = t.closest('[data-lf-del]');
    if (lfDel) {
      var idDel = lfDel.getAttribute('data-lf-del');
      var lDel = confF.libres.filter(function (x) { return x.id === idDel; })[0];
      if (lDel && confirm('Supprimer la ligne libre « ' + lDel.nom + ' » ?')) {
        confF.libres = confF.libres.filter(function (x) { return x.id !== idDel; });
        confF.ordre = confF.ordre.filter(function (x) { return x !== idDel; });
        sauver(); dessinerCF(); dessinerCarte();
        toast('Ligne supprimée');
      }
      return true;
    }
    return false;
  }

  // ---------- carte standard imprimable : sections éditées + compactes ----------
  // La carte imprimée est toujours recalculée depuis le catalogue et CF :
  // aucune fiche HTML statique ne peut donc écraser les prix ou les titres
  // modifiés par l'administrateur.
  var STANDARD_SECTIONS = [
    { id: 'entrees', fam: 'Entrées', titre: 'À partager', texte: 'Focaccia, bruschettas et bouchées italiennes préparées maison.' },
    { id: 'salades', fam: 'Salades', titre: 'Salades fraîches', texte: 'Des assiettes colorées, préparées minute avec les produits de saison.' },
    { id: 'pizzas', fam: 'Pizzas', titre: 'Pizzas au feu de bois', texte: 'Pâte maison maturée 48 heures, garnitures choisies chaque matin.' },
    { id: 'plats', fam: 'Pâtes', titre: 'Plats', texte: 'Pâtes fraîches, recettes généreuses et sauces mijotées chaque matin.' },
    { id: 'desserts', fam: 'Desserts', titre: 'Desserts maison', texte: 'Tiramisus et douceurs italiennes préparés dans notre cuisine.' },
    { id: 'glaces', fam: 'Desserts', titre: 'Glaces artisanales', texte: 'Une fin fraîche et gourmande, avec nos glaces et sorbets.' }
  ];

  function standardSectionItems(def) {
    var items = itemsFamille(def.fam).filter(function (it) {
      if (def.id === 'glaces' || def.id === 'desserts') {
        if (it.kind !== 'p') return def.id === 'desserts';
        var glace = norm((it.p.cat || '') + ' ' + (it.p.nom || '')).indexOf('glace') >= 0 ||
          norm(it.p.cat || '').indexOf('sorbet') >= 0;
        return def.id === 'glaces' ? glace : !glace;
      }
      return true;
    });
    // Les lignes libres de la carte des glaces sont également imprimables.
    if (def.id === 'glaces' && CF && CF.extras && CF.extras.glaces) {
      items = items.concat(itemsExtra('glaces').filter(function (it) { return it.kind === 'l'; }));
    }
    return items.filter(function (it) { return it.kind === 'l' || it.p.actif; });
  }

  function standardSections() {
    var sections = [];
    var famillesUtilisees = {};
    // Les formules sont volontairement la première rubrique de la première
    // page : elles sont une offre commerciale, pas une carte annexe oubliée.
    if (CF && CF.extras && CF.extras.formules) {
      var formules = itemsExtra('formules').filter(function (it) {
        return it.kind === 'l' || it.p.actif;
      });
      sections.push({
        id: 'formules',
        titre: CF.extras.formules.titre || 'Nos formules',
        sous: CF.extras.formules.sous || 'Menus et formules du moment',
        items: formules
      });
    }
    STANDARD_SECTIONS.forEach(function (def) {
      var conf = CF && CF.fams[def.fam];
      var items = standardSectionItems(def);
      // Les catégories et sous-titres restent modifiables depuis
      // « Ardoise & QR » ; ils sont repris ici dans la carte standard.
      sections.push({
        id: def.id,
        titre: def.id === 'glaces' ? (CF.extras.glaces.titre || def.titre) :
          (conf && conf.titre ? conf.titre : def.titre),
        sous: def.id === 'glaces' ? (CF.extras.glaces.sous || def.texte) :
          (conf && conf.sous ? conf.sous : def.texte),
        items: items
      });
      famillesUtilisees[def.fam] = true;
    });
    // Boissons, formules et apéritifs restent dans la carte standard :
    // le client retrouve ainsi toute l'offre sans devoir ouvrir une autre
    // fiche imprimable.
    famsCatalogue().forEach(function (fam) {
      if (famillesUtilisees[fam]) return;
      var conf = CF && CF.fams[fam];
      var items = itemsFamille(fam).filter(function (it) {
        if (fam === 'Apéritif' && it.kind === 'p' && it.p.type === 'formule') return false;
        return it.kind === 'l' || it.p.actif;
      });
      if (!items.length) return;
      sections.push({
        id: 'fam-' + norm(fam).replace(/[^a-z0-9]+/g, '-'),
        titre: conf && conf.titre ? conf.titre : fam,
        sous: conf && conf.sous ? conf.sous : 'À découvrir à la Trattoria.',
        items: items
      });
    });
    return sections.filter(function (s) { return s.items.length || ['entrees', 'salades', 'pizzas', 'plats', 'desserts', 'glaces'].indexOf(s.id) >= 0; });
  }

  function htmlAllergenes(liste) {
    return (liste || []).map(function (id) {
      for (var i = 0; i < ALLERGENES.length; i++) {
        if (ALLERGENES[i][0] === id) return ALLERGENES[i][2];
      }
      return '';
    }).join('');
  }

  function htmlStandardSection(section) {
    var firstProduct = null;
    section.items.some(function (it) {
      if (it.kind === 'p') { firstProduct = it.p; return true; }
      return false;
    });
    var illustration = illustrationProduit(firstProduct) ||
      ((window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.moment &&
        window.ARDOISE_ASSETS.moment[section.id === 'glaces' ? 'glaces' : section.id === 'plats' ? 'plats' : section.id]) || '');
    var h = '<section class="a4-cat a4-cat-compact">' +
      '<div class="a4-cat-tete">' +
      (illustration ? '<img class="a4-illustration" alt="" src="' + illustration + '">' : '') +
      '<div><h2>' + echap(section.titre) + '</h2>' +
      '<p class="a4-sous">' + echap(section.sous) + '</p></div></div>' +
      '<ul>';
    section.items.forEach(function (it) {
      if (it.kind === 'l') {
        h += '<li><span class="a4-nom">' + echap(it.l.nom) + '</span>' +
          ((it.l.sous || it.l.desc) ? '<small class="a4-desc-inline">' + echap(it.l.sous || it.l.desc) + '</small>' : '') +
          (it.l.allergenes && it.l.allergenes.length ? '<small class="a4-allergenes" title="Allergènes">' + htmlAllergenes(it.l.allergenes) + '</small>' : '') +
          '<span class="a4-pts"></span><span class="a4-prix">' +
          (it.l.prix > 0 ? eur(it.l.prix) : '') + '</span></li>';
      } else {
        var p = it.p;
        var formats = p.formats && p.formats.length
          ? '<small class="a4-formats">' + p.formats.map(function (f) {
              return echap(f.nom) + ' ' + eur(f.pv);
            }).join(' · ') + '</small>' : '';
        h += '<li><span class="a4-nom">' + echap(p.nom) + '</span>' +
          (p.desc ? '<small class="a4-desc-inline">' + echap(p.desc) + '</small>' : '') +
          (p.allergenes && p.allergenes.length ? '<small class="a4-allergenes" title="Allergènes">' + htmlAllergenes(p.allergenes) + '</small>' : '') +
          '<span class="a4-pts"></span><span class="a4-prix">' + prixAffiche(p) +
          '</span>' + formats + '</li>';
      }
    });
    return h + '</ul></section>';
  }

  function htmlA4Page(nom, sections) {
    return '<div class="a4-page a4-page-' + nom + '">' +
      '<div class="a4-colonne">' + sections.filter(function (_, i) { return i % 2 === 0; }).join('') + '</div>' +
      '<div class="a4-colonne">' + sections.filter(function (_, i) { return i % 2 === 1; }).join('') + '</div>' +
      '</div>';
  }

  // ---------- aperçu / impression A4 de la carte standard ----------
  function fermerImpressionCarte() {
    var ov = document.getElementById('impression-carte-overlay');
    if (ov) ov.remove();
    document.body.classList.remove('impression-carte-a4');
    document.body.style.overflow = '';
  }

  function ouvrirImpressionCarte() {
    fermerImpressionCarte();
    var toutes = standardSections();
    var idsPage1 = ['formules', 'entrees', 'salades', 'pizzas'];
    var page1 = toutes.filter(function (s) { return idsPage1.indexOf(s.id) >= 0; });
    var page2 = toutes.filter(function (s) { return idsPage1.indexOf(s.id) < 0; });
    var sections = htmlA4Page('1', page1.map(htmlStandardSection)) +
      htmlA4Page('2', page2.map(htmlStandardSection));
    var ov = document.createElement('div');
    ov.id = 'impression-carte-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Aperçu A4 de la carte');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;' +
      'background:rgba(10,14,12,.82);padding:14px;';
    ov.innerHTML =
      '<div class="sansImpression" style="max-width:820px;margin:0 auto 12px;' +
        'display:flex;gap:10px;justify-content:flex-end;align-items:center;">' +
        '<span style="color:#F3F1E7;font-family:Georgia,serif;font-size:14px;margin-right:auto;">' +
          'La carte standard — A4, prête à imprimer (données éditées ici)</span>' +
        '<button type="button" id="btn-a4-imprimer" class="btn btn-s">🖨 Imprimer / PDF</button>' +
        '<button type="button" id="btn-a4-fermer" class="btn btn-s">Fermer</button>' +
      '</div>' +
      '<div id="carte-a4" class="carteA4">' +
        '<header class="a4-entete">' +
          '<img class="a4-logo" alt="Logo" src="' +
            ((window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.logo) || '') + '">' +
          '<h1>La Trattoria</h1>' +
          '<p class="a4-lieu">15 rue de la Poste, 17100 Saintes — 06 27 21 31 90</p>' +
          '<p class="a4-promesse">Tout est fait maison · Tout est frais · Bio dès que possible' +
          '<br>Pâte à pizza maison, maturée 48 heures</p>' +
        '</header>' + sections +
        '<footer class="a4-pied">SIRET 106 050 263 00016 · Prix TTC, service compris · ' +
          'latrattoria-saintes.fr</footer>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    ov.addEventListener('click', function (e) {
      if (e.target === ov) fermerImpressionCarte();
      if (e.target.closest('#btn-a4-fermer')) fermerImpressionCarte();
      if (e.target.closest('#btn-a4-imprimer')) {
        document.body.classList.add('impression-carte-a4');
        window.print();
        setTimeout(function () { document.body.classList.remove('impression-carte-a4'); }, 400);
      }
    });
    document.addEventListener('keydown', impressionCarteEchap);
  }

  function impressionCarteEchap(e) {
    if (e.key === 'Escape') {
      fermerImpressionCarte();
      document.removeEventListener('keydown', impressionCarteEchap);
    }
  }

  function dessinerQR() {
    var canvas = $('#apercu-qr');
    var champ = $('#champ-site');
    if (champ && CF && champ.value !== CF.site) champ.value = CF.site;
    dessinerQRDans(canvas, CF ? CF.site : '', 512);
    var aff = $('#qr-url-affichee');
    if (aff && CF) aff.textContent = 'QR actuel : ' + CF.site;
  }

  // ---------- photo d'ardoise (depuis l'écran ardoise) ----------
  var CIBLE_PHOTO_ARDOISE = null;

  function photoArdoiseChoisie(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 640;
        var ratio = Math.min(1, max / Math.max(img.width, img.height));
        var toile = document.createElement('canvas');
        toile.width = Math.max(1, Math.round(img.width * ratio));
        toile.height = Math.max(1, Math.round(img.height * ratio));
        toile.getContext('2d').drawImage(img, 0, 0, toile.width, toile.height);
        var data = toile.toDataURL('image/jpeg', 0.72);
        var p = parId(CIBLE_PHOTO_ARDOISE || EN_EDITION);
        if (p) {
          p.photoArdoise = data;
          PHOTO_ARDOISE_BROUILLON = data;
          majBoutonsPhotoArdoise();
          sauver();
          dessinerCF();
          toast('Photo d\'ardoise ajoutée à « ' + p.nom + ' »');
        }
        CIBLE_PHOTO_ARDOISE = null;
      };
      img.onerror = function () { toast('Image illisible'); CIBLE_PHOTO_ARDOISE = null; };
      img.src = lecteur.result;
    };
    lecteur.onerror = function () { toast('Lecture impossible'); CIBLE_PHOTO_ARDOISE = null; };
    lecteur.readAsDataURL(fichier);
  }


  // ==========================================================
  //  Cartes additionnelles de l'ardoise : Formules, Vins,
  //  Glaces, Bières (produits du catalogue + lignes libres)
  // ==========================================================

  var EXTRA_DEFS = {
    formules: { titre: 'Nos formules',        sous: 'Menus et formules du moment' },
    vins:     { titre: 'La carte des vins',   sous: 'Au pichet et à la bouteille' },
    glaces:   { titre: 'La carte des glaces', sous: 'Glaces et sorbets maison' },
    bieres:   { titre: 'La carte des bières', sous: 'Pression et bouteilles' },
    boissons: { titre: 'La carte des boissons', sous: 'Alcools, vins, bières, softs, eaux, cafés et digestifs' }
  };
  var EXTRA_ORDRE = ['formules', 'vins', 'glaces', 'bieres', 'boissons'];

  // Produits du catalogue placés automatiquement dans une carte.
  function extrasSeed(cle) {
    return CARTE.filter(function (p) {
      if (cle === 'formules') return p.type === 'formule';
      if (cle === 'bieres') return norm(p.cat).indexOf('bier') >= 0;
      if (cle === 'vins') {
        return /vin|cave/i.test(String(p.cat || '')) ||
               /chianti|pinot|prosecco|ros[eé]/i.test(String(p.nom || ''));
      }
      return false;
    }).map(function (p) { return p.id; });
  }

  function allergenesLibres(v) {
    var valeurs = Object.prototype.toString.call(v) === '[object Array]'
      ? v : String(v || '').split(',');
    return valeurs.map(function (token) {
      var t = norm(token).trim();
      for (var i = 0; i < ALLERGENES.length; i++) {
        if (t === ALLERGENES[i][0] || t === norm(ALLERGENES[i][1])) return ALLERGENES[i][0];
      }
      return null;
    }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  }

  function ligneLibreNormalisee(l, i) {
    if (!l || typeof l !== 'object') return null;
    var nom = String(l.nom || '').trim().slice(0, 60);
    if (!nom) return null;
    return {
      id: String(l.id || ('l' + Date.now().toString(36) + i)).slice(0, 24),
      nom: nom,
      sous: String(l.sous || '').trim().slice(0, 90),
      desc: String(l.desc || '').trim().slice(0, 200),
      prix: Math.max(0, Math.round(Number(l.prix) * 100) / 100 || 0),
      allergenes: allergenesLibres(l.allergenes || l.alg)
    };
  }

  function extrasDefaut() {
    var d = window.TRATTORIA_CONFIG_DEFAUT || {};
    var out = {};
    EXTRA_ORDRE.forEach(function (cle) {
      var def = (d.extras && d.extras[cle]) || EXTRA_DEFS[cle];
      out[cle] = {
        titre: String(def.titre || '').trim() || EXTRA_DEFS[cle].titre,
        sous: String(def.sous != null ? def.sous : EXTRA_DEFS[cle].sous).trim().slice(0, 120),
        ordre: extrasSeed(cle),
        libres: (Object.prototype.toString.call(def.libres) === '[object Array]')
          ? def.libres.map(ligneLibreNormalisee).filter(Boolean)
          : []
      };
      // les lignes libres par défaut occupent leur place dans l'ordre
      out[cle].libres.forEach(function (l) { out[cle].ordre.push(l.id); });
    });
    return out;
  }

  function confExtraNormalisee(src, cle, defaut) {
    var conf = {
      titre: String((src && src.titre) || '').trim().slice(0, 60) || defaut.titre,
      sous: String((src && src.sous) || '').trim().slice(0, 120),
      ordre: [],
      libres: []
    };
    conf.libres = ((src && Object.prototype.toString.call(src.libres) === '[object Array]')
      ? src.libres : defaut.libres).slice(0, 40).map(ligneLibreNormalisee).filter(Boolean);
    var idsValides = {};
    CARTE.forEach(function (p) { idsValides[p.id] = true; });
    conf.libres.forEach(function (l) { idsValides[l.id] = true; });
    var ordre = ((src && Object.prototype.toString.call(src.ordre) === '[object Array]')
      ? src.ordre : defaut.ordre);
    ordre.forEach(function (id) {
      if (idsValides[id] && conf.ordre.indexOf(id) < 0) conf.ordre.push(String(id));
    });
    // produit du catalogue jamais classé : il rejoint la fin de sa carte
    if (!src) extrasSeed(cle).forEach(function (id) {
      if (conf.ordre.indexOf(id) < 0) conf.ordre.push(id);
    });
    // les lignes libres sans position rejoignent la fin
    conf.libres.forEach(function (l) {
      if (conf.ordre.indexOf(l.id) < 0) conf.ordre.push(l.id);
    });
    return conf;
  }

  function itemsExtra(cle) {
    var conf = CF.extras[cle];
    if (!conf) return [];
    var libres = {};
    conf.libres.forEach(function (l) { libres[l.id] = l; });
    return (conf.ordre || []).map(function (id) {
      if (libres[id]) return { kind: 'l', l: libres[id] };
      var p = parId(id);
      return p ? { kind: 'p', p: p } : null;
    }).filter(Boolean);
  }

  // Produits appartenant à une carte additionnelle : ils sortent
  // de leur catégorie d'origine sur l'ardoise.
  function idsDansExtras() {
    var ids = {};
    if (CF && CF.extras) {
      Object.keys(CF.extras).forEach(function (cle) {
        CF.extras[cle].ordre.forEach(function (id) { ids[id] = true; });
      });
    }
    return ids;
  }

  function confDeCarte(card) {
    if (!card) return null;
    if (card.dataset.ex && CF.extras[card.dataset.ex]) return CF.extras[card.dataset.ex];
    if (card.dataset.mo && CF.moment[card.dataset.mo]) return CF.moment[card.dataset.mo];
    if (card.dataset.fam && CF.fams[card.dataset.fam]) return CF.fams[card.dataset.fam];
    return null;
  }

  // ---------- éditeur : cartes additionnelles ----------
  function libelleExtra(cle) {
    return { formules: 'formule', vins: 'vin', glaces: 'glace', bieres: 'bière' }[cle] || 'ligne';
  }

  // Markup de la carte éditeur d'une carte additionnelle (partagé entre
  // l'écran « Ardoise & QR » et l'onglet « La carte »).
  function cfExtrasCardHTML(cle) {
    var conf = CF.extras[cle];
    var items = itemsExtra(cle);
    var html = '<div class="cf-tete">' +
      '<div><b>🧾 ' + echap(conf.titre) + '</b>' +
      '<span class="cf-meta">carte dédiée · ' + items.length + ' ligne' +
      (items.length > 1 ? 's' : '') +
      ' · ' + echap(cle) + '</span></div>' +
      '<span class="cf-actions">' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="titre">✏️ Titre &amp; sous-titre</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="produit">＋ Produit du catalogue</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="ligne">+ ' +
          (cle === 'formules' ? 'Nouvelle formule' : 'Ligne libre') + '</button>' +
      '</span>' +
      '</div>' +
      '<div class="cf-edition-titre" hidden>' +
        '<label class="champ"><span>Titre affiché</span>' +
        '<input type="text" data-cf-champ="titre" maxlength="60" value="' + echap(conf.titre) + '"></label>' +
        '<label class="champ"><span>Sous-titre de la carte</span>' +
        '<input type="text" data-cf-champ="sous" maxlength="120" value="' + echap(conf.sous) + '"></label>' +
        '<div class="cf-rangee"><button type="button" class="btn btn-p btn-mini" data-cf="titre-ok">Enregistrer</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="titre-annule">Annuler</button></div>' +
      '</div>' +
      '<ol class="cf-lignes">';
    items.forEach(function (it, i) {
      var premier = i === 0, dernier = i === items.length - 1;
      if (it.kind === 'p') {
        var p = it.p;
        html += '<li class="cf-ligne' + (p.actif ? '' : ' cf-inactif') + '" data-cf-id="' + echap(p.id) + '">' +
          '<span class="cf-ordre">' +
            '<button type="button" class="btn btn-mini" data-cf="monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="btn btn-mini" data-cf="descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
          '</span>' +
          '<span class="cf-nom">' + echap(p.nom) +
            '<small>' + echap(p.fam) + (p.cat ? ' · ' + echap(p.cat) : '') + '</small>' +
            (!p.actif ? '<small class="cf-off">masqué de la carte</small>' : '') +
          '</span>' +
          '<span class="cf-prix">' + prixAffiche(p) + '</span>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-mini" data-cf="editer" title="Modifier le produit">✏️</button>' +
          '</span></li>';
      } else {
        var l = it.l;
        html += '<li class="cf-ligne cf-libre" data-cf-id="' + echap(l.id) + '">' +
          '<span class="cf-ordre">' +
            '<button type="button" class="btn btn-mini" data-cf="monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="btn btn-mini" data-cf="descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
          '</span>' +
          '<span class="cf-nom">' + echap(l.nom) +
            '<small class="cf-badge">' + echap(libelleExtra(cle)) + '</small>' +
            (l.sous ? '<small>' + echap(l.sous) + '</small>' : '') +
          '</span>' +
          '<span class="cf-prix">' + (l.prix > 0 ? eur(l.prix) : '—') + '</span>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-mini" data-cf="libre-editer">✏️</button>' +
            '<button type="button" class="btn btn-mini" data-cf="libre-supprimer">✕</button>' +
          '</span></li>';
      }
    });
    html += '</ol>';
    return html;
  }

  function dessinerCFExtras() {
    var hote = $('#liste-cf');
    if (!hote || !CF) return;
    EXTRA_ORDRE.forEach(function (cle) {
      var conf = CF.extras[cle];
      if (!conf) return;
      var carte = document.createElement('div');
      carte.className = 'cf-fam cf-extras carte-bloc';
      carte.setAttribute('data-ex', cle);
      carte.innerHTML = cfExtrasCardHTML(cle);
      hote.appendChild(carte);
    });
  }


  // ---------- rendu ardoise : les cartes additionnelles ----------
  function htmlArdoiseExtras(cfg) {
    var dansExtras = idsDansExtras();
    var h = '';
    EXTRA_ORDRE.forEach(function (cle) {
      var conf = CF.extras[cle];
      if (!conf) return;
      var items = itemsExtra(cle).filter(function (it) {
        return it.kind === 'l' || it.p.actif;
      });
      if (!items.length) return;
      h += htmlCategorieArdoise(conf.titre, conf.sous, items, 'carte-' + cle);
    });
    return h;
  }

  // Rendu d'un bloc catégorie (titre + sous-titre + items).
  // Couleur de craie optionnelle (auto si null).
  function htmlCategorieArdoise(titre, sous, items, variante) {
    var craie = CRAIE_CLASSES[CPT_CRAIE % CRAIE_CLASSES.length];
    CPT_CRAIE++;
    var photo = null;
    items.some(function (it) {
      if (it.kind === 'p') { photo = illustrationProduit(it.p); return !!photo; }
      return false;
    });
    var h = '<section class="catArdoise' + (photo ? ' catAvecPhoto' : '') +
      (variante ? ' ' + variante : '') + '">' +
      '<h2 class="' + craie + '">' + echap(titre) + '</h2>' +
      (sous ? '<div class="sousCat">' + echap(sous) + '</div>' : '');
    if (photo) {
      h += '<figure class="photoCraie"><img src="' + photo +
        '" alt="Photo — ' + echap(titre) + '" loading="lazy"></figure>';
    }
    h += '<ul class="itemsArdoise' + (items.length > 9 ? ' tailleModeree' : '') + '">';
    items.forEach(function (it) {
      if (it.kind === 'l') {
        h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
          echap(it.l.nom) + '</span><span class="pts"></span>' +
          '<span class="prix craie--jaune">' + (it.l.prix > 0 ? eur(it.l.prix) : '') + '</span></div>' +
          (it.l.sous ? '<span class="desc">' + echap(it.l.sous) + '</span>' : '') +
          (it.l.desc ? '<span class="desc">' + echap(it.l.desc) + '</span>' : '') +
          '</li>';
      } else {
        var q = it.p;
        var sousP = q.sous || q.desc || '';
        var formats = (q.formats && q.formats.length)
          ? q.formats.map(function (f) {
              return echap(f.nom) + ' <b class="craie--jaune">' + eur(f.pv) + '</b>';
            }).join(' · ')
          : null;
        h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
          echap(q.nom) + '</span><span class="pts"></span>' +
          '<span class="prix craie--jaune">' + prixAffiche(q) + '</span></div>' +
          (sousP ? '<span class="desc">' + echap(sousP) + '</span>' : '') +
          (formats ? '<span class="desc">' + formats + '</span>' : '') +
          '</li>';
      }
    });
    h += '</ul></section>';
    return h;
  }


  // ==========================================================
  //  Cartes du moment : plats, boissons, vins & alcools,
  //  glaces (L'Angelys), desserts, bières — ardoise craie,
  //  illustrations, prix HT, mentions obligatoires
  // ==========================================================

  var MOMENT_DEFS = {
    plats: {
      titre: 'Les plats du moment',
      sous: 'La carte change avec les saisons et le marché',
      mentions: 'Prix hors taxes en euros. Nos plats sont préparés maison à partir de produits frais. Allergènes : la liste complète est disponible sur demande au comptoir.',
      tvaDefaut: 0.1,
      seed: 'plats'
    },
    boissons: {
      titre: 'Les boissons du moment',
      sous: 'Avec ou sans alcool',
      mentions: 'Prix hors taxes en euros. La vente d’alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique). L’abus d’alcool est dangereux pour la santé.',
      tvaDefaut: 0.1,
      seed: 'boissons'
    },
    vins: {
      titre: 'Vins & alcools du moment',
      sous: 'La sélection de la maison',
      mentions: 'Prix hors taxes en euros. L’abus d’alcool est dangereux pour la santé, à consommer avec modération. La vente d’alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique).',
      tvaDefaut: 0.2,
      seed: 'vins'
    },
    glaces: {
      titre: 'Glaces artisanales du moment',
      sous: 'Glaces et sorbets L’Angelys, fabriqués artisanalement',
      mentions: 'Prix hors taxes en euros. Allergènes : lait, œuf, fruits à coque possibles selon les parfums. Glaces artisanales L’Angelys — parfums susceptibles de varier selon les arrivages.',
      tvaDefaut: 0.1,
      seed: 'glaces'
    },
    desserts: {
      titre: 'Les desserts du moment',
      sous: 'Faits maison, chaque jour',
      mentions: 'Prix hors taxes en euros. Nos desserts sont préparés maison. Allergènes : gluten, lait, œuf, fruits à coque possibles selon les desserts.',
      tvaDefaut: 0.1,
      seed: 'desserts'
    },
    bieres: {
      titre: 'Les bières du moment',
      sous: 'Pression et bouteilles du moment',
      mentions: 'Prix hors taxes en euros. L’abus d’alcool est dangereux pour la santé, à consommer avec modération. La vente d’alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique).',
      tvaDefaut: 0.2,
      seed: 'bieres'
    }
  };
  var MOMENT_ORDRE = ['plats', 'boissons', 'vins', 'glaces', 'desserts', 'bieres'];

  // Lignes libres « du moment » par défaut (glaces L'Angelys…).
  function momentSemenceLibres(cle) {
    if (cle === 'glaces') {
      return [
        { nom: 'Vanille Bourbon', sous: 'Gousse de Madagascar', prix: 2.5 },
        { nom: 'Chocolat noir 70 %', sous: 'Cacao intense', prix: 2.5 },
        { nom: 'Pistache', sous: 'Pistaches de Sicile', prix: 2.8 },
        { nom: 'Rhum-raisin', sous: 'Rhum ambré, raisins marinés', prix: 3 },
        { nom: 'Sorbet citron de Sicile', sous: 'Vif et rafraîchissant', prix: 2.5 },
        { nom: 'Sorbet framboise', sous: 'Fruité, sans lactose', prix: 2.5 }
      ];
    }
    return [];
  }

  // Produits du catalogue proposés automatiquement pour une carte du moment.
  function momentSeed(cle) {
    return CARTE.filter(function (p) {
      if (!p.actif || !produitDisponible(p)) return false;
      if (cle === 'plats') return p.type === 'plat';
      if (cle === 'boissons') return p.type === 'boisson';
      if (cle === 'vins') return norm(p.cat).indexOf('cave') >= 0 || /limoncello|amaretto/i.test(p.nom);
      if (cle === 'desserts') return norm(p.fam).indexOf('dessert') >= 0;
      if (cle === 'bieres') return norm(p.cat).indexOf('bier') >= 0;
      return false;
    }).map(function (p) { return p.id; });
  }

  function momentConfDefaut(cle) {
    var def = MOMENT_DEFS[cle];
    var libres = momentSemenceLibres(cle).map(function (l, i) {
      return {
        id: 'lm' + cle[0] + i,
        nom: l.nom, sous: l.sous || '', desc: '', prix: l.prix || 0,
        tva: def.tvaDefaut
      };
    });
    var ordre = momentSeed(cle);
    // les lignes libres par défaut (glaces L'Angelys…) occupent leur place
    libres.forEach(function (l) { ordre.push(l.id); });
    return {
      titre: def.titre, sous: def.sous, mentions: def.mentions,
      ht: true,
      ordre: ordre,
      libres: libres
    };
  }

  function momentConfNormalisee(src, cle) {
    var def = momentConfDefaut(cle);
    var conf = {
      titre: String((src && src.titre) || '').trim().slice(0, 60) || def.titre,
      sous: String((src && src.sous) || '').trim().slice(0, 120),
      mentions: String((src && src.mentions) || '').trim().slice(0, 600) || def.mentions,
      ht: (src && typeof src.ht === 'boolean') ? src.ht : def.ht,
      ordre: [],
      libres: ((src && Object.prototype.toString.call(src.libres) === '[object Array]')
        ? src.libres : def.libres).slice(0, 40).map(function (l, i) {
            if (!l || typeof l !== 'object') return null;
            var nom = String(l.nom || '').trim().slice(0, 60);
            if (!nom) return null;
            return {
              id: String(l.id || ('lm' + Date.now().toString(36) + i)).slice(0, 24),
              nom: nom,
              sous: String(l.sous || '').trim().slice(0, 90),
              desc: String(l.desc || '').trim().slice(0, 200),
              prix: Math.max(0, Math.round(Number(l.prix) * 100) / 100 || 0),
              tva: [0.2, 0.1, 0.055].indexOf(Number(l.tva)) >= 0 ? Number(l.tva) : (l.tva === 0 ? 0 : 0.1)
            };
          }).filter(Boolean)
    };
    var ids = {};
    CARTE.forEach(function (p) { ids[p.id] = true; });
    conf.libres.forEach(function (l) { ids[l.id] = true; });
    var ordre = ((src && Object.prototype.toString.call(src.ordre) === '[object Array]')
      ? src.ordre : def.ordre);
    ordre.forEach(function (id) {
      if (ids[id] && conf.ordre.indexOf(String(id)) < 0) conf.ordre.push(String(id));
    });
    if (!src) momentSeed(cle).forEach(function (id) {
      if (conf.ordre.indexOf(id) < 0) conf.ordre.push(id);
    });
    conf.libres.forEach(function (l) {
      if (conf.ordre.indexOf(l.id) < 0) conf.ordre.push(l.id);
    });
    return conf;
  }

  function itemsMoment(cle) {
    var conf = CF.moment && CF.moment[cle];
    if (!conf) return [];
    var libres = {};
    conf.libres.forEach(function (l) { libres[l.id] = l; });
    return (conf.ordre || []).map(function (id) {
      if (libres[id]) return { kind: 'l', l: libres[id] };
      var p = parId(id);
      return p ? { kind: 'p', p: p } : null;
    }).filter(Boolean);
  }

  // Prix affiché : HT (défaut des cartes du moment) ou TTC.
  function prixMomentHT(p) {
    return p.pv > 0 ? p.pv / (1 + p.tva) : 0;
  }
  function libelleMomentPrix(p, ht) {
    return ht
      ? eur(Math.round(prixMomentHT(p) * 100) / 100) + ' HT'
      : eur(p.pv);
  }
  function libelleMomentLibre(l, ht) {
    var tva = l.tva || 0.1;
    return ht
      ? eur(Math.round((l.prix / (1 + tva)) * 100) / 100) + ' HT'
      : eur(l.prix);
  }

  // ---------- éditeur (vue « ✨ Du moment » de l'onglet La carte) ----------
  function dessinerVueMoment() {
    $('#outils-standard').hidden = true;
    var total = MOMENT_ORDRE.reduce(function (n, cle) {
      return n + itemsMoment(cle).length;
    }, 0);
    $('#nb-visibles').textContent = total + ' ligne' + (total > 1 ? 's' : '') +
      ' sur les cartes du moment';
    var h = '<p class="note-vue">Les <b>cartes du moment</b> : ardoise craie, illustration, ' +
      'prix <b>HT</b> et mentions obligatoires. Chaque carte s’imprime séparément et est ' +
      'publiée sur le site.</p><div id="liste-moment">';
    MOMENT_ORDRE.forEach(function (cle) {
      h += '<div class="cf-fam cf-moment carte-bloc" data-mo="' + echap(cle) + '">' +
        cfMomentCardHTML(cle) + '</div>';
    });
    h += '</div>';
    $('#liste-produits').innerHTML = h;
    if (LIGNE_A_EDITER) ouvrirEditeurDiffere($('#liste-produits'));
  }

  function cfMomentCardHTML(cle) {
    var conf = CF.moment[cle];
    var def = MOMENT_DEFS[cle];
    var items = itemsMoment(cle);
    var h = '<div class="cf-tete">' +
      '<div><b>✨ ' + echap(conf.titre) + '</b>' +
      '<span class="cf-meta">' + echap(def.sous) + ' · ' + items.length +
      ' ligne' + (items.length > 1 ? 's' : '') + ' · ' +
      (conf.ht ? 'prix HT' : 'prix TTC') + '</span></div>' +
      '<span class="cf-actions">' +
        '<button type="button" class="btn btn-s btn-mini" data-mo="titre">✏️ Titre, descriptif &amp; mentions</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-mo="produit">＋ Produit</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-mo="ligne">+ Ligne</button>' +
        '<button type="button" class="btn btn-p btn-mini" data-mo="imprimer">🖨️ Imprimer</button>' +
      '</span></div>' +
      '<div class="cf-edition-titre" hidden>' +
        '<label class="champ"><span>Titre affiché</span>' +
        '<input type="text" data-mo-champ="titre" maxlength="60" value="' + echap(conf.titre) + '"></label>' +
        '<label class="champ"><span>Descriptif (sous le titre)</span>' +
        '<input type="text" data-mo-champ="sous" maxlength="120" value="' + echap(conf.sous) + '"></label>' +
        '<label class="champ case-moment"><input type="checkbox" data-mo-champ="ht"' +
          (conf.ht ? ' checked' : '') + '><span>Afficher les prix <b>hors taxes (HT)</b> ' +
          '(décocher pour TTC)</span></label>' +
        '<label class="champ"><span>Mentions obligatoires (bas de carte — modifiables)</span>' +
        '<textarea data-mo-champ="mentions" rows="3" maxlength="600">' + echap(conf.mentions) + '</textarea></label>' +
        '<div class="cf-rangee"><button type="button" class="btn btn-p btn-mini" data-mo="titre-ok">Enregistrer</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-mo="titre-annule">Annuler</button></div>' +
      '</div>' +
      '<ol class="cf-lignes">';
    var html;
    items.forEach(function (it, i) {
      var premier = i === 0, dernier = i === items.length - 1;
      if (it.kind === 'p') {
        var p = it.p;
        html = '<li class="cf-ligne' + (p.actif ? '' : ' cf-inactif') + '" data-cf-id="' + echap(p.id) + '">' +
          '<span class="cf-ordre">' +
            '<button type="button" class="btn btn-mini" data-mo="monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="btn btn-mini" data-mo="descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
          '</span>' +
          '<span class="cf-nom">' + echap(p.nom) +
            '<small>' + (p.sous ? echap(p.sous) : echap(p.desc || '')) + '</small>' +
            (!p.actif ? '<small class="cf-off">masqué de la carte</small>' : '') +
          '</span>' +
          '<span class="cf-prix">' + (conf.ht ? eur(Math.round(prixMomentHT(p) * 100) / 100) + ' HT' : eur(p.pv)) + '</span>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-mini" data-mo="editer" title="Modifier le produit">✏️</button>' +
          '</span></li>';
      } else {
        var l = it.l;
        html = '<li class="cf-ligne cf-libre" data-cf-id="' + echap(l.id) + '">' +
          '<span class="cf-ordre">' +
            '<button type="button" class="btn btn-mini" data-mo="monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="btn btn-mini" data-mo="descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
          '</span>' +
          '<span class="cf-nom">' + echap(l.nom) +
            '<small class="cf-badge">ligne</small>' +
            (l.sous ? '<small>' + echap(l.sous) + '</small>' : '') +
          '</span>' +
          '<span class="cf-prix">' + libelleMomentLibre(l, conf.ht) + '</span>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-mini" data-mo="libre-editer">✏️</button>' +
            '<button type="button" class="btn btn-mini" data-mo="libre-supprimer">✕</button>' +
          '</span></li>';
      }
      h += html;
    });
    h += '</ol>';
    return h;
  }

  // ---------- clics (délégation depuis clicCarteStandard) ----------
  function clicMoment(t) {
    var card = t.closest('.cf-moment[data-mo]');
    if (!card) return false;
    var cle = card.dataset.mo;
    var conf = CF.moment[cle];
    if (!conf) return false;
    var li = t.closest('li[data-cf-id]');
    var id = li ? li.dataset.cfId : null;
    var act = t.closest('[data-mo]');
    if (!act) return false;
    var a = act.getAttribute('data-mo');
    if (a === 'titre') {
      var z = $('.cf-edition-titre', card);
      if (z) { z.hidden = false; $('input[data-mo-champ="titre"]', z).focus(); }
      return true;
    }
    if (a === 'titre-annule') {
      var z2 = $('.cf-edition-titre', card);
      if (z2) z2.hidden = true;
      return true;
    }
    if (a === 'titre-ok') {
      conf.titre = String($('[data-mo-champ="titre"]', card).value || '').trim().slice(0, 60) || MOMENT_DEFS[cle].titre;
      conf.sous = String($('[data-mo-champ="sous"]', card).value || '').trim().slice(0, 120);
      conf.mentions = String($('[data-mo-champ="mentions"]', card).value || '').trim().slice(0, 600) || MOMENT_DEFS[cle].mentions;
      conf.ht = $('[data-mo-champ="ht"]', card).checked;
      sauver(); dessinerCF(); if (ECRAN === 'carte') dessinerCarte();
      toast('Carte du moment mise à jour');
      return true;
    }
    if (a === 'ligne') {
      if (conf.libres.length >= 30) { toast('Maximum 30 lignes'); return true; }
      var ln = { id: 'lm' + Date.now().toString(36), nom: 'Nouvelle ligne', sous: '', desc: '',
                 prix: 0, tva: MOMENT_DEFS[cle].tvaDefaut };
      conf.libres.push(ln);
      conf.ordre.push(ln.id);
      LIGNE_A_EDITER = ln.id;
      sauver(); dessinerCF(); if (ECRAN === 'carte') dessinerCarte();
      return true;
    }
    if (a === 'produit') { ouvrirCueilletteMoment(cle); return true; }
    if (a === 'imprimer') { ouvrirMoment(cle); return true; }
    if (a === 'monter' && id) {
      var i1 = conf.ordre.indexOf(id);
      if (i1 > 0) {
        var tmp = conf.ordre[i1]; conf.ordre[i1] = conf.ordre[i1 - 1]; conf.ordre[i1 - 1] = tmp;
        sauver(); if (ECRAN === 'carte') dessinerCarte();
      }
      return true;
    }
    if (a === 'descendre' && id) {
      var i2 = conf.ordre.indexOf(id);
      if (i2 >= 0 && i2 < conf.ordre.length - 1) {
        var tmp2 = conf.ordre[i2]; conf.ordre[i2] = conf.ordre[i2 + 1]; conf.ordre[i2 + 1] = tmp2;
        sauver(); if (ECRAN === 'carte') dessinerCarte();
      }
      return true;
    }
    if (a === 'editer' && id) { ouvrirFiche(id); return true; }
    if (a === 'libre-editer' && id) {
      var l = conf.libres.filter(function (x) { return x.id === id; })[0];
      if (!l || !li) return true;
      li.innerHTML =
        '<div class="cf-libre-form">' +
          '<input type="text" data-mo-l="nom" maxlength="60" value="' + echap(l.nom) + '" placeholder="Nom (ex. : Pistache)">' +
          '<input type="text" data-mo-l="sous" maxlength="90" value="' + echap(l.sous) + '" placeholder="Descriptif (facultatif)">' +
          '<input type="text" data-mo-l="prix" inputmode="decimal" value="' +
            (l.prix > 0 ? String(l.prix).replace('.', ',') : '') + '" placeholder="Prix TTC €">' +
          '<select data-mo-l="tva">' +
            '<option value="0.1"' + (l.tva === 0.1 ? ' selected' : '') + '>TVA 10 % (alimentaire)</option>' +
            '<option value="0.2"' + (l.tva === 0.2 ? ' selected' : '') + '>TVA 20 % (alcool)</option>' +
          '</select>' +
          '<button type="button" class="btn btn-p btn-mini" data-mo="libre-ok">OK</button>' +
          '<button type="button" class="btn btn-s btn-mini" data-mo="libre-annule">Annuler</button>' +
        '</div>';
      $('input[data-mo-l="nom"]', li).focus();
      return true;
    }
    if (a === 'libre-ok' && id) {
      var l2 = conf.libres.filter(function (x) { return x.id === id; })[0];
      if (!l2 || !li) return true;
      var nom = String($('[data-mo-l="nom"]', li).value || '').trim();
      if (!nom) { toast('Le nom est obligatoire'); return true; }
      l2.nom = nom.slice(0, 60);
      l2.sous = String($('[data-mo-l="sous"]', li).value || '').trim().slice(0, 90);
      l2.prix = Math.max(0, Math.round((parseFloat(String($('[data-mo-l="prix"]', li).value).replace(',', '.')) || 0) * 100) / 100);
      var tv = parseFloat($('[data-mo-l="tva"]', li).value);
      if ([0.2, 0.1, 0.055].indexOf(tv) >= 0) l2.tva = tv;
      sauver(); dessinerCF(); if (ECRAN === 'carte') dessinerCarte();
      toast('Ligne enregistrée');
      return true;
    }
    if (a === 'libre-annule' && id) { if (ECRAN === 'carte') dessinerCarte(); return true; }
    if (a === 'libre-supprimer' && id) {
      var l3 = conf.libres.filter(function (x) { return x.id === id; })[0];
      if (l3 && confirm('Supprimer « ' + l3.nom + ' » ?')) {
        conf.libres = conf.libres.filter(function (x) { return x.id !== id; });
        conf.ordre = conf.ordre.filter(function (x) { return x !== id; });
        sauver(); dessinerCF(); if (ECRAN === 'carte') dessinerCarte();
        toast('Ligne supprimée');
      }
      return true;
    }
    return false;
  }

  function ouvrirCueilletteMoment(cle) {
    var conf = CF.moment[cle];
    if (!conf) return;
    CUEILLETTE = {
      cle: 'moment:' + cle,
      choisis: conf.ordre.filter(function (id) { return !!parId(id); }),
      disponibles: false
    };
    $('#cueillette-disponibles').checked = false;
    $('#cueillette-titre').textContent = conf.titre + ' — produits du catalogue';
    $('#cueillette-recherche').value = '';
    dessinerCueillette();
    $('#cueillette').hidden = false;
    $('#cueillette-recherche').focus();
  }

  // ---------- rendu craie + impression par carte ----------
  function htmlMoment(cle) {
    var conf = CF.moment[cle];
    var def = MOMENT_DEFS[cle];
    var items = itemsMoment(cle).filter(function (it) {
      return it.kind === 'l' || it.p.actif;
    });
    var assets = (window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.moment) || {};
    var illus = assets[def && cle === 'plats' ? 'plats' : cle] || assets.plats || '';
    var h = '<div class="cadreBois moment-carte" data-mo-carte="' + echap(cle) + '">';
    h += '<header class="moment-entete">' +
      '<img class="moment-illus" alt="" src="' + illus + '">' +
      '<h1 class="craie--jaune">' + echap(conf.titre) + '</h1>' +
      (conf.sous ? '<div class="moment-sous craie--blanc">' + echap(conf.sous) + '</div>' : '') +
      '<div class="filetCraie"></div></header>';
    if (!items.length) {
      h += '<p class="moment-vide craie--blanc">Cette carte est vide — ajoutez des lignes ' +
        'depuis l’éditeur « La carte ».</p>';
    } else {
      h += '<ul class="moment-liste">';
      items.forEach(function (it) {
        if (it.kind === 'l') {
          var l = it.l;
          h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' + echap(l.nom) +
            '</span><span class="pts"></span><span class="prix craie--jaune">' +
            libelleMomentLibre(l, conf.ht) + '</span></div>' +
            (l.sous ? '<span class="desc">' + echap(l.sous) + '</span>' : '') +
            (l.desc ? '<span class="desc">' + echap(l.desc) + '</span>' : '') + '</li>';
        } else {
          var q = it.p;
          var sous = q.sous || q.desc || '';
          h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' + echap(q.nom) +
            '</span><span class="pts"></span><span class="prix craie--jaune">' +
            libelleMomentPrix(q, conf.ht) + '</span></div>' +
            (sous ? '<span class="desc">' + echap(sous) + '</span>' : '') + '</li>';
        }
      });
      h += '</ul>';
    }
    h += '<div class="moment-mentions">' +
      '<span>' + (conf.ht ? 'Prix nets hors taxes — TVA en sus. ' : 'Prix TTC en euros. ') +
      echap(conf.mentions) + '</span></div>';
    h += '<div class="piedArdoise">La Trattoria — 15 rue de la Poste, 17100 Saintes — 06 27 21 31 90' +
      '<span class="coords">SIRET 106 050 263 00016 · ' +
      (conf.ht ? 'Prix HT — TVA en sus' : 'Prix TTC, service compris') + '</span></div>';
    h += '</div>';
    return h;
  }

  function fermerMoment() {
    var ov = document.getElementById('moment-overlay');
    if (ov) ov.remove();
    document.body.classList.remove('impression-moment');
    document.body.style.overflow = '';
  }

  function ouvrirMoment(cle) {
    fermerMoment();
    var conf = CF.moment[cle];
    if (!conf) return;
    var ov = document.createElement('div');
    ov.id = 'moment-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;' +
      'background:rgba(10,14,12,.85);padding:14px;';
    ov.innerHTML =
      '<div class="sansImpression" style="max-width:720px;margin:0 auto 12px;' +
        'display:flex;gap:10px;justify-content:flex-end;align-items:center;">' +
        '<span style="color:#F3F1E7;font-family:Georgia,serif;font-size:14px;margin-right:auto;">' +
          echap(conf.titre) + ' — prête à imprimer</span>' +
        '<button type="button" id="btn-moment-imprimer" class="btn btn-s">🖨 Imprimer / PDF</button>' +
        '<button type="button" id="btn-moment-fermer" class="btn btn-s">Fermer</button>' +
      '</div>' +
      '<div class="fondArdoise" style="border-radius:6px;max-width:720px;margin:0 auto;">' +
        htmlMoment(cle) + '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    ov.addEventListener('click', function (e) {
      if (e.target === ov) fermerMoment();
      if (e.target.closest('#btn-moment-fermer')) fermerMoment();
      if (e.target.closest('#btn-moment-imprimer')) {
        document.body.classList.add('impression-moment');
        window.print();
        setTimeout(function () { document.body.classList.remove('impression-moment'); }, 400);
      }
    });
    document.addEventListener('keydown', momentEchap);
  }

  function momentEchap(e) {
    if (e.key === 'Escape') {
      fermerMoment();
      document.removeEventListener('keydown', momentEchap);
    }
  }


  function charger() {
    try {
      var hib = JSON.parse(localStorage.getItem(CLE_HIBOUTIK) || 'null');
      if (hib && Object.prototype.toString.call(hib.produits) === '[object Array]') {
        HIBOUTIK.produits = hib.produits;
        HIBOUTIK.maj = hib.maj || null;
        HIBOUTIK.configure = !!hib.configure;
        HIBOUTIK.creation = !!hib.creation;
      }
    } catch (e) { }
    var brut = null;
    try { brut = JSON.parse(localStorage.getItem(CLE_STOCK) || 'null'); } catch (e) { }
    if (brut && Object.prototype.toString.call(brut) === '[object Array]') {
      CARTE = brut.map(produitNormalise);
    } else {
      // Première ouverture : on part du catalogue de l'application.
      CARTE = (window.TRATTORIA_CATALOGUE || []).map(produitNormalise);
    }
    var brutA = null;
    try { brutA = JSON.parse(localStorage.getItem(CLE_ARDOISES) || 'null'); } catch (e) { }
    ARDOISES = ardoisesToutesNormalisees(brutA);
    configCharger();
    sauver();
  }

  // ----------------------------------------------------------
  //  Synchronisation (serveur local, voir serveur_carte.py)
  //  Règle simple et documentée : la dernière tablette qui
  //  enregistre fait foi (« last-write-wins »).
  // ----------------------------------------------------------
  function syncDispo() {
    return typeof fetch === 'function' && /^https?:$/.test(location.protocol);
  }

  function syncHeaders() {
    var h = {};
    if (SYNC_TOKEN) h['X-Carte-Token'] = SYNC_TOKEN;
    return h;
  }

  function demanderToken() {
    var champ = $('#champ-sync-token');
    var token = champ ? String(champ.value || '').trim() : '';
    if (!token) {
      token = prompt('Jeton de gestion du serveur de carte (fichier carte-api-token) :') || '';
      token = token.trim();
    }
    if (!token) return false;
    SYNC_TOKEN = token;
    localStorage.setItem(CLE_SYNC_TOKEN, token);
    if (champ) champ.value = token;
    return true;
  }

  function badgeSync() {
    var b = $('#badge-sync');
    if (!b) return;
    if (SYNC.actif) {
      b.innerHTML = '<span class="point ok"></span>Tablettes synchronisées';
      b.className = 'badge-sync on';
    } else {
      b.innerHTML = '<span class="point"></span>Mode autonome';
      b.className = 'badge-sync';
    }
  }

  /** Premiere prise de contact : le serveur fait foi s'il contient déjà
      une carte ; sinon on lui envoie la nôtre. */
  function syncDetecter() {
    if (!syncDispo()) { badgeSync(); return; }
    fetch('api/etat', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('ko');
      return r.json();
    }).then(function (r) {
      SYNC.actif = true;
      SYNC.version = Number(r.version) || 0;
      badgeSync();
      if (SYNC.version > 0) syncTirer(false);
      else planifierEnvoi(true);
      setInterval(function () { syncTirer(false); }, 15000);
    }).catch(function () {
      SYNC.actif = false;
      badgeSync();
    });
  }

  function syncTirer(manuel) {
    if (!SYNC.actif) {
      if (manuel) toast('Aucun serveur de carte joint — lancez serveur_carte.py');
      return;
    }
    fetch('api/carte', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('ko');
      return r.json();
    }).then(function (r) {
      var v = Number(r.version) || 0;
      if (v === SYNC.version) {
        if (manuel) toast('La carte est déjà à jour');
        return;
      }
      SYNC.version = v;
      if (Object.prototype.toString.call(r.carte) === '[object Array]' && r.carte.length) {
        CARTE = r.carte.map(produitNormalise);
      }
      ARDOISES = ardoisesToutesNormalisees(r.ardoises);
      CF = configNormalisee(r.config || CF);
      try {
        localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
        localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
        localStorage.setItem(CLE_CONFIG, JSON.stringify(CF));
      } catch (e) { }
      toutDessiner();
      majInfoDonnees();
      toast('Carte synchronisée avec les autres tablettes');
      badgeSync();
    }).catch(function () {
      if (manuel) toast('Le serveur de carte ne répond pas');
    });
  }

  function planifierEnvoi(immediat) {
    if (!SYNC.actif || !SYNC_TOKEN) return;
    clearTimeout(SYNC.minuteur);
    var envoyer = function () {
      var headers = syncHeaders();
      headers['Content-Type'] = 'application/json';
      fetch('api/carte', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ carte: CARTE, ardoises: ARDOISES, config: CF })
      }).then(function (r) {
        if (r.status === 401) throw new Error('token');
        if (!r.ok) throw new Error('ko');
        return r.json();
      }).then(function (r) {
        SYNC.version = Number(r.version) || SYNC.version;
        badgeSync();
      }).catch(function (e) {
        badgeSync();
        if (e && e.message === 'token') toast('Jeton requis pour publier la carte — onglet Données.');
      });
    };
    if (immediat) envoyer();
    else SYNC.minuteur = setTimeout(envoyer, 900);
  }

  function afficherStatutHiboutik(message, ok) {
    var cible = $('#hiboutik-statut');
    if (!cible) return;
    cible.textContent = message;
    cible.className = 'aide ' + (ok ? 'hiboutik-ok' : 'hiboutik-ko');
    var bouton = $('#btn-hiboutik-importer');
    if (bouton) bouton.disabled = !ok || !HIBOUTIK.produits.length;
  }

  function hiboutikEtat() {
    if (!syncDispo()) {
      afficherStatutHiboutik('Serveur requis pour protéger les identifiants Hiboutik.', false);
      return;
    }
    fetch('api/hiboutik/statut', { cache: 'no-store' }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, data: d }; });
    }).then(function (r) {
      HIBOUTIK.configure = !!r.data.configure;
      HIBOUTIK.creation = !!r.data.creation;
      afficherStatutHiboutik(r.data.message || (HIBOUTIK.configure ? 'Connecté' : 'Non configuré'),
        HIBOUTIK.configure);
    }).catch(function () {
      HIBOUTIK.configure = false;
      afficherStatutHiboutik('Serveur Hiboutik indisponible.', false);
    });
  }

  function associerInventaireHiboutik(produits) {
    var parHid = {}, parCode = {}, parNom = {};
    produits.forEach(function (p) {
      parHid[p.hiboutikId] = p;
      if (p.barcode) parCode[p.barcode] = p;
      parNom[norm(p.nom)] = parNom[norm(p.nom)] || p;
    });
    CARTE.forEach(function (local) {
      var distant = (local.hiboutikId && parHid[local.hiboutikId]) ||
        (local.hiboutikBarcode && parCode[local.hiboutikBarcode]) ||
        parNom[norm(local.nom)];
      if (!distant) return;
      local.hiboutikId = distant.hiboutikId;
      if (distant.barcode) local.hiboutikBarcode = distant.barcode;
      local.hiboutikStock = distant.stock;
      if (distant.stockSuivi) local.suiviStock = true;
    });
  }

  function actualiserInventaireHiboutik() {
    if (!SYNC_TOKEN && !demanderToken()) return;
    if (!syncDispo()) { toast('Lancez serveur_carte.py pour joindre Hiboutik'); return; }
    HIBOUTIK.chargement = true;
    afficherStatutHiboutik('Lecture de l’inventaire Hiboutik…', false);
    fetch('api/hiboutik/catalogue', { headers: syncHeaders(), cache: 'no-store' }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.erreur || 'Hiboutik'); return d; });
    }).then(function (d) {
      HIBOUTIK.produits = Array.isArray(d.produits) ? d.produits : [];
      HIBOUTIK.maj = d.maj || new Date().toISOString();
      associerInventaireHiboutik(HIBOUTIK.produits);
      localStorage.setItem(CLE_HIBOUTIK, JSON.stringify(HIBOUTIK));
      HIBOUTIK.chargement = false;
      afficherStatutHiboutik(HIBOUTIK.produits.length + ' produit(s) Hiboutik synchronisé(s).', true);
      $('#hiboutik-dernier').textContent = 'Dernière lecture : ' + new Date(HIBOUTIK.maj).toLocaleString('fr-FR') +
        '. Les cartes automatiques excluent les produits épuisés suivis.';
      sauver();
      toutDessiner();
      toast('Inventaire Hiboutik actualisé');
    }).catch(function (e) {
      HIBOUTIK.chargement = false;
      afficherStatutHiboutik(e.message || 'Lecture Hiboutik impossible.', false);
      toast(e.message || 'Lecture Hiboutik impossible');
    });
  }

  function produitLocalDepuisHiboutik(distant) {
    var tva = distant.pv != null ? 0.1 : 0.1;
    return produitNormalise({
      id: 'hib' + distant.hiboutikId,
      nom: distant.nom,
      desc: 'Importé depuis Hiboutik',
      type: 'plat',
      fam: 'Hiboutik',
      cat: '',
      pv: distant.pv || 0,
      cout: distant.cout || 0,
      tva: tva,
      actif: true,
      suiviStock: distant.stockSuivi || distant.stock != null,
      stock: distant.stock || 0,
      hiboutikId: distant.hiboutikId,
      hiboutikBarcode: distant.barcode || '',
      hiboutikStock: distant.stock
    }, CARTE.length);
  }

  function importerNouveauxProduitsHiboutik() {
    var nouveaux = HIBOUTIK.produits.filter(function (distant) {
      return !CARTE.some(function (local) {
        return (local.hiboutikId && local.hiboutikId === distant.hiboutikId) ||
          (distant.barcode && local.hiboutikBarcode === distant.barcode) ||
          norm(local.nom) === norm(distant.nom);
      });
    });
    if (!nouveaux.length) { toast('Aucun nouveau produit à importer'); return; }
    if (!confirm('Ajouter ' + nouveaux.length + ' produit(s) Hiboutik dans la carte locale ?')) return;
    nouveaux.forEach(function (distant) { CARTE.push(produitLocalDepuisHiboutik(distant)); });
    sauver();
    toutDessiner();
    toast(nouveaux.length + ' produit(s) importé(s) dans la carte');
  }

  function creerProduitHiboutik(produit) {
    if (!SYNC_TOKEN || !HIBOUTIK.configure || !syncDispo()) {
      toast('Produit local créé ; Hiboutik n’est pas configuré sur le serveur');
      return;
    }
    var headers = syncHeaders();
    headers['Content-Type'] = 'application/json';
    fetch('api/hiboutik/produits', {
      method: 'POST', headers: headers,
      body: JSON.stringify({ produit: produit })
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.erreur || 'Création Hiboutik refusée'); return d; });
    }).then(function (d) {
      var distant = d.produit || {};
      if (distant.hiboutikId) produit.hiboutikId = String(distant.hiboutikId);
      produit.hiboutikStock = 0;
      produit.suiviStock = produit.suiviStock || false;
      HIBOUTIK.produits.push({ hiboutikId: produit.hiboutikId, nom: produit.nom,
        barcode: produit.hiboutikBarcode, pv: produit.pv, stock: 0,
        stockSuivi: produit.suiviStock });
      localStorage.setItem(CLE_HIBOUTIK, JSON.stringify(HIBOUTIK));
      sauver();
      toast(produit.nom + ' créé dans Hiboutik');
      if (d.avertissements && d.avertissements.length) alert(d.avertissements.join('\n'));
    }).catch(function (e) {
      toast('Produit local conservé ; Hiboutik : ' + e.message);
    });
  }

  function toutDessiner() {
    dessinerCarte();
    dessinerMarges();
    dessinerArdoises();
    dessinerCF();
    dessinerDashboard();
    dessinerObjectifs();
  }

  // ==========================================================
  //  Écran « La carte »
  // ==========================================================
  function produitsFiltres() {
    var q = norm(RECHERCHE);
    return CARTE.filter(function (p) {
      if (FILTRE_TYPE !== 'tout' && p.type !== FILTRE_TYPE) return false;
      if (q && norm(p.nom + ' ' + p.desc + ' ' + p.cat + ' ' + p.fam).indexOf(q) < 0) return false;
      return true;
    });
  }

  function classeMarge(p) {
    if (p.cout <= 0) return 'neutre';
    return sousObjectif(p) ? 'rouge' : 'vert';
  }

  function carteProduitHTML(p) {
    var visuel = p.photo || illustrationProduit(p);
    var photo = visuel
      ? '<img src="' + visuel + '" alt="Illustration — ' + echap(p.nom) + '" loading="lazy">'
      : '<span class="motif" aria-hidden="true">' + echap((TYPES[p.type] || '?')[0]) + '</span>';
    var manuel = p.margeManuelle
      ? ' <span class="badge-manuel" title="Marge cible fixée à la main">marge : ' +
        echap(libelleCible(p)) + '</span>' : '';
    var qteStock = stockProduit(p);
    var badgeStock = qteStock == null ? '' : '<span class="badge-stock ' +
      (qteStock > 0 ? 'ok' : 'ko') + '">' + (qteStock > 0 ? 'Disponible' : 'Épuisé') +
      ' · ' + qteStock.toLocaleString('fr-FR') + '</span>';
    return '<article class="carte-prod' + (p.actif ? '' : ' inactif') + '" data-id="' + echap(p.id) + '">' +
      '<div class="visu">' + photo +
      '<span class="badge-type ' + p.type + '">' + TYPES[p.type] + '</span>' +
      (p.actif ? '' : '<span class="badge-epuise">Masqué</span>') +
      badgeStock +
      '</div>' +
      '<div class="infos">' +
      '<span class="cat">' + echap(p.cat || p.fam) + '</span>' +
      '<h3>' + echap(p.nom) + '</h3>' +
      (p.desc ? '<p class="desc">' + echap(p.desc) + '</p>' : '') +
      '<div class="ligne-prix"><span class="pv">' + prixAffiche(p) + '</span>' +
      '<span class="marge ' + classeMarge(p) + '">' + eur(margeAuto(p)) + ' · ' + txtCoef(coef(p)) + '</span></div>' +
      (p.formats && p.formats.length
        ? '<div class="formats-mini">' + p.formats.map(function (f) {
            return '<span><strong>' + echap(f.nom || '—') + '</strong> ' + eur(f.pv) +
              (f.cout > 0 ? ' <em>(marge ' + eur(f.pv / (1 + p.tva) - f.cout) + ')</em>' : '') + '</span>';
          }).join('') + '</div>' : '') +
      (p.tvaEmporter != null ? '<div><span class="chip-emporter">à emporter TVA ' +
        (p.tvaEmporter * 100).toFixed(p.tvaEmporter === 0.055 ? 1 : 0).replace('.', ',') +
        ' % · marge ' + eur(margeEmporter(p)) + '</span></div>' : '') +
      (p.allergenes && p.allergenes.length
        ? '<div class="alg-mini" title="Allergènes déclarés">' +
          allergenesInfo(p.allergenes).map(function (a) {
            return '<span title="' + echap(a[1]) + '">' + a[2] + '</span>';
          }).join('') + '</div>' : '') +
      (manuel ? '<div>' + manuel + '</div>' : '') +
      '</div>' +
      '<div class="actions-prod">' +
      '<button type="button" class="btn btn-s btn-mini" data-editer="' + echap(p.id) + '">Modifier</button>' +
      '<button type="button" class="btn btn-s btn-mini" data-actif="' + echap(p.id) + '">' +
      (p.actif ? 'Masquer' : 'Remettre') + '</button>' +
      '</div>' +
      '</article>';
  }

  function standardAdminDefs() {
    return STANDARD_SECTIONS.concat([
      { id: 'boissons', fam: 'Boissons', titre: 'Boissons', texte: 'Alcools, vins, bières, softs, eaux, cafés et digestifs.' }
    ]);
  }

  function standardAdminItems(def) {
    return standardSectionItems(def);
  }

  function dessinerStandardStructure() {
    var hote = $('#standard-structure');
    if (!hote || !CF) return;
    var h = '<div class="standard-admin-intro"><b>La carte générale publiée</b><span>Cette source unique alimente l’administration, l’aperçu, l’impression A4, le site public et les commandes. Modifiez, déplacez, masquez ou ajoutez chaque ligne directement ici.</span></div>';
    standardAdminDefs().forEach(function (def) {
      var conf = CF.fams[def.fam] || { titre: def.titre, sous: def.texte, ordre: [], libres: [] };
      var items = standardAdminItems(def);
      h += '<section class="famille standard-rubrique" data-fam="' + echap(def.fam) + '">' +
        '<div class="standard-rubrique-head"><div><span class="standard-kicker">' + echap(def.id === 'plats' ? 'RUBRIQUE OBLIGATOIRE' : 'RUBRIQUE') + '</span>' +
        '<h3>' + echap(conf.titre || def.titre) + '</h3><p>' + echap(conf.sous || def.texte) + '</p></div>' +
        '<div class="fam-actions"><button type="button" class="btn btn-s btn-mini" data-fam-edit="1">Modifier titre</button><button type="button" class="btn btn-p btn-mini" data-fam-ligne="1">+ Ajouter une ligne</button></div></div>' +
        '<div class="fam-edit" hidden>' +
          '<label class="champ"><span>Titre de la rubrique</span><input type="text" data-fe="titre" maxlength="60" value="' + echap(conf.titre || def.titre) + '"></label>' +
          '<label class="champ"><span>Sous-titre vendeur</span><input type="text" data-fe="sous" maxlength="120" value="' + echap(conf.sous || def.texte) + '"></label>' +
          '<div class="cf-rangee"><button type="button" class="btn btn-p btn-mini" data-fam-ok="1">Enregistrer</button><button type="button" class="btn btn-s btn-mini" data-fam-annule="1">Annuler</button></div>' +
        '</div><ol class="standard-lignes">';
      items.forEach(function (it, i) {
        var id = it.kind === 'p' ? it.p.id : it.l.id;
        var nom = it.kind === 'p' ? it.p.nom : it.l.nom;
        var prix = it.kind === 'p' ? prixAffiche(it.p) : (it.l.prix ? eur(it.l.prix) : '—');
        var desc = it.kind === 'p' ? it.p.desc : (it.l.desc || it.l.sous || '');
        var allergens = it.kind === 'p' ? it.p.allergenes : it.l.allergenes;
        if (it.kind === 'l' && LF_A_EDITER && LF_A_EDITER.fam === def.fam && LF_A_EDITER.id === id) {
          h += '<li class="standard-ligne standard-ligne-edit" data-standard-id="' + echap(id) + '">' +
            '<div class="standard-inline-form"><input type="text" data-lf-champ="nom" maxlength="60" value="' + echap(it.l.nom) + '" placeholder="Nom de la ligne">' +
            '<input type="text" data-lf-champ="sous" maxlength="90" value="' + echap(it.l.sous || '') + '" placeholder="Sous-titre vendeur">' +
            '<input type="text" data-lf-champ="desc" maxlength="200" value="' + echap(it.l.desc || '') + '" placeholder="Description vendeur">' +
            '<input type="text" data-lf-champ="allergenes" maxlength="180" value="' + echap((it.l.allergenes || []).join(', ')) + '" placeholder="Allergènes : gluten, lactose…">' +
            '<input type="text" data-lf-champ="prix" inputmode="decimal" value="' + (it.l.prix || '') + '" placeholder="Prix €">' +
            '<button type="button" class="btn btn-p btn-mini" data-lf-ok="' + echap(id) + '">Enregistrer</button><button type="button" class="btn btn-s btn-mini" data-lf-annule="1">Annuler</button></div></li>';
          return;
        }
        h += '<li class="standard-ligne' + (it.kind === 'p' && !it.p.actif ? ' inactif' : '') + '" data-standard-id="' + echap(id) + '">' +
          '<span class="standard-ligne-order"><button type="button" class="btn btn-mini" data-standard-order="up" data-standard-id="' + echap(id) + '" title="Monter">▲</button><button type="button" class="btn btn-mini" data-standard-order="down" data-standard-id="' + echap(id) + '" title="Descendre">▼</button></span>' +
          '<span class="standard-ligne-info"><b>' + echap(nom) + '</b>' + (desc ? '<small>' + echap(desc) + '</small>' : '') + (allergens && allergens.length ? '<em title="Allergènes">Allergènes : ' + htmlAllergenes(allergens) + '</em>' : '') + '</span>' +
          '<strong class="standard-ligne-prix">' + prix + '</strong>' +
          '<span class="standard-ligne-actions">' + (it.kind === 'p' ? '<button type="button" class="btn btn-s btn-mini" data-editer="' + echap(id) + '">Modifier</button><button type="button" class="btn btn-danger btn-mini" data-standard-remove="' + echap(id) + '">Retirer</button>' : '<button type="button" class="btn btn-s btn-mini" data-lf-edit="' + echap(id) + '">Modifier</button><button type="button" class="btn btn-danger btn-mini" data-lf-del="' + echap(id) + '">Supprimer</button>') + '</span>' +
          '</li>';
      });
      var exclus = conf.exclus || [];
      var retirable = CARTE.filter(function (p) { return String(p.fam) === def.fam && exclus.indexOf(p.id) >= 0; });
      h += '</ol>' + (!items.length ? '<p class="standard-vide">Aucune ligne. Utilisez « Ajouter une ligne ».</p>' : '') +
        (retirable.length ? '<div class="standard-reintegrer"><select data-standard-reintegrer-select>' + retirable.map(function (p) { return '<option value="' + echap(p.id) + '">' + echap(p.nom) + '</option>'; }).join('') + '</select><button type="button" class="btn btn-s btn-mini" data-standard-reintegrer>Réintégrer une ligne</button></div>' : '') +
        '</section>';
    });
    hote.innerHTML = h;
  }

  function dessinerCarte() {
    if (CARTE_VIEW === 'moment') { dessinerVueMoment(); return; }
    if (CARTE_VIEW !== 'standard') { dessinerVueExtra(CARTE_VIEW); return; }
    $('#outils-standard').hidden = false;
    dessinerStandardStructure();
    var liste = produitsFiltres();
    $('#nb-visibles').textContent = liste.length + (liste.length > 1 ? ' produits' : ' produit');

    var parFam = {};
    var ordre = [];
    CARTE.forEach(function (p) {                       // l'ordre des familles suit la carte
      if (!parFam[p.fam]) { parFam[p.fam] = []; ordre.push(p.fam); }
    });
    liste.forEach(function (p) { if (parFam[p.fam]) parFam[p.fam].push(p); });

    var h = '';
    ordre.forEach(function (fam) {
      var ps = parFam[fam];
      if (!ps.length) return;
      var confF = CF ? CF.fams[fam] : null;
      if (confF && confF.ordre && confF.ordre.length) {
        var rang = {};
        confF.ordre.forEach(function (id, i) { rang[id] = i; });
        ps.sort(function (a, b) {
          return (rang[a.id] == null ? 999999 : rang[a.id]) -
            (rang[b.id] == null ? 999999 : rang[b.id]);
        });
      }
      var libres = confF ? confF.libres : [];
      h += '<section class="famille" data-fam="' + echap(fam) + '">' +
        '<div class="fam-tete"><h2>' + echap(fam) +
        ' <span class="nb">' + ps.length + '</span></h2>' +
        '<span class="fam-actions">' +
          '<button type="button" class="btn btn-s btn-mini" data-fam-edit="1">✏️ Titre & sous-titre</button>' +
          '<button type="button" class="btn btn-s btn-mini" data-fam-ligne="1">+ Ligne libre</button>' +
        '</span></div>' +
        (confF && (confF.titre !== fam || confF.sous)
          ? '<p class="fam-ardoise">📋 Ardoise : <b>' + echap(confF.titre) + '</b>' +
            (confF.sous ? ' — <i>' + echap(confF.sous) + '</i>' : '') + '</p>'
          : '') +
        '<div class="fam-edit" hidden>' +
          '<label class="champ"><span>Titre affiché sur l\'ardoise</span>' +
          '<input type="text" data-fe="titre" maxlength="60" value="' + echap(confF ? confF.titre : fam) + '"></label>' +
          '<label class="champ"><span>Sous-titre de la catégorie</span>' +
          '<input type="text" data-fe="sous" maxlength="120" value="' + echap(confF ? confF.sous : '') + '"></label>' +
          '<div class="cf-rangee">' +
            '<button type="button" class="btn btn-p btn-mini" data-fam-ok="1">Enregistrer</button>' +
            '<button type="button" class="btn btn-s btn-mini" data-fam-annule="1">Annuler</button>' +
          '</div>' +
        '</div>';
      if (libres.length) {
        h += '<div class="fam-libres"><span class="t">Lignes libres (ardoise) :</span>' +
          libres.map(function (l) {
            var edit = LF_A_EDITER && LF_A_EDITER.fam === fam && LF_A_EDITER.id === l.id;
            return '<span class="lf-chip">' + echap(l.nom) +
              (l.prix > 0 ? ' · <b>' + eur(l.prix) + '</b>' : '') +
              ' <button type="button" class="btn btn-mini" data-lf-edit="' + echap(l.id) + '" title="Modifier">✏️</button>' +
              ' <button type="button" class="btn btn-mini" data-lf-del="' + echap(l.id) + '" title="Supprimer">✕</button>' +
              (edit ? '</span><div class="lf-form">' +
                '<input type="text" data-lf-champ="nom" maxlength="60" value="' + echap(l.nom) + '" placeholder="Nom (ex. : Menu enfant)">' +
                '<input type="text" data-lf-champ="sous" maxlength="90" value="' + echap(l.sous) + '" placeholder="Sous-titre vendeur (facultatif)">' +
                '<input type="text" data-lf-champ="desc" maxlength="200" value="' + echap(l.desc || '') + '" placeholder="Description vendeur (facultatif)">' +
                '<input type="text" data-lf-champ="allergenes" maxlength="180" value="' + echap((l.allergenes || []).join(', ')) + '" placeholder="Allergènes : gluten, lactose…">' +
                '<input type="text" data-lf-champ="prix" inputmode="decimal" value="' +
                  (l.prix > 0 ? String(l.prix).replace('.', ',') : '') + '" placeholder="Prix €">' +
                '<div class="cf-rangee">' +
                  '<button type="button" class="btn btn-p btn-mini" data-lf-ok="' + echap(l.id) + '">OK</button>' +
                  '<button type="button" class="btn btn-s btn-mini" data-lf-annule="1">Annuler</button>' +
                '</div></div>'
              : '') +
              '</span>';
          }).join('') + '</div>';
      }
      h += '<div class="grille">' + ps.map(function (p, i) {
        var actions = '<div class="standard-ordre" aria-label="Ordre de la ligne">' +
          '<button type="button" class="btn btn-s btn-mini" data-standard-order="up" data-standard-id="' + echap(p.id) + '" title="Monter">▲</button>' +
          '<button type="button" class="btn btn-s btn-mini" data-standard-order="down" data-standard-id="' + echap(p.id) + '" title="Descendre">▼</button>' +
          '</div>';
        return carteProduitHTML(p).replace('</article>', actions + '</article>');
      }).join('') + '</div></section>';
    });
    $('#liste-produits').innerHTML = h ||
      '<p class="aide" style="text-align:center;padding:40px 0">Aucun produit ne correspond. ' +
      'Ajoutez-en un avec le bouton « + Ajouter ».</p>';
  }

  // Vue d'une carte dédiée (formules, vins, glaces, bières) dans l'onglet.
  function dessinerVueExtra(cle) {
    var conf = CF.extras[cle];
    if (!conf) return;
    $('#outils-standard').hidden = true;
    var items = itemsExtra(cle);
    $('#nb-visibles').textContent = items.length + (items.length > 1 ? ' lignes' : ' ligne');
    var h = '<p class="note-vue">Éditez « <b>' + echap(conf.titre) + '</b> » : titre &amp; sous-titre, ' +
      'ordre ▲▼, lignes libres et produits du catalogue. Ces lignes apparaissent sur ' +
      'l\'ardoise et sur le site (apercu-carte.html).</p>' +
      '<div class="cf-fam cf-extras carte-bloc" data-ex="' + echap(cle) + '">' +
      cfExtrasCardHTML(cle) + '</div>';
    $('#liste-produits').innerHTML = h;
    if (LIGNE_A_EDITER) ouvrirEditeurDiffere($('#liste-produits'));
  }

  // ==========================================================
  //  Écran « Marges »
  // ==========================================================
  function valeurTri(p, cle) {
    switch (cle) {
      case 'nom': return norm(p.nom);
      case 'pv': return p.pv;
      case 'cout': return p.cout;
      case 'marge': return margeAuto(p);
      case 'taux': return tauxMarge(p);
      case 'coef': return coef(p);
      case 'cible': return p.margeManuelle ? p.margeManuelle.valeur : -1;
      default: return norm(p.fam + p.cat + p.nom);
    }
  }

  function dessinerMarges() {
    var actifs = CARTE.filter(function (p) { return p.actif; });
    var lg = actifs.length || 1;
    var margeMoy = actifs.reduce(function (s, p) { return s + margeAuto(p); }, 0) / lg;
    var tauxMoy = actifs.reduce(function (s, p) { return s + tauxMarge(p); }, 0) / lg;
    var sous = actifs.filter(sousObjectif).length;
    var manuels = actifs.filter(function (p) { return p.margeManuelle; }).length;
    var emportes = actifs.filter(function (p) { return p.tvaEmporter != null; }).length;

    $('#kpis').innerHTML =
      '<div class="kpi"><div class="v">' + actifs.length + '</div><div class="l">Produits à la carte</div></div>' +
      '<div class="kpi"><div class="v">' + eur(margeMoy) + '</div><div class="l">Marge moyenne / portion</div></div>' +
      '<div class="kpi"><div class="v">' + pct(tauxMoy) + '</div><div class="l">Taux de marge moyen</div></div>' +
      '<div class="kpi' + (sous ? ' alerte' : '') + '"><div class="v">' + sous + '</div>' +
      '<div class="l">Sous l’objectif de coefficient</div></div>' +
      '<div class="kpi"><div class="v">' + manuels + '</div><div class="l">Marges fixées à la main</div></div>' +
      '<div class="kpi"><div class="v">' + emportes + '</div><div class="l">Vendus aussi à l’emporté</div></div>';

    var lignes = CARTE.slice().sort(function (a, b) {
      var va = valeurTri(a, TRI.cle), vb = valeurTri(b, TRI.cle);
      if (va < vb) return -1 * TRI.sens;
      if (va > vb) return 1 * TRI.sens;
      return 0;
    });

    var h = lignes.map(function (p) {
      var mm = p.margeManuelle;
      var sugg = mm ? prixPourMargeCible(p) : null;
      return '<tr data-id="' + echap(p.id) + '"' +
        (sousObjectif(p) ? ' class="alerte-marge"' : (p.actif ? '' : ' class="inactif"')) + '>' +
        '<td><span class="puce ' + classeMarge(p) + '"></span>' + echap(p.nom) +
        '<br><span class="type-mini">' + TYPES[p.type] + ' · ' + echap(p.fam) + '</span></td>' +
        '<td class="num">' + eur(p.pv) + '</td>' +
        '<td class="num">' + eur(p.cout) + '</td>' +
        '<td class="num"><strong>' + eur(margeAuto(p)) + '</strong></td>' +
        '<td class="num">' + pct(tauxMarge(p)) + '</td>' +
        '<td class="num">' + txtCoef(coef(p)) + '</td>' +
        '<td class="num">' + (mm
          ? echap(libelleCible(p)) + (sugg && Math.abs(sugg - p.pv) > 0.001
              ? '<br><span class="type-mini">→ ' + eur(sugg) + ' TTC</span>' : '')
          : '<span class="type-mini">auto</span>') + '</td>' +
        '<td class="num">' + (p.tvaEmporter != null
          ? eur(margeEmporter(p)) + '<br><span class="type-mini">TVA ' +
            (p.tvaEmporter * 100).toFixed(p.tvaEmporter === 0.055 ? 1 : 0).replace('.', ',') + ' %</span>'
          : '<span class="type-mini">—</span>') + '</td>' +
        '<td>' + (p.formats && p.formats.length
          ? p.formats.map(function (f) {
              return '<span class="type-mini"><strong>' + echap(f.nom || '—') + '</strong> ' + eur(f.pv) +
                (f.cout > 0 ? ' · ' + eur(f.pv / (1 + p.tva) - f.cout) + ' · ' +
                  txtCoef(f.pv / (1 + p.tva) / f.cout) : '') + '</span>';
            }).join('<br>')
          : '<span class="type-mini">—</span>') + '</td>' +
        '<td class="num"><button type="button" class="btn btn-s btn-mini" data-editer="' +
        echap(p.id) + '">⚙</button></td>' +
        '</tr>';
    }).join('');
    $('#table-marges tbody').innerHTML = h;

    $$('#table-marges th').forEach(function (th) {
      var base = th.textContent.replace(/ [▲▼]$/, '');
      th.textContent = base + (th.dataset.tri === TRI.cle ? (TRI.sens > 0 ? ' ▲' : ' ▼') : '');
    });

    var famStats = {};
    CARTE.forEach(function (p) {
      if (!p.actif) return;
      var f = famStats[p.fam] || (famStats[p.fam] = { n: 0, marge: 0, taux: 0 });
      f.n++; f.marge += margeAuto(p); f.taux += tauxMarge(p);
    });
    $('#stats-familles').innerHTML = '<div class="mini-fam">' + Object.keys(famStats).map(function (fam) {
      var f = famStats[fam];
      return '<div class="fam-stat"><div class="t">' + echap(fam) + '</div>' +
        '<div class="d">' + f.n + ' produit' + (f.n > 1 ? 's' : '') + ' · marge moy. ' +
        eur(f.marge / f.n) + ' · ' + pct(f.taux / f.n) + '</div></div>';
    }).join('') + '</div>';
  }

  // ==========================================================
  //  Écran « Cartes du jour »
  // ==========================================================
  function candidatsArdoise(cle) {
    return CARTE.filter(function (p) {
      if (!p.actif) return false;
      if (cle === 'bieres') return p.type === 'boisson';
      if (cle === 'desserts') return norm(p.fam).indexOf('dessert') >= 0;
      return p.type === 'plat' || p.type === 'formule';
    });
  }

  function lignesArdoise(cle) {
    // produits du catalogue (dans l'ordre de la sélection) puis lignes libres
    var a = ARDOISES[cle];
    var lignes = [];
    a.selection.forEach(function (id) {
      var p = parId(id);
      if (p && p.actif) lignes.push({ nom: p.nom, desc: p.desc, prix: p.pv, prixLib: prixAffiche(p), id: id });
    });
    a.libres.forEach(function (l, i) {
      lignes.push({ nom: l.nom, desc: l.desc, prix: l.prix, libre: i });
    });
    return lignes;
  }

  function ardoiseVide(cle) { return lignesArdoise(cle).length === 0; }

  function lignePapierHTML(l) {
    return '<div class="l"><div class="lg"><span class="nom">' + echap(l.nom) + '</span>' +
      '<span class="pts" aria-hidden="true"></span><span class="prix">' +
      (l.prixLib || eur(l.prix)) + '</span></div>' +
      (l.desc ? '<p class="d">' + echap(l.desc) + '</p>' : '') + '</div>';
  }

  /** Rendu « papier » d'une carte, utilisé pour l'aperçu et l'impression. */
  function ardoisePapierHTML(cle, grande) {
    var a = ARDOISES[cle];
    var lignes = lignesArdoise(cle);
    return '<section class="page-ardoise' + (grande ? ' grande' : '') + '">' +
      '<header><h1>' + echap(a.titre) + '</h1>' +
      (a.sous ? '<p class="sous">' + echap(a.sous) + '</p>' : '') + '</header>' +
      (lignes.length
        ? '<div class="lignes">' + lignes.map(lignePapierHTML).join('') + '</div>'
        : '<p class="rien">Rien à l’ardoise pour l’instant.</p>') +
      '<footer>' + echap(ADRESSE) + '<br>Prix TTC, service compris' +
      '<span class="date"> — ' + echap(dateDuJour()) + '</span></footer>' +
      '</section>';
  }

  function ligneEditionHTML(l, cle, index) {
    var id = l.id || ('l' + l.libre);
    return '<div class="ligne-edit">' +
      '<span class="le-nom">' + echap(l.nom) +
      (l.libre != null ? ' <span class="le-libre">ligne libre</span>' : '') + '</span>' +
      '<span class="le-prix">' + eur(l.prix) + '</span>' +
      '<span class="le-actions">' +
      '<button type="button" data-monter="' + cle + ':' + index + '" aria-label="Monter ' + echap(l.nom) + '" title="Monter">↑</button>' +
      '<button type="button" data-descendre="' + cle + ':' + index + '" aria-label="Descendre ' + echap(l.nom) + '" title="Descendre">↓</button>' +
      '<button type="button" data-retirer="' + cle + ':' + index + '" aria-label="Retirer ' + echap(l.nom) + '" title="Retirer">×</button>' +
      '</span></div>';
  }

  function dessinerArdoises() {
    var conteneur = $('#ardoises');
    if (!conteneur) return;
    conteneur.innerHTML = Object.keys(ARDOISE_DEFS).map(function (cle) {
      var a = ARDOISES[cle];
      var lignes = lignesArdoise(cle);
      return '<div class="ardoise-bloc" data-ardoise="' + cle + '">' +
        '<div class="ab-tete">' +
        '<div><h2>' + echap(a.titre) +
        ' <button type="button" class="mini-lien" data-titre-ardoise="' + cle + '" title="Modifier le titre">✎</button></h2>' +
        '<p class="aide">' + echap(a.sous) +
        ' <button type="button" class="mini-lien" data-sous-ardoise="' + cle + '" title="Modifier le sous-titre">✎</button></p></div>' +
        (ardoiseVide(cle) ? '<span class="badge-vide">vide</span>' :
          '<span class="badge-plein">' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '') + '</span>') +
        '</div>' +
        (lignes.length
          ? '<div class="ab-lignes">' + lignes.map(function (l, i) {
              return ligneEditionHTML(l, cle, i);
            }).join('') + '</div>'
          : '<p class="aide">Composez cette carte depuis vos produits, ou ajoutez des lignes libres.</p>') +
        '<div class="ab-actions">' +
        '<button type="button" class="btn btn-s btn-mini" data-composer="' + cle + '">Composer manuellement…</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-libre="' + cle + '">+ Ligne libre</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-auto="' + cle + '">Depuis l’inventaire</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-apercu="' + cle + '">Aperçu</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-imprimer="' + cle + '">Imprimer</button>' +
        '</div>' +
        '<form class="mini-form" data-form-libre="' + cle + '" hidden>' +
        '<input type="text" data-l-nom maxlength="80" placeholder="Nom (ex. : Blanche du pays)">' +
        '<input type="text" data-l-desc maxlength="160" placeholder="Descriptif court (facultatif)">' +
        '<input type="number" data-l-prix min="0" step="0.10" inputmode="decimal" placeholder="Prix €">' +
        '<button type="submit" class="btn btn-p btn-mini">Ajouter</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-annuler-libre>Annuler</button>' +
        '</form>' +
        '</div>';
    }).join('');
  }

  // -------- composition depuis le catalogue (cueillette) --------
  // mode « carte dédiée » : CUEILLETTE.cle = 'extras:<cle>'
  function ouvrirCueilletteExtra(cle) {
    var conf = CF.extras[cle];
    if (!conf) return;
    CUEILLETTE = {
      cle: 'extras:' + cle,
      choisis: conf.ordre.filter(function (id) { return !!parId(id); }),
      disponibles: false
    };
    $('#cueillette-disponibles').checked = false;
    $('#cueillette-titre').textContent = conf.titre + ' — produits du catalogue';
    $('#cueillette-recherche').value = '';
    dessinerCueillette();
    $('#cueillette').hidden = false;
    $('#cueillette-recherche').focus();
  }

  function ouvrirCueillette(cle) {
    CUEILLETTE = { cle: cle, choisis: ARDOISES[cle].selection.slice(), disponibles: false };
    $('#cueillette-disponibles').checked = false;
    $('#cueillette-titre').textContent = ARDOISES[cle].titre;
    $('#cueillette-recherche').value = '';
    dessinerCueillette();
    $('#cueillette').hidden = false;
    $('#cueillette-recherche').focus();
  }

  function fermerCueillette() {
    $('#cueillette').hidden = true;
    CUEILLETTE = null;
  }

  function dessinerCueillette() {
    if (!CUEILLETTE) return;
    var modeExtra = CUEILLETTE.cle.indexOf('extras:') === 0;
    var modeMoment = CUEILLETTE.cle.indexOf('moment:') === 0;
    var q = norm($('#cueillette-recherche').value);
    var candidats = ((modeExtra || modeMoment)
      ? CARTE.filter(function (p) { return p.actif; })
      : candidatsArdoise(CUEILLETTE.cle)).filter(function (p) {
      if (CUEILLETTE.disponibles && !produitDisponible(p)) return false;
      return !q || norm(p.nom + ' ' + p.fam + ' ' + p.cat).indexOf(q) >= 0;
    });
    var info = $('#cueillette-stock-info');
    if (info) {
      info.textContent = HIBOUTIK.produits.length
        ? 'Inventaire Hiboutik synchronisé le ' + new Date(HIBOUTIK.maj).toLocaleString('fr-FR') + '.'
        : 'Aucun inventaire Hiboutik synchronisé : les produits non suivis restent disponibles.';
    }
    $('#cueillette-liste').innerHTML = candidats.map(function (p) {
      var ok = CUEILLETTE.choisis.indexOf(p.id) >= 0;
      var stock = libelleStock(p);
      return '<label class="cueillette-ligne' + (ok ? ' on' : '') + '">' +
        '<input type="checkbox" data-cueillette="' + echap(p.id) + '"' + (ok ? ' checked' : '') + '>' +
        '<span class="cl-nom">' + echap(p.nom) +
        '<span class="cl-meta">' + echap(p.fam) + (p.cat ? ' · ' + echap(p.cat) : '') +
        ' · ' + echap(stock) + '</span></span>' +
        '<span class="cl-prix">' + eur(p.pv) + '</span></label>';
    }).join('') || '<p class="aide" style="padding:20px">Aucun produit disponible ne correspond.</p>';
  }

  function validerCueillette() {
    if (!CUEILLETTE) return;
    if (CUEILLETTE.cle.indexOf('moment:') === 0) {
      var cleM = CUEILLETTE.cle.slice(7);
      var confM = CF.moment[cleM];
      var libresM = confM.libres.map(function (l) { return l.id; });
      var gardesM = confM.ordre.filter(function (id) {
        return libresM.indexOf(id) >= 0 || CUEILLETTE.choisis.indexOf(id) >= 0;
      });
      CUEILLETTE.choisis.forEach(function (id) {
        if (gardesM.indexOf(id) < 0) gardesM.push(id);
      });
      confM.ordre = gardesM;
      fermerCueillette();
      sauver();
      dessinerCF();
      if (ECRAN === 'carte') dessinerCarte();
      toast(confM.titre + ' : ' + gardesM.length + ' ligne(s)');
      return;
    }
    if (CUEILLETTE.cle.indexOf('extras:') === 0) {
      var cleX = CUEILLETTE.cle.slice(7);
      var confX = CF.extras[cleX];
      var libresX = confX.libres.map(function (l) { return l.id; });
      var gardes = confX.ordre.filter(function (id) {
        return libresX.indexOf(id) >= 0 || CUEILLETTE.choisis.indexOf(id) >= 0;
      });
      CUEILLETTE.choisis.forEach(function (id) {
        if (gardes.indexOf(id) < 0) gardes.push(id);
      });
      confX.ordre = gardes;
      fermerCueillette();
      sauver();
      dessinerCF();
      if (ECRAN === 'carte') dessinerCarte();
      toast(confX.titre + ' : ' + gardes.length + ' ligne(s)');
      return;
    }
    var a = ARDOISES[CUEILLETTE.cle];
    // l'ordre existant est conservé, les nouveaux rejoignent la fin
    a.selection = a.selection.filter(function (id) {
      return CUEILLETTE.choisis.indexOf(id) >= 0;
    });
    CUEILLETTE.choisis.forEach(function (id) {
      if (a.selection.indexOf(id) < 0) a.selection.push(id);
    });
    var cle = CUEILLETTE.cle;
    fermerCueillette();
    sauver();
    dessinerArdoises();
    toast(a.titre + ' : ' + ARDOISES[cle].selection.length + ' produit(s) sélectionné(s)');
  }

  // -------- lignes libres --------
  function ajouterLibre(cle, form) {
    var nom = $('[data-l-nom]', form).value.trim();
    var desc = $('[data-l-desc]', form).value.trim();
    var prix = parseFloat(String($('[data-l-prix]', form).value).replace(',', '.')) || 0;
    if (!nom || !(prix > 0)) { toast('Indiquez un nom et un prix'); return; }
    ARDOISES[cle].libres.push({ nom: nom, desc: desc, prix: Math.round(prix * 100) / 100 });
    sauver();
    dessinerArdoises();
    toast(nom + ' ajouté à « ' + ARDOISES[cle].titre + ' »');
  }

  // -------- réorganisation / retrait --------
  function deplacerLigne(cle, index, delta) {
    var lignes = lignesArdoise(cle);
    var cible = lignes[index];
    if (!cible) return;
    var a = ARDOISES[cle];
    var autre = index + delta;
    if (autre < 0 || autre >= lignes.length) return;
    var voisin = lignes[autre];
    // on n'échange qu'au sein d'une même liste (catalogue ⇔ catalogue, libre ⇔ libre)
    if ((cible.id != null) !== (voisin.id != null)) { toast('Lignes du catalogue d’abord, lignes libres ensuite'); return; }
    if (cible.id != null) {
      var i = a.selection.indexOf(cible.id), j = a.selection.indexOf(voisin.id);
      if (i >= 0 && j >= 0) { var t = a.selection[i]; a.selection[i] = a.selection[j]; a.selection[j] = t; }
    } else {
      var k = a.libres[cible.libre];
      a.libres[cible.libre] = a.libres[voisin.libre];
      a.libres[voisin.libre] = k;
    }
    sauver();
    dessinerArdoises();
  }

  function retirerLigne(cle, index) {
    var lignes = lignesArdoise(cle);
    var cible = lignes[index];
    if (!cible) return;
    var a = ARDOISES[cle];
    if (cible.id != null) {
      a.selection.splice(a.selection.indexOf(cible.id), 1);
    } else {
      a.libres.splice(cible.libre, 1);
    }
    sauver();
    dessinerArdoises();
  }

  // -------- édition des titres --------
  function editerTexteArdoise(cle, champ) {
    var a = ARDOISES[cle];
    var actuel = champ === 'sous' ? a.sous : a.titre;
    var saisie = prompt(champ === 'sous' ? 'Sous-titre de la carte :' : 'Titre de la carte :', actuel);
    if (saisie == null) return;
    saisie = saisie.trim();
    if (champ === 'sous') a.sous = saisie;
    else if (saisie) a.titre = saisie;
    sauver();
    dessinerArdoises();
  }

  // -------- aperçu et impression --------
  function apercuArdoise(cle) {
    if (ardoiseVide(cle)) { toast('Cette carte est encore vide'); return; }
    $('#apercu-contenu').innerHTML = ardoisePapierHTML(cle, true);
    $('#apercu').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function fermerApercu() {
    $('#apercu').hidden = true;
    document.body.style.overflow = '';
  }

  function imprimerCartes(uneSeule) {
    var cles = uneSeule ? [uneSeule] : Object.keys(ARDOISE_DEFS);
    cles = cles.filter(function (cle) { return !ardoiseVide(cle); });
    if (!cles.length) { toast('Rien à imprimer : composez d’abord une carte'); return; }
    $('#zone-impression').innerHTML = cles.map(function (cle) {
      return ardoisePapierHTML(cle, false);
    }).join('');
    setTimeout(function () { window.print(); }, 60);
  }

  // ==========================================================
  //  Fiche produit (création / édition)
  // ==========================================================
  function famillesPour(type) {
    var vues = {};
    var out = [];
    CARTE.forEach(function (p) {
      if (p.type === type && !vues[p.fam]) { vues[p.fam] = 1; out.push(p.fam); }
    });
    var defauts = { formule: ['Formules'], plat: ['Pizzas'], boisson: ['Boissons'], cocktail: ['Cocktails'] };
    (defauts[type] || []).forEach(function (f) {
      if (!vues[f]) { vues[f] = 1; out.push(f); }
    });
    return out;
  }

  function remplirFamilles(type, choisie) {
    var sel = $('#f-fam');
    var fs = famillesPour(type);
    sel.innerHTML = fs.map(function (f) {
      return '<option value="' + echap(f) + '"' + (f === choisie ? ' selected' : '') + '>' +
        echap(f) + '</option>';
    }).join('') + '<option value="__nouvelle">＋ Nouvelle famille…</option>';
    majCategories(type, sel.value);
  }

  function majCategories(type, fam) {
    $('#cats-existantes').innerHTML = CARTE.filter(function (p) {
      return p.type === type && p.fam === fam && p.cat;
    }).map(function (p) { return '<option value="' + echap(p.cat) + '">'; }).join('');
  }

  // -------- formats de prix (verre/bouteille, 25/50 cl…) --------
  function ligneFormatHTML(f) {
    return '<div class="format-ligne">' +
      '<input type="text" data-f-nom maxlength="40" placeholder="Format (ex. Verre)" value="' +
        echap(f && f.nom || '') + '">' +
      '<input type="number" data-f-pv min="0" step="0.10" inputmode="decimal" placeholder="Prix €" value="' +
        (f && f.pv ? f.pv : '') + '">' +
      '<input type="number" data-f-cout min="0" step="0.05" inputmode="decimal" placeholder="Coût €" value="' +
        (f && f.cout ? f.cout : '') + '">' +
      '<button type="button" data-format-moins aria-label="Retirer ce format">×</button>' +
      '</div>';
  }

  function remplirFormats(formats) {
    $('#formats-liste').innerHTML = (formats && formats.length
      ? formats.map(ligneFormatHTML).join('') : '');
    var aideExistante = $('#pave-formats .aide-vide');
    if (aideExistante) aideExistante.remove();
    if (!formats || !formats.length) {
      var p = document.createElement('p');
      p.className = 'aide aide-vide';
      p.textContent = 'Prix unique — ajoutez un format seulement si le produit existe en plusieurs contenances.';
      $('#formats-liste').after(p);
    }
  }

  function lireFormats() {
    return $$('.format-ligne', $('#formats-liste')).map(function (l) {
      var pv = parseFloat(String($('[data-f-pv]', l).value).replace(',', '.')) || 0;
      return {
        nom: $('[data-f-nom]', l).value.trim(),
        pv: Math.round(pv * 100) / 100,
        cout: Math.round((parseFloat(String($('[data-f-cout]', l).value)
          .replace(',', '.')) || 0) * 100) / 100
      };
    }).filter(function (f) { return f.nom || f.pv > 0; });
  }

  // -------- allergènes --------
  function dessinerAllergenes(coches) {
    coches = coches || [];
    $('#allergenes-grille').innerHTML = ALLERGENES.map(function (a) {
      var ok = coches.indexOf(a[0]) >= 0;
      return '<label class="alg-case' + (ok ? ' on' : '') + '"' +
        ' title="' + echap(a[1]) + '">' +
        '<input type="checkbox" data-alg="' + a[0] + '"' + (ok ? ' checked' : '') + '>' +
        '<span class="alg-emoji">' + a[2] + '</span><span>' + a[1] + '</span></label>';
    }).join('');
  }

  function lireAllergenes() {
    return $$('#allergenes-grille input:checked').map(function (c) {
      return c.getAttribute('data-alg');
    });
  }

  function ouvrirFiche(id) {
    var p = id ? parId(id) : null;
    EN_EDITION = p ? p.id : null;
    PHOTO_BROUILLON = p ? p.photo : null;
    PHOTO_ARDOISE_BROUILLON = p ? (p.photoArdoise || null) : null;
    majBoutonsPhotoArdoise();

    $('#fiche-titre').textContent = p ? p.nom : 'Nouveau produit';
    $('#f-nom').value = p ? p.nom : '';
    $('#f-sous').value = p ? (p.sous || '') : '';
    $('#f-desc').value = p ? p.desc : '';
    $('#f-type').value = p ? p.type : 'plat';
    remplirFamilles($('#f-type').value, p ? p.fam : undefined);
    if (p && famillesPour(p.type).indexOf(p.fam) < 0) {
      // famille inconnue du type (import) : on la propose quand même
      var opt = document.createElement('option');
      opt.value = p.fam; opt.textContent = p.fam; opt.selected = true;
      $('#f-fam').insertBefore(opt, $('#f-fam').lastChild);
    }
    $('#f-cat').value = p ? p.cat : '';
    $('#f-pv').value = p ? p.pv : '';
    $('#f-cout').value = p && p.cout ? p.cout : '';
    $('#f-tva').value = p ? String(p.tva) : '0.10';
    $('#f-tva-emporter').value = p && p.tvaEmporter != null ? String(p.tvaEmporter) : '';
    $('#f-actif').checked = p ? p.actif : true;
    $('#f-suivi-stock').checked = p ? p.suiviStock : false;
    $('#f-stock').value = p ? p.stock : 0;
    $('#f-stock-mini').value = p ? p.stockMini : 0;
    $('#f-hiboutik-barcode').value = p ? p.hiboutikBarcode : '';
    $('#f-hiboutik-creer').checked = false;
    $('#f-hiboutik-creer').disabled = !!p || !HIBOUTIK.creation || !SYNC_TOKEN;
    $('#f-hiboutik-aide').textContent = HIBOUTIK.creation
      ? (p ? 'Produit local' + (p.hiboutikId ? ' lié à Hiboutik (' + p.hiboutikId + ')' : ' non lié') + '.'
        : 'Cette action crée le produit dans Hiboutik après votre confirmation.')
      : (HIBOUTIK.configure
        ? 'Connexion Hiboutik OK, mais les IDs de catégorie et de taxe doivent être configurés sur le serveur.'
        : 'Hiboutik n’est pas configuré sur le serveur de gestion. Le produit sera créé localement.');
    $('#f-hiboutik-lie').textContent = p && p.hiboutikId
      ? 'ID Hiboutik : ' + p.hiboutikId + (p.hiboutikStock != null ? ' · ' + libelleStock(p) : '') : '';
    remplirFormats(p ? p.formats : []);
    dessinerAllergenes(p ? p.allergenes : []);

    // marge manuelle existante
    var mm = p && p.margeManuelle;
    $('#f-marge-unite').value = mm ? mm.unite : 'eur';
    $('#f-marge-valeur').value = mm ? mm.valeur : '';
    $('#btn-marge-auto').hidden = !mm;
    $('#btn-supprimer').hidden = !p;
    $('#f-erreur').hidden = true;

    majApercuPhoto();
    majChiffresMarge();
    $('#f-erreur').hidden = true;
    $('#voile').hidden = false;
    $('#fiche').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#f-nom').focus();
  }

  function fermerFiche() {
    $('#voile').hidden = true;
    $('#fiche').hidden = true;
    document.body.style.overflow = '';
    EN_EDITION = null;
    PHOTO_BROUILLON = null;
  }

  function majApercuPhoto() {
    var img = $('#img-apercu');
    if (PHOTO_BROUILLON) {
      img.src = PHOTO_BROUILLON;
      img.hidden = false;
      $('#sans-photo').hidden = true;
      $('#btn-photo-retirer').hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      $('#sans-photo').hidden = false;
      $('#btn-photo-retirer').hidden = true;
    }
  }

  function majBoutonsPhotoArdoise() {
    var retire = $('#btn-photo-ardoise-retirer');
    if (retire) retire.hidden = !PHOTO_ARDOISE_BROUILLON;
  }

  function lireNombre(sel) {
    var v = parseFloat(String($(sel).value).replace(',', '.').replace(/[^0-9.\-]/g, ''));
    return isFinite(v) ? v : 0;
  }

  /** Recalcule l'affichage de la marge dans la fiche, en direct. */
  function majChiffresMarge() {
    var brouillon = {
      pv: lireNombre('#f-pv'),
      cout: lireNombre('#f-cout'),
      tva: parseFloat($('#f-tva').value) || 0.1,
      margeManuelle: null
    };
    var ht = pvHT(brouillon);
    var marge = margeAuto(brouillon);
    $('#m-ht').textContent = eur(ht);
    $('#m-marge').textContent = eur(marge);
    $('#m-taux').textContent = pct(tauxMarge(brouillon));
    $('#m-coef').textContent = txtCoef(coef(brouillon));

    var empSel = $('#f-tva-emporter');
    if (empSel) {
      brouillon.tvaEmporter = empSel.value === '' ? null : parseFloat(empSel.value);
      var ie = $('#m-emporter');
      if (ie) {
        if (brouillon.tvaEmporter != null && brouillon.cout > 0 && brouillon.pv > 0) {
          ie.textContent = 'À l’emporté (TVA ' +
            (brouillon.tvaEmporter * 100).toFixed(brouillon.tvaEmporter === 0.055 ? 1 : 0)
              .replace('.', ',') + ' %) : marge de ' + eur(margeEmporter(brouillon)) +
            ' au lieu de ' + eur(marge) + '.';
          ie.hidden = false;
        } else {
          ie.textContent = '';
          ie.hidden = true;
        }
      }
    }
    var verdict = $('#m-verdict');
    if (brouillon.cout > 0 && brouillon.pv > 0) {
      if (sousObjectif(brouillon)) {
        verdict.textContent = '⚠ Sous l’objectif (coeff. ' +
          objectifCoef(brouillon).toFixed(1).replace('.', ',') + ' visé).';
        verdict.className = 'verdict ko';
      } else {
        verdict.textContent = '✓ Dans l’objectif de coefficient.';
        verdict.className = 'verdict ok';
      }
    } else {
      verdict.textContent = '';
      verdict.className = 'verdict';
    }

    // marge manuelle -> prix suggéré
    var unite = $('#f-marge-unite').value;
    var valeur = parseFloat(String($('#f-marge-valeur').value).replace(',', '.')) || 0;
    var sugg = $('#m-suggestion');
    var btn = $('#btn-appliquer-prix');
    if (valeur > 0 && brouillon.cout > 0) {
      brouillon.margeManuelle = { unite: unite, valeur: valeur };
      var prix = prixPourMargeCible(brouillon);
      if (prix) {
        sugg.hidden = false;
        sugg.textContent = 'Pour cette marge cible, le prix de vente doit être ≈ ' +
          eur(prix) + ' TTC (soit ' + eur(prix / (1 + brouillon.tva)) + ' HT).';
        btn.hidden = Math.abs(prix - brouillon.pv) < 0.001;
        btn.dataset.prix = prix;
      } else {
        sugg.hidden = true;
        btn.hidden = true;
      }
    } else {
      sugg.hidden = true;
      btn.hidden = true;
    }
  }

  // ==========================================================
  //  Photos : réduction côté client, comme Scan.reduire() de l'APK
  // ==========================================================
  function chargerPhoto(fichier) {
    if (!fichier || !/^image\//.test(fichier.type)) {
      toast('Ce fichier n’est pas une image');
      return;
    }
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 640;
        var ratio = Math.min(1, max / Math.max(img.width, img.height));
        var toile = document.createElement('canvas');
        toile.width = Math.max(1, Math.round(img.width * ratio));
        toile.height = Math.max(1, Math.round(img.height * ratio));
        toile.getContext('2d').drawImage(img, 0, 0, toile.width, toile.height);
        PHOTO_BROUILLON = toile.toDataURL('image/jpeg', 0.72);
        majApercuPhoto();
        toast('Photo prête');
      };
      img.onerror = function () { toast('Image illisible'); };
      img.src = lecteur.result;
    };
    lecteur.onerror = function () { toast('Lecture impossible'); };
    lecteur.readAsDataURL(fichier);
  }

  // ==========================================================
  //  Enregistrement / suppression de produit
  // ==========================================================
  function enregistrer(e) {
    e.preventDefault();
    var nom = $('#f-nom').value.trim();
    var pv = lireNombre('#f-pv');
    var err = $('#f-erreur');

    if (!nom) {
      err.textContent = 'Le nom est nécessaire.';
      err.hidden = false;
      $('#f-nom').focus();
      return;
    }
    var formats = lireFormats();
    if (!(pv > 0) && !formats.some(function (f) { return f.pv > 0; })) {
      err.textContent = 'Indiquez un prix de vente (ou un format avec un prix).';
      err.hidden = false;
      $('#f-pv').focus();
      return;
    }
    if (!EN_EDITION && $('#f-hiboutik-creer').checked &&
        !confirm('Créer ce produit dans Hiboutik après son enregistrement local ?\n\nCette action écrit dans la caisse officielle et ne sera pas annulée automatiquement.')) {
      return;
    }

    var famSel = $('#f-fam').value;
    if (famSel === '__nouvelle') famSel = '';

    var type = $('#f-type').value;
    var margeVal = parseFloat(String($('#f-marge-valeur').value).replace(',', '.')) || 0;
    var demanderCreationHiboutik = !EN_EDITION && $('#f-hiboutik-creer').checked;

    var donnees = {
      type: type,
      fam: String(famSel || '').trim() || (famillesPour(type)[0] || 'Divers'),
      cat: $('#f-cat').value.trim(),
      nom: nom,
      desc: $('#f-desc').value.trim(),
      pv: Math.round(pv * 100) / 100,
      cout: Math.round(lireNombre('#f-cout') * 100) / 100,
      tva: parseFloat($('#f-tva').value) || 0.1,
      tvaEmporter: $('#f-tva-emporter').value === '' ? null : parseFloat($('#f-tva-emporter').value),
      allergenes: lireAllergenes(),
      formats: formats,
      actif: $('#f-actif').checked,
      suiviStock: $('#f-suivi-stock').checked,
      stock: Math.max(0, lireNombre('#f-stock')),
      stockMini: Math.max(0, lireNombre('#f-stock-mini')),
      hiboutikBarcode: String($('#f-hiboutik-barcode').value || '').trim().slice(0, 80),
      photo: PHOTO_BROUILLON,
      sous: String($('#f-sous').value || '').trim().slice(0, 90),
      photoArdoise: PHOTO_ARDOISE_BROUILLON,
      margeManuelle: margeVal > 0 ? { unite: $('#f-marge-unite').value, valeur: margeVal } : null
    };

    if (EN_EDITION) {
      var p = parId(EN_EDITION);
      if (p) {
        Object.keys(donnees).forEach(function (k) { p[k] = donnees[k]; });
        toast(p.nom + ' mis à jour');
      }
    } else {
      donnees.id = 'u' + Date.now().toString(36);
      CARTE.push(produitNormalise(donnees, 0));
      toast(donnees.nom + ' ajouté à la carte');
    }
    var produitNouveau = EN_EDITION ? null : parId(donnees.id);
    sauver();
    fermerFiche();
    toutDessiner();
    if (demanderCreationHiboutik && produitNouveau) creerProduitHiboutik(produitNouveau);
  }

  function supprimerProduit() {
    if (!EN_EDITION) return;
    var p = parId(EN_EDITION);
    if (!p) return;
    if (!confirm('Supprimer « ' + p.nom + ' » de la carte ?')) return;
    // le produit disparaît aussi des cartes du jour
    Object.keys(ARDOISE_DEFS).forEach(function (cle) {
      var sel = ARDOISES[cle].selection;
      var i = sel.indexOf(p.id);
      if (i >= 0) sel.splice(i, 1);
    });
    CARTE.splice(CARTE.indexOf(p), 1);
    sauver();
    fermerFiche();
    toutDessiner();
    toast(p.nom + ' supprimé');
  }

  // ==========================================================
  //  Import / export
  // ==========================================================
  function exporterJSON() {
    var paquet = {
      application: 'la-trattoria-carte',
      version: 4,
      exporte: new Date().toISOString(),
      // Alias "carte" pour permettre l'import depuis l'application native
      // com.trattoria.cartes, qui utilise ce nom historique.
      produits: CARTE,
      carte: CARTE,
      ardoises: ARDOISES,
      config: CF
    };
    telecharger(new Blob([JSON.stringify(paquet, null, 1)], { type: 'application/json' }),
      'carte-la-trattoria.json');
    toast('Carte exportée');
  }

  function exporterCSV() {
    var lignes = [['Produit', 'Type', 'Famille', 'Catégorie', 'Prix TTC', 'Coût matière',
      'TVA %', 'Prix HT', 'Marge €', 'Taux marge %', 'Coefficient',
      'Marge cible (manuelle)', 'Prix TTC pour la cible',
      'TVA emporté %', 'Marge emporté €', 'Stock suivi', 'Stock local',
      'Stock Hiboutik', 'Hiboutik ID', 'Formats (nom=prix)', 'Allergènes',
      'À la carte'].join(';')];
    CARTE.forEach(function (p) {
      var sugg = prixPourMargeCible(p);
      var dec = function (v) { return String(Number(v).toFixed(2)).replace('.', ','); };
      lignes.push([
        p.nom, TYPES[p.type], p.fam, p.cat,
        dec(p.pv), dec(p.cout), dec(p.tva * 100), dec(pvHT(p)),
        dec(margeAuto(p)), dec(tauxMarge(p) * 100),
        p.cout > 0 ? coef(p).toFixed(2).replace('.', ',') : '',
        p.margeManuelle ? libelleCible(p) : '',
        sugg ? dec(sugg) : '',
        p.tvaEmporter != null ? dec(p.tvaEmporter * 100) : '',
        p.tvaEmporter != null ? dec(margeEmporter(p)) : '',
        p.suiviStock ? 'oui' : 'non', dec(p.stock),
        p.hiboutikStock != null ? dec(p.hiboutikStock) : '', p.hiboutikId || '',
        (p.formats || []).map(function (f) {
          return (f.nom || '—') + '=' + dec(f.pv) +
            (f.cout > 0 ? ' (marge ' + dec(f.pv / (1 + p.tva) - f.cout) + ')' : '');
        }).join(' | '),
        allergenesInfo(p.allergenes).map(function (a) { return a[1]; }).join(', '),
        p.actif ? 'oui' : 'non'
      ].map(function (c) { return /[;"\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c; })
        .join(';'));
    });
    telecharger(new Blob(['﻿' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' }),
      'marges-la-trattoria.csv');
    toast('Tableau des marges exporté');
  }

  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function importerJSON(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      try {
        var paquet = JSON.parse(lecteur.result);
        var tab = Object.prototype.toString.call(paquet) === '[object Array]'
          ? paquet : (paquet.produits || paquet.carte);
        if (Object.prototype.toString.call(tab) !== '[object Array]') throw new Error('format');
        if (!confirm('Remplacer la carte actuelle (' + CARTE.length +
          ' produits) par les ' + tab.length + ' produits importés ?')) return;
        CARTE = tab.map(produitNormalise);
        ARDOISES = ardoisesToutesNormalisees(paquet.ardoises || null);
        CF = configNormalisee(paquet.config || null);
        sauver();
        toutDessiner();
        toast('Carte importée');
      } catch (e) {
        toast('Fichier invalide — import annulé');
      }
    };
    lecteur.readAsText(fichier);
  }

  function restaurer() {
    if (!confirm('Restaurer le catalogue d’origine de l’application ?\n' +
      'Les modifications, les photos et les cartes du jour seront perdues.')) return;
    CARTE = (window.TRATTORIA_CATALOGUE || []).map(produitNormalise);
    ARDOISES = ardoisesDefaut();
    localStorage.removeItem(CLE_CONFIG);
    configCharger();
    sauver();
    toutDessiner();
    toast('Carte d’origine restaurée');
  }

  function majInfoDonnees() {
    var infos = $('#info-donnees');
    if (!infos) return;
    var photos = CARTE.filter(function (p) { return p.photo; }).length;
    infos.textContent = CARTE.length + ' produits · ' + photos + ' photographiés · ' +
      'enregistré sur cet appareil' + (SYNC.actif ? ' · synchronisé (v' + SYNC.version + ')' : '');
  }

  // ==========================================================
  //  Tableau de bord et objectifs dynamiques
  // ==========================================================
  function objectifId() {
    return 'obj-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function objectifsDefaut() {
    return [
      { id: 'obj-ca', nom: 'Chiffre d’affaires du jour', type: 'ca', cible: 600, unite: '€', periode: 'jour', valeur: 0 },
      { id: 'obj-couverts', nom: 'Couverts du service', type: 'couverts', cible: 40, unite: 'couverts', periode: 'jour', valeur: 0 }
    ];
  }

  function objectifsCharger() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(CLE_OBJECTIFS) || 'null'); } catch (e) { }
    if (Object.prototype.toString.call(data) !== '[object Array]') data = objectifsDefaut();
    OBJECTIFS = data.map(function (o, i) {
      return {
        id: String(o.id || objectifId() + i),
        nom: String(o.nom || 'Objectif ' + (i + 1)).slice(0, 80),
        type: ['ca', 'couverts', 'marge', 'produits', 'rubriques', 'manuel'].indexOf(o.type) >= 0 ? o.type : 'manuel',
        cible: Math.max(0, Number(o.cible) || 0),
        unite: String(o.unite || '').slice(0, 12),
        periode: ['jour', 'semaine', 'mois', 'permanent'].indexOf(o.periode) >= 0 ? o.periode : 'jour',
        valeur: Math.max(0, Number(o.valeur) || 0)
      };
    });
    objectifsSauver();
  }

  function objectifsSauver() {
    try { localStorage.setItem(CLE_OBJECTIFS, JSON.stringify(OBJECTIFS)); } catch (e) { }
  }

  function objectifVentesLocales() {
    var candidats = ['trattoria.ventes.v1', 'trattoria_ventes', 'trattoria.ventes'];
    for (var i = 0; i < candidats.length; i++) {
      try {
        var v = JSON.parse(localStorage.getItem(candidats[i]) || 'null');
        if (Object.prototype.toString.call(v) === '[object Array]') return v;
        if (v && Object.prototype.toString.call(v.ventes) === '[object Array]') return v.ventes;
      } catch (e) { }
    }
    return [];
  }

  function chargerVentesObjectifs() {
    var locales = objectifVentesLocales();
    OBJECTIF_VENTES = locales.filter(function (v) {
      return !v.date || v.date === new Date().toISOString().slice(0, 10);
    });
    // Le serveur local reste la source la plus fraîche, mais un échec réseau
    // ne doit jamais vider le tableau de bord.
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/v1/ventes?jour=' + encodeURIComponent(new Date().toISOString().slice(0, 10)), true);
      xhr.timeout = 1800;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var rep = JSON.parse(xhr.responseText);
            var ventes = Object.prototype.toString.call(rep) === '[object Array]' ? rep : rep.ventes;
            if (Object.prototype.toString.call(ventes) === '[object Array]') OBJECTIF_VENTES = ventes;
          } catch (e) { }
        }
        dessinerDashboard();
        dessinerObjectifs();
      };
      xhr.onerror = xhr.ontimeout = function () { dessinerDashboard(); dessinerObjectifs(); };
      xhr.send();
    } catch (e) {
      dessinerDashboard();
      dessinerObjectifs();
    }
  }

  function valeurObjectif(o) {
    var total = 0, marge = 0, nbMarge = 0;
    OBJECTIF_VENTES.forEach(function (v) {
      total += Number(v.total) || 0;
      if (v.marge != null) { marge += Number(v.marge) || 0; nbMarge++; }
    });
    if (o.type === 'ca') return total;
    if (o.type === 'couverts') return OBJECTIF_VENTES.length;
    if (o.type === 'produits') return CARTE.filter(function (p) { return p.actif; }).length;
    if (o.type === 'rubriques') return Object.keys(CARTE.filter(function (p) { return p.actif; }).reduce(function (m, p) { m[p.fam] = true; return m; }, {})).length;
    if (o.type === 'marge') {
      if (nbMarge) return marge / nbMarge;
      var actifs = CARTE.filter(function (p) { return p.actif && p.pv > 0; });
      if (!actifs.length) return 0;
      return actifs.reduce(function (n, p) { return n + tauxMarge(p) * 100; }, 0) / actifs.length;
    }
    return o.valeur;
  }

  function objectifUnite(o) {
    if (o.unite) return o.unite;
    return { ca: '€', couverts: 'couverts', marge: '%', produits: 'produits', rubriques: 'rubriques', manuel: 'unités' }[o.type] || 'unités';
  }

  function objectifValeurTexte(o, valeur) {
    var n = Number(valeur) || 0;
    var u = objectifUnite(o);
    return (u === '€' ? eur(n) : ((Math.round(n) === n) ? String(n) : n.toFixed(1).replace('.', ',')) + ' ' + echap(u));
  }

  function objectifPeriodeTexte(p) { return { jour: 'Aujourd’hui', semaine: 'Cette semaine', mois: 'Ce mois', permanent: 'Permanent' }[p] || p; }

  function objectifCarteHTML(o) {
    var actuel = valeurObjectif(o), cible = Number(o.cible) || 0;
    var progression = cible > 0 ? Math.max(0, Math.min(100, actuel * 100 / cible)) : 0;
    var atteint = cible > 0 && actuel >= cible;
    return '<article class="objectif-card ' + (atteint ? 'atteint' : '') + '" data-objectif="' + echap(o.id) + '">' +
      '<div class="objectif-card-top"><div><span class="objectif-period">' + echap(objectifPeriodeTexte(o.periode)) + '</span><h3>' + echap(o.nom) + '</h3></div><span class="objectif-check">' + (atteint ? '✓' : '○') + '</span></div>' +
      '<div class="objectif-values"><strong>' + objectifValeurTexte(o, actuel) + '</strong><span>sur ' + objectifValeurTexte(o, cible) + '</span></div>' +
      '<div class="objectif-progress"><span style="width:' + progression.toFixed(1) + '%"></span></div>' +
      '<div class="objectif-footer"><span>' + Math.round(progression) + ' % · actualisé automatiquement</span><span class="objectif-actions"><button type="button" class="btn-link" data-modifier-objectif="' + echap(o.id) + '">Modifier</button><button type="button" class="btn-link danger-link" data-supprimer-objectif="' + echap(o.id) + '">Supprimer</button></span></div>' +
      '</article>';
  }

  function dessinerObjectifs() {
    var h = OBJECTIFS.map(objectifCarteHTML).join('');
    var dashboard = $('#dashboard-objectifs');
    var liste = $('#liste-objectifs');
    if (dashboard) dashboard.innerHTML = h || '<div class="empty-state">Aucun objectif. Ajoutez le premier indicateur de votre service.</div>';
    if (liste) liste.innerHTML = h || '';
    var vide = $('#objectifs-aide-vide');
    if (vide) vide.hidden = OBJECTIFS.length > 0;
  }

  function dessinerDashboard() {
    var actifs = CARTE.filter(function (p) { return p.actif; });
    var familles = {};
    actifs.forEach(function (p) { familles[p.fam] = true; });
    var alertes = actifs.filter(sousObjectif).length;
    var set = function (id, val) { var el = $('#' + id); if (el) el.textContent = val; };
    set('resume-produits', actifs.length);
    set('resume-rubriques', Object.keys(familles).length);
    set('resume-formules', actifs.filter(function (p) { return p.type === 'formule'; }).length);
    set('resume-alertes', alertes);
    set('dashboard-mise-a-jour', 'Dernière actualisation : ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    set('dashboard-statut', OBJECTIF_VENTES.length ? OBJECTIF_VENTES.length + ' vente(s) intégrée(s) aujourd’hui' : 'Données locales disponibles');
  }

  function ouvrirObjectifForm(id) {
    OBJECTIF_EDIT = id || null;
    var o = id ? OBJECTIFS.filter(function (x) { return x.id === id; })[0] : null;
    $('#objectif-fiche-titre').textContent = o ? 'Modifier l’objectif' : 'Nouvel objectif';
    $('#objectif-nom').value = o ? o.nom : '';
    $('#objectif-type').value = o ? o.type : 'ca';
    $('#objectif-unite').value = o ? o.unite : '';
    $('#objectif-cible').value = o ? o.cible : '';
    $('#objectif-periode').value = o ? o.periode : 'jour';
    $('#objectif-valeur').value = o ? o.valeur : 0;
    $('#objectif-supprimer').hidden = !o;
    $('#objectif-voile').hidden = false;
    $('#objectif-fiche').hidden = false;
    majChampObjectifManuel();
    $('#objectif-nom').focus();
  }

  function fermerObjectifForm() {
    $('#objectif-voile').hidden = true;
    $('#objectif-fiche').hidden = true;
    OBJECTIF_EDIT = null;
  }

  function majChampObjectifManuel() {
    var manuel = $('#objectif-type').value === 'manuel';
    $('#objectif-valeur-wrap').hidden = !manuel;
    if (!$('#objectif-unite').value && !manuel) {
      $('#objectif-unite').placeholder = objectifUnite({ type: $('#objectif-type').value });
    }
  }

  function enregistrerObjectif() {
    var nom = String($('#objectif-nom').value || '').trim();
    var cible = Number(String($('#objectif-cible').value || '').replace(',', '.'));
    if (!nom || !isFinite(cible) || cible < 0) { toast('Indiquez un nom et une cible valide'); return; }
    var o = OBJECTIF_EDIT ? OBJECTIFS.filter(function (x) { return x.id === OBJECTIF_EDIT; })[0] : null;
    if (!o) { o = { id: objectifId() }; OBJECTIFS.push(o); }
    o.nom = nom.slice(0, 80);
    o.type = $('#objectif-type').value;
    o.unite = String($('#objectif-unite').value || '').trim().slice(0, 12);
    o.cible = Math.round(cible * 100) / 100;
    o.periode = $('#objectif-periode').value;
    o.valeur = Math.max(0, Number(String($('#objectif-valeur').value || 0).replace(',', '.')) || 0);
    objectifsSauver();
    fermerObjectifForm();
    dessinerObjectifs();
    dessinerDashboard();
    toast('Objectif enregistré');
  }

  function supprimerObjectif(id) {
    var index = OBJECTIFS.findIndex(function (o) { return o.id === id; });
    if (index < 0) return false;
    if (!confirm('Supprimer cet objectif ?')) return false;
    OBJECTIFS.splice(index, 1);
    objectifsSauver();
    dessinerObjectifs();
    dessinerDashboard();
    toast('Objectif supprimé');
    return true;
  }

  // ==========================================================
  //  Navigation
  // ==========================================================
  function montrer(ecran) {
    ECRAN = ecran;
    ['dashboard', 'carte', 'ardoises', 'ardoise', 'objectifs', 'marges', 'donnees'].forEach(function (nom) {
      var section = $('#ecran-' + nom);
      if (section) section.hidden = nom !== ecran;
    });
    $$('.onglet').forEach(function (b) {
      var actif = b.dataset.ecran === ecran;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
    });
    if (ecran === 'ardoise') { dessinerCF(); dessinerQR(); }
    if (ecran === 'carte') dessinerCarte();
    if (ecran === 'dashboard') { dessinerDashboard(); dessinerObjectifs(); }
    if (ecran === 'objectifs') dessinerObjectifs();
    if (ecran === 'donnees' && $('#champ-sync-token')) $('#champ-sync-token').value = SYNC_TOKEN;
    window.scrollTo(0, 0);
  }

  // ==========================================================
  //  Démarrage
  // ==========================================================
  function appliquerLogoAdmin() {
    var cible = $('#admin-logo');
    var logo = window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.logo;
    if (!cible || !logo) return;
    cible.innerHTML = '<img src="' + logo + '" alt="La Trattoria">';
    cible.classList.add('logo-image');
    var dashboardLogo = $('#dashboard-logo');
    if (dashboardLogo) dashboardLogo.src = logo;
  }

  function init() {
    appliquerLogoAdmin();
    objectifsCharger();
    livraisonCharger();
    charger();
    livraisonAfficher();
    toutDessiner();
    majInfoDonnees();
    dessinerDashboard();
    dessinerObjectifs();
    chargerVentesObjectifs();
    badgeSync();
    syncDetecter();
    hiboutikEtat();
    if (HIBOUTIK.maj) {
      $('#hiboutik-dernier').textContent = 'Dernière lecture locale : ' +
        new Date(HIBOUTIK.maj).toLocaleString('fr-FR');
      afficherStatutHiboutik(HIBOUTIK.produits.length + ' produit(s) Hiboutik en cache.',
        HIBOUTIK.configure);
    }

    // Application installable : hors ligne complet après premier chargement
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      try { navigator.serviceWorker.register('sw.js').catch(function () { }); }
      catch (e) { }
    }

    document.addEventListener('click', function (e) {
      var t = e.target;

      if (t.closest('#btn-enregistrer-livraison')) { livraisonSauver(); return; }

      var onglet = t.closest('.onglet');
      if (onglet) { montrer(onglet.dataset.ecran); return; }

      var navigation = t.closest('[data-nav-ecran]');
      if (navigation) { montrer(navigation.dataset.navEcran); return; }
      if (t.closest('#btn-ajouter-objectif') || t.closest('#btn-ajouter-objectif-ecran') || t.closest('#btn-ajouter-objectif-vide')) {
        ouvrirObjectifForm(null); return;
      }
      var modifierObjectif = t.closest('[data-modifier-objectif]');
      if (modifierObjectif) { ouvrirObjectifForm(modifierObjectif.dataset.modifierObjectif); return; }
      var supprimerObjectifBtn = t.closest('[data-supprimer-objectif]');
      if (supprimerObjectifBtn) { supprimerObjectif(supprimerObjectifBtn.dataset.supprimerObjectif); return; }
      if (t.closest('#objectif-supprimer')) {
        if (OBJECTIF_EDIT && supprimerObjectif(OBJECTIF_EDIT)) fermerObjectifForm();
        return;
      }
      if (t.closest('#objectif-fermer') || t.closest('#objectif-annuler') || t.id === 'objectif-voile') {
        fermerObjectifForm(); return;
      }

      if (clicArdoise(t)) return;
      if (clicMoment(t)) return;
      if (clicCarteStandard(t)) return;

      if (t.closest('#btn-ouvrir-ardoise')) { ouvrirArdoise(); return; }
      if (t.closest('#btn-imprimer-ardoise')) { ouvrirArdoise(); return; }
      if (t.closest('#btn-reinit-cf')) {
        if (confirm('Réinitialiser titres, sous-titres, lignes libres et ordre ?')) {
          localStorage.removeItem(CLE_CONFIG);
          CF = configNormalisee(null);
          sauver();
          dessinerCF();
          dessinerQR();
          toast('Ardoise réinitialisée');
        }
        return;
      }
      if (t.closest('#btn-qr-maj')) {
        var v = String($('#champ-site').value || '').trim();
        if (!v) { toast('Indiquez une adresse (URL) pour le QR'); return; }
        CF.site = v;
        sauver();
        dessinerQR();
        toast('QR mis à jour : ' + CF.site);
        return;
      }

      var filtre = t.closest('.filtre');
      if (filtre) {
        FILTRE_TYPE = filtre.dataset.type;
        $$('.filtre').forEach(function (b) {
          var actif = b === filtre;
          b.classList.toggle('actif', actif);
          b.setAttribute('aria-pressed', actif ? 'true' : 'false');
        });
        dessinerCarte();
        return;
      }

      var editer = t.closest('[data-editer]');
      if (editer) { ouvrirFiche(editer.dataset.editer); return; }

      var bascule = t.closest('[data-actif]');
      if (bascule) {
        var p = parId(bascule.dataset.actif);
        if (p) {
          p.actif = !p.actif;
          sauver();
          toutDessiner();
          toast(p.actif ? p.nom + ' remis à la carte' : p.nom + ' masqué de la carte');
        }
        return;
      }

      var ligne = t.closest('tr[data-id]');
      if (ligne) { ouvrirFiche(ligne.dataset.id); return; }

      if (t.closest('#btn-nouveau')) { ouvrirFiche(null); return; }
      if (t.closest('[data-fermer]')) { fermerFiche(); fermerCueillette(); fermerApercu(); return; }
      if (t.closest('#btn-supprimer')) { supprimerProduit(); return; }
      if (t.closest('#btn-photo')) { $('#champ-photo').click(); return; }
      if (t.closest('#btn-photo-retirer')) { PHOTO_BROUILLON = null; majApercuPhoto(); return; }
      if (t.closest('#btn-photo-ardoise')) { $('#champ-photo-ardoise').click(); return; }
      if (t.closest('#btn-photo-ardoise-retirer')) {
        PHOTO_ARDOISE_BROUILLON = null;
        majBoutonsPhotoArdoise();
        return;
      }
      if (t.closest('#btn-appliquer-prix')) {
        $('#f-pv').value = t.closest('#btn-appliquer-prix').dataset.prix;
        majChiffresMarge();
        toast('Prix ajusté — pensez à enregistrer');
        return;
      }
      if (t.closest('#btn-format-plus')) {
        var aideVide = $('#pave-formats .aide-vide');
        if (aideVide) aideVide.remove();
        $('#formats-liste').insertAdjacentHTML('beforeend', ligneFormatHTML(null));
        var lignesFormats = $$('.format-ligne', $('#formats-liste'));
        if (lignesFormats.length) $('[data-f-nom]', lignesFormats[lignesFormats.length - 1]).focus();
        return;
      }
      var formatMoins = t.closest('[data-format-moins]');
      if (formatMoins) {
        formatMoins.closest('.format-ligne').remove();
        if (!$$('.format-ligne', $('#formats-liste')).length) remplirFormats([]);
        return;
      }
      if (t.closest('#btn-marge-auto')) {
        $('#f-marge-valeur').value = '';
        $('#btn-marge-auto').hidden = true;
        majChiffresMarge();
        toast('Marge repassée en automatique');
        return;
      }
      if (t.closest('#btn-export-json')) { exporterJSON(); return; }
      if (t.closest('#btn-export-csv')) { exporterCSV(); return; }
      if (t.closest('#btn-import')) { $('#fichier-import').click(); return; }
      if (t.closest('#btn-reinit')) { restaurer(); return; }
      if (t.closest('#btn-sync-token')) {
        if (demanderToken()) {
          toast('Jeton enregistré sur cet appareil');
          if (SYNC.actif) planifierEnvoi(true);
        }
        return;
      }
      if (t.closest('#btn-sync-token-oublier')) {
        SYNC_TOKEN = '';
        localStorage.removeItem(CLE_SYNC_TOKEN);
        var champToken = $('#champ-sync-token');
        if (champToken) champToken.value = '';
        toast('Jeton oublié');
        return;
     n = $('#champ-sync-token');
        if (champToken) champToken.value = '';
        toast('Jeton oublié');
        return;
      }
      if (t.closest('#btn-sync')) {
        if (!SYNC_TOKEN && !demanderToken()) return;
        syncTirer(true); planifierEnvoi(true); return;
      }
      if (t.closest('#btn-hiboutik-refresh')) { actualiserInventaireHiboutik(); return; }
      if (t.closest('#btn-hiboutik-importer')) { importerNouveauxProduitsHiboutik(); return; }
      if (t.closest('#badge-sync')) { syncTirer(true); return; }

      // ------- cartes du jour -------
      var composer = t.closest('[data-composer]');
      if (composer) { ouvrirCueillette(composer.dataset.composer); return; }

      var auto = t.closest('[data-auto]');
      if (auto) {
        ARDOISES[auto.dataset.auto].selection = semencesPour(auto.dataset.auto);
        sauver();
        dessinerArdoises();
        toast('Sélection automatique rechargée');
        return;
      }

      var libre = t.closest('[data-libre]');
      if (libre) {
        var form = $('[data-form-libre="' + libre.dataset.libre + '"]');
        var visible = form.hidden;
        $$('.mini-form').forEach(function (f) { f.hidden = true; });
        form.hidden = !visible;
        if (visible) $('[data-l-nom]', form).focus();
        return;
      }
      if (t.closest('[data-annuler-libre]')) {
        t.closest('.mini-form').hidden = true;
        return;
      }

      var monter = t.closest('[data-monter]');
      if (monter) {
        var pm = monter.dataset.monter.split(':');
        deplacerLigne(pm[0], Number(pm[1]), -1);
        return;
      }
      var descendre = t.closest('[data-descendre]');
      if (descendre) {
        var pd = descendre.dataset.descendre.split(':');
        deplacerLigne(pd[0], Number(pd[1]), 1);
        return;
      }
      var retirer = t.closest('[data-retirer]');
      if (retirer) {
        var pr = retirer.dataset.retirer.split(':');
        retirerLigne(pr[0], Number(pr[1]));
        return;
      }

      var titreArdoise = t.closest('[data-titre-ardoise]');
      if (titreArdoise) { editerTexteArdoise(titreArdoise.dataset.titreArdoise, 'titre'); return; }
      var sousArdoise = t.closest('[data-sous-ardoise]');
      if (sousArdoise) { editerTexteArdoise(sousArdoise.dataset.sousArdoise, 'sous'); return; }

      var apercu = t.closest('[data-apercu]');
      if (apercu) { apercuArdoise(apercu.dataset.apercu); return; }
      var imprimer = t.closest('[data-imprimer]');
      if (imprimer) { imprimerCartes(imprimer.dataset.imprimer); return; }
      if (t.closest('#btn-imprimer-tout')) { imprimerCartes(null); return; }
      if (t.closest('#apercu .fermer') || t.id === 'apercu') { fermerApercu(); return; }

      if (t.closest('#cueillette-valider')) { validerCueillette(); return; }
      if (t.closest('#cueillette .fermer') || t.id === 'voile-cueillette') { fermerCueillette(); return; }

      var th = t.closest('#table-marges th[data-tri]');
      if (th) {
        var cle = th.dataset.tri;
        TRI.sens = TRI.cle === cle ? -TRI.sens : 1;
        TRI.cle = cle;
        dessinerMarges();
        return;
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.id === 'objectif-type') { majChampObjectifManuel(); return; }
      if (e.target.id === 'champ-photo') {
        chargerPhoto(e.target.files[0]);
        e.target.value = '';
      }
      if (e.target.id === 'champ-photo-ardoise') {
        if (e.target.files[0]) photoArdoiseChoisie(e.target.files[0]);
        e.target.value = '';
      }
      if (e.target.id === 'fichier-import') {
        if (e.target.files[0]) importerJSON(e.target.files[0]);
        e.target.value = '';
      }
      if (e.target.id === 'f-type') remplirFamilles(e.target.value, undefined);
      if (e.target.id === 'f-fam') {
        if (e.target.value === '__nouvelle') {
          var nouvelle = prompt('Nom de la nouvelle famille (rubrique de la carte) :');
          if (nouvelle && nouvelle.trim()) {
            var opt = document.createElement('option');
            opt.value = nouvelle.trim();
            opt.textContent = nouvelle.trim();
            opt.selected = true;
            e.target.insertBefore(opt, e.target.lastChild);
          } else {
            e.target.selectedIndex = 0;
          }
        }
        majCategories($('#f-type').value, e.target.value);
      }
      if (e.target.id === 'f-marge-unite') majChiffresMarge();
      if (e.target.id === 'f-tva-emporter') majChiffresMarge();
      if (e.target.hasAttribute('data-alg')) {
        e.target.closest('.alg-case').classList.toggle('on', e.target.checked);
      }
      if (e.target.id === 'cueillette-disponibles' && CUEILLETTE) {
        CUEILLETTE.disponibles = e.target.checked;
        dessinerCueillette();
      }
      if (e.target.hasAttribute('data-cueillette')) {
        var id = e.target.getAttribute('data-cueillette');
        var i = CUEILLETTE ? CUEILLETTE.choisis.indexOf(id) : -1;
        if (!CUEILLETTE) return;
        if (e.target.checked && i < 0) CUEILLETTE.choisis.push(id);
        if (!e.target.checked && i >= 0) CUEILLETTE.choisis.splice(i, 1);
        e.target.closest('.cueillette-ligne').classList.toggle('on', e.target.checked);
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target.id === 'recherche') {
        RECHERCHE = e.target.value;
        dessinerCarte();
      }
      if (e.target.id === 'cueillette-recherche') {
        // conserve les cases cochées pendant la recherche
        if (CUEILLETTE) dessinerCueillette();
      }
      if (/^f-(pv|cout|tva|marge-valeur|marge-unite)$/.test(e.target.id)) majChiffresMarge();
    });

    document.addEventListener('submit', function (e) {
      if (e.target.id === 'objectif-form') {
        e.preventDefault();
        enregistrerObjectif();
        return;
      }
      if (e.target.hasAttribute('data-form-libre')) {
        e.preventDefault();
        ajouterLibre(e.target.getAttribute('data-form-libre'), e.target);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.getElementById('ardoise-overlay')) { fermerArdoise(); return; }
      if (!$('#fiche').hidden) fermerFiche();
      else if (!$('#cueillette').hidden) fermerCueillette();
      else if (!$('#apercu').hidden) fermerApercu();
    });

    $('#form-produit').addEventListener('submit', enregistrer);
    $('#voile').addEventListener('click', function () { fermerFiche(); });

    // Lien profond (depuis le panneau « Éditer les cartes » de l'application,
    // ou URL directe) : #ecran-carte&vue=formules, #ecran-ardoise&apercu=1…
    window.addEventListener('hashchange', appliquerHash);
    appliquerHash();
  }

  function appliquerHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    if (!h) return;
    var mE = h.match(/^ecran-([a-z]+)/);
    if (!mE) return;
    var ecran = mE[1];
    if (['dashboard', 'carte', 'ardoises', 'ardoise', 'objectifs', 'marges', 'donnees'].indexOf(ecran) < 0) return;
    montrer(ecran);
    var mV = h.match(/vue=([a-z]+)/);
    if (mV && ['standard', 'formules', 'vins', 'glaces', 'bieres'].indexOf(mV[1]) >= 0) {
      CARTE_VIEW = mV[1];
      $$('.cv').forEach(function (b) {
        var on = b.dataset.cv === CARTE_VIEW;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      dessinerCarte();
    }
    if (ecran === 'ardoise' && /apercu=1/.test(h)) ouvrirArdoise();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();

  // exposé pour tests
  window.GestionCarte = {
    carte: function () { return CARTE; },
    ardoises: function () { return ARDOISES; },
    config: function () { return CF; },
    htmlArdoise: htmlArdoise,
    htmlArdoiseExtras: htmlArdoiseExtras,
    illustrationProduit: illustrationProduit,
    itemsFamille: itemsFamille,
    itemsExtra: itemsExtra,
    htmlMoment: htmlMoment,
    itemsMoment: itemsMoment,
    extrasSeed: extrasSeed,
    ouvrirCueilletteExtra: ouvrirCueilletteExtra,
    marge: margeAuto,
    coef: coef,
    taux: tauxMarge,
    prixPourMargeCible: prixPourMargeCible,
    sousObjectif: sousObjectif,
    lignesArdoise: lignesArdoise
  };
})();
