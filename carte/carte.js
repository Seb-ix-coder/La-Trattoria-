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

  // Ardoise (carte principale) : titres/sous-titres de catégories,
  // lignes libres, ordre, en-tête (badges, pâte 48 h), QR du site.
  var CLE_CONFIG = 'trattoria.config.v1';
  var CF = null;              // objet configuration (voir configNormalisee)
  var PHOTO_ARDOISE_BROUILLON = null; // data-URL « photo d'ardoise » de la fiche
  var LIGNE_A_EDITER = null;  // id de ligne libre à éditer après le prochain rendu
  var CPT_CRAIE = 0;          // alternance des couleurs de craie
  var CARTE_VIEW = 'standard'; // vue de l'onglet « La carte » : standard | formules | vins | glaces | bieres
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

  /** Sélection automatique proposée à la création d'une carte du jour. */
  function semencesPour(cle) {
    var ids = [];
    CARTE.forEach(function (p) {
      if (!p.actif) return;
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
      var ordre = (Object.prototype.toString.call(src.ordre) === '[object Array]')
        ? src.ordre.filter(function (id) { return presents.indexOf(id) >= 0; })
        : [];
      presents.forEach(function (id) { if (ordre.indexOf(id) < 0) ordre.push(id); });
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
              prix: Math.max(0, Math.round(Number(l.prix) * 100) / 100 || 0)
            };
          }).filter(Boolean)
        : [];
      out.fams[f] = {
        titre: String(src.titre || '').trim().slice(0, 60) || (def.fams[f] ? def.fams[f].titre : f),
        sous: String(src.sous || '').trim().slice(0, 120),
        ordre: ordre,
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
      nom: 'Nouvelle ligne', sous: '', desc: '', prix: 0
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
        '<input type="text" data-cf-l="desc" maxlength="200" value="' + echap(l.desc) + '" placeholder="Descriptif (facultatif)">' +
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
    if (t.closest('[data-cv-imprimer]')) { ouvrirImpressionCarte(); return true; }
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

  // ---------- aperçu / impression A4 de la carte standard ----------
  function fermerImpressionCarte() {
    var ov = document.getElementById('impression-carte-overlay');
    if (ov) ov.remove();
    document.body.classList.remove('impression-carte-a4');
    document.body.style.overflow = '';
  }

  function ouvrirImpressionCarte() {
    fermerImpressionCarte();
    var dansExtras = idsDansExtras();
    var fams = famsCatalogue();
    var sections = '';
    fams.forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam).filter(function (it) {
        if (it.kind === 'p') {
          if (!it.p.actif) return false;
          if (dansExtras[it.p.id]) return false;
        }
        return true;
      });
      if (!items.length) return;
      sections += '<section class="a4-cat">' +
        '<h2>' + echap(conf.titre) + '</h2>' +
        (conf.sous ? '<p class="a4-sous">' + echap(conf.sous) + '</p>' : '') +
        '<ul>';
      items.forEach(function (it) {
        if (it.kind === 'l') {
          sections += '<li><span class="a4-nom">' + echap(it.l.nom) + '</span>' +
            '<span class="a4-pts"></span><span class="a4-prix">' +
            (it.l.prix > 0 ? eur(it.l.prix) : '') + '</span></li>' +
            (it.l.sous ? '<li class="a4-desc"><span>' + echap(it.l.sous) + '</span></li>' : '');
        } else {
          var q = it.p;
          var sous = q.sous || q.desc || '';
          sections += '<li><span class="a4-nom">' + echap(q.nom) + '</span>' +
            '<span class="a4-pts"></span><span class="a4-prix">' + prixAffiche(q) +
            '</span></li>' +
            (sous ? '<li class="a4-desc"><span>' + echap(sous) + '</span></li>' : '');
        }
      });
      sections += '</ul></section>';
    });
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
    bieres:   { titre: 'La carte des bières', sous: 'Pression et bouteilles' }
  };
  var EXTRA_ORDRE = ['formules', 'vins', 'glaces', 'bieres'];

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

  function ligneLibreNormalisee(l, i) {
    if (!l || typeof l !== 'object') return null;
    var nom = String(l.nom || '').trim().slice(0, 60);
    if (!nom) return null;
    return {
      id: String(l.id || ('l' + Date.now().toString(36) + i)).slice(0, 24),
      nom: nom,
      sous: String(l.sous || '').trim().slice(0, 90),
      desc: String(l.desc || '').trim().slice(0, 200),
      prix: Math.max(0, Math.round(Number(l.prix) * 100) / 100 || 0)
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
      if (it.kind === 'p') { photo = photoArdoiseDe(it.p); return !!photo; }
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
      if (!p.actif) return false;
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
      choisis: conf.ordre.filter(function (id) { return !!parId(id); })
    };
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
    if (!SYNC.actif) return;
    clearTimeout(SYNC.minuteur);
    var envoyer = function () {
      fetch('api/carte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carte: CARTE, ardoises: ARDOISES, config: CF })
      }).then(function (r) {
        if (!r.ok) throw new Error('ko');
        return r.json();
      }).then(function (r) {
        SYNC.version = Number(r.version) || SYNC.version;
        badgeSync();
      }).catch(function () { badgeSync(); });
    };
    if (immediat) envoyer();
    else SYNC.minuteur = setTimeout(envoyer, 900);
  }

  function toutDessiner() {
    dessinerCarte();
    dessinerMarges();
    dessinerArdoises();
    dessinerCF();
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
    var photo = p.photo
      ? '<img src="' + p.photo + '" alt="Photo — ' + echap(p.nom) + '" loading="lazy">'
      : '<span class="motif" aria-hidden="true">' + echap((TYPES[p.type] || '?')[0]) + '</span>';
    var manuel = p.margeManuelle
      ? ' <span class="badge-manuel" title="Marge cible fixée à la main">marge : ' +
        echap(libelleCible(p)) + '</span>' : '';
    return '<article class="carte-prod' + (p.actif ? '' : ' inactif') + '" data-id="' + echap(p.id) + '">' +
      '<div class="visu">' + photo +
      '<span class="badge-type ' + p.type + '">' + TYPES[p.type] + '</span>' +
      (p.actif ? '' : '<span class="badge-epuise">Masqué</span>') +
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

  function dessinerCarte() {
    if (CARTE_VIEW === 'moment') { dessinerVueMoment(); return; }
    if (CARTE_VIEW !== 'standard') { dessinerVueExtra(CARTE_VIEW); return; }
    $('#outils-standard').hidden = false;
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
      var libres = confF ? confF.libres : [];
      h += '<section class="famille" data-fam="' + echap(fam) + '">' +
        '<div class="fam-tete"><h2>' + echap(fam) +
        ' <span class="nb">' + ps.length + '</span></h2>' +
        '<span class="fam-actions">' +
          '<button type="button" class="btn btn-s btn-mini" data-fam-edit="1">✏️ Titre ardoise</button>' +
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
                '<input type="text" data-lf-champ="sous" maxlength="90" value="' + echap(l.sous) + '" placeholder="Sous-titre (facultatif)">' +
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
      h += '<div class="grille">' + ps.map(carteProduitHTML).join('') + '</div></section>';
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
        '<button type="button" class="btn btn-s btn-mini" data-composer="' + cle + '">Composer depuis la carte…</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-libre="' + cle + '">+ Ligne libre</button>' +
        (cle !== 'plats' ? '<button type="button" class="btn btn-s btn-mini" data-auto="' + cle + '">Sélection auto</button>' : '') +
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
      choisis: conf.ordre.filter(function (id) { return !!parId(id); })
    };
    $('#cueillette-titre').textContent = conf.titre + ' — produits du catalogue';
    $('#cueillette-recherche').value = '';
    dessinerCueillette();
    $('#cueillette').hidden = false;
    $('#cueillette-recherche').focus();
  }

  function ouvrirCueillette(cle) {
    CUEILLETTE = { cle: cle, choisis: ARDOISES[cle].selection.slice() };
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
      return !q || norm(p.nom + ' ' + p.fam + ' ' + p.cat).indexOf(q) >= 0;
    });
    $('#cueillette-liste').innerHTML = candidats.map(function (p) {
      var ok = CUEILLETTE.choisis.indexOf(p.id) >= 0;
      return '<label class="cueillette-ligne' + (ok ? ' on' : '') + '">' +
        '<input type="checkbox" data-cueillette="' + echap(p.id) + '"' + (ok ? ' checked' : '') + '>' +
        '<span class="cl-nom">' + echap(p.nom) +
        '<span class="cl-meta">' + echap(p.fam) + (p.cat ? ' · ' + echap(p.cat) : '') + '</span></span>' +
        '<span class="cl-prix">' + eur(p.pv) + '</span></label>';
    }).join('') || '<p class="aide" style="padding:20px">Aucun produit ne correspond.</p>';
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

    var famSel = $('#f-fam').value;
    if (famSel === '__nouvelle') famSel = '';

    var type = $('#f-type').value;
    var margeVal = parseFloat(String($('#f-marge-valeur').value).replace(',', '.')) || 0;

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
    sauver();
    fermerFiche();
    toutDessiner();
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
      produits: CARTE,
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
      'TVA emporté %', 'Marge emporté €', 'Formats (nom=prix)', 'Allergènes',
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
        var tab = Object.prototype.toString.call(paquet) === '[object Array]' ? paquet : paquet.produits;
        if (!tab || !tab.length) throw new Error('vide');
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
  //  Navigation
  // ==========================================================
  function montrer(ecran) {
    ECRAN = ecran;
    ['carte', 'ardoises', 'ardoise', 'marges', 'donnees'].forEach(function (nom) {
      $('#ecran-' + nom).hidden = nom !== ecran;
    });
    $$('.onglet').forEach(function (b) {
      var actif = b.dataset.ecran === ecran;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
    });
    if (ecran === 'ardoise') { dessinerCF(); dessinerQR(); }
    if (ecran === 'carte') dessinerCarte();
    window.scrollTo(0, 0);
  }

  // ==========================================================
  //  Démarrage
  // ==========================================================
  function init() {
    var logoEntete = document.querySelector('.logo img');
    if (logoEntete && window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.logo)
      logoEntete.src = window.ARDOISE_ASSETS.logo;
    charger();
    toutDessiner();
    majInfoDonnees();
    badgeSync();
    syncDetecter();

    // Application installable : hors ligne complet après premier chargement
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      try { navigator.serviceWorker.register('sw.js').catch(function () { }); }
      catch (e) { }
    }

    document.addEventListener('click', function (e) {
      var t = e.target;

      var onglet = t.closest('.onglet');
      if (onglet) { montrer(onglet.dataset.ecran); return; }

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
      if (t.closest('#btn-sync')) { syncTirer(true); planifierEnvoi(true); return; }
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
    if (['carte', 'ardoises', 'ardoise', 'marges', 'donnees'].indexOf(ecran) < 0) return;
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
