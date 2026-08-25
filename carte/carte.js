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
      actif: p.actif !== false,
      photo: typeof p.photo === 'string' && p.photo.indexOf('data:image/') === 0 ? p.photo : null,
      margeManuelle: (p.margeManuelle && p.margeManuelle.valeur > 0)
        ? { unite: p.margeManuelle.unite === 'taux' ? 'taux' : 'eur', valeur: Number(p.margeManuelle.valeur) }
        : null
    };
  }

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
      try {
        localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
        localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
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
        body: JSON.stringify({ carte: CARTE, ardoises: ARDOISES })
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
      '<div class="ligne-prix"><span class="pv">' + eur(p.pv) + '</span>' +
      '<span class="marge ' + classeMarge(p) + '">' + eur(margeAuto(p)) + ' · ' + txtCoef(coef(p)) + '</span></div>' +
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
      h += '<section class="famille"><h2>' + echap(fam) +
        ' <span class="nb">' + ps.length + '</span></h2>' +
        '<div class="grille">' + ps.map(carteProduitHTML).join('') + '</div></section>';
    });
    $('#liste-produits').innerHTML = h ||
      '<p class="aide" style="text-align:center;padding:40px 0">Aucun produit ne correspond. ' +
      'Ajoutez-en un avec le bouton « + Ajouter ».</p>';
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

    $('#kpis').innerHTML =
      '<div class="kpi"><div class="v">' + actifs.length + '</div><div class="l">Produits à la carte</div></div>' +
      '<div class="kpi"><div class="v">' + eur(margeMoy) + '</div><div class="l">Marge moyenne / portion</div></div>' +
      '<div class="kpi"><div class="v">' + pct(tauxMoy) + '</div><div class="l">Taux de marge moyen</div></div>' +
      '<div class="kpi' + (sous ? ' alerte' : '') + '"><div class="v">' + sous + '</div>' +
      '<div class="l">Sous l’objectif de coefficient</div></div>' +
      '<div class="kpi"><div class="v">' + manuels + '</div><div class="l">Marges fixées à la main</div></div>';

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
        '<td class="num"><button type="button" class="btn btn-s btn-mini" data-editer="' +
        echap(p.id) + '">Marge…</button></td>' +
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
      if (p && p.actif) lignes.push({ nom: p.nom, desc: p.desc, prix: p.pv, id: id });
    });
    a.libres.forEach(function (l, i) {
      lignes.push({ nom: l.nom, desc: l.desc, prix: l.prix, libre: i });
    });
    return lignes;
  }

  function ardoiseVide(cle) { return lignesArdoise(cle).length === 0; }

  function lignePapierHTML(l) {
    return '<div class="l"><div class="lg"><span class="nom">' + echap(l.nom) + '</span>' +
      '<span class="pts" aria-hidden="true"></span><span class="prix">' + eur(l.prix) + '</span></div>' +
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
    var q = norm($('#cueillette-recherche').value);
    var candidats = candidatsArdoise(CUEILLETTE.cle).filter(function (p) {
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

  function ouvrirFiche(id) {
    var p = id ? parId(id) : null;
    EN_EDITION = p ? p.id : null;
    PHOTO_BROUILLON = p ? p.photo : null;

    $('#fiche-titre').textContent = p ? p.nom : 'Nouveau produit';
    $('#f-nom').value = p ? p.nom : '';
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
    $('#f-actif').checked = p ? p.actif : true;

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
    if (!(pv > 0)) {
      err.textContent = 'Indiquez un prix de vente supérieur à zéro.';
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
      actif: $('#f-actif').checked,
      photo: PHOTO_BROUILLON,
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
      version: 2,
      exporte: new Date().toISOString(),
      produits: CARTE,
      ardoises: ARDOISES
    };
    telecharger(new Blob([JSON.stringify(paquet, null, 1)], { type: 'application/json' }),
      'carte-la-trattoria.json');
    toast('Carte exportée');
  }

  function exporterCSV() {
    var lignes = [['Produit', 'Type', 'Famille', 'Catégorie', 'Prix TTC', 'Coût matière',
      'TVA %', 'Prix HT', 'Marge €', 'Taux marge %', 'Coefficient',
      'Marge cible (manuelle)', 'Prix TTC pour la cible', 'À la carte'].join(';')];
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
    ['carte', 'ardoises', 'marges', 'donnees'].forEach(function (nom) {
      $('#ecran-' + nom).hidden = nom !== ecran;
    });
    $$('.onglet').forEach(function (b) {
      var actif = b.dataset.ecran === ecran;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
    });
    window.scrollTo(0, 0);
  }

  // ==========================================================
  //  Démarrage
  // ==========================================================
  function init() {
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
      if (t.closest('#btn-appliquer-prix')) {
        $('#f-pv').value = t.closest('#btn-appliquer-prix').dataset.prix;
        majChiffresMarge();
        toast('Prix ajusté — pensez à enregistrer');
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
      if (!$('#fiche').hidden) fermerFiche();
      else if (!$('#cueillette').hidden) fermerCueillette();
      else if (!$('#apercu').hidden) fermerApercu();
    });

    $('#form-produit').addEventListener('submit', enregistrer);
    $('#voile').addEventListener('click', function () { fermerFiche(); });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();

  // exposé pour tests
  window.GestionCarte = {
    carte: function () { return CARTE; },
    ardoises: function () { return ARDOISES; },
    marge: margeAuto,
    coef: coef,
    taux: tauxMarge,
    prixPourMargeCible: prixPourMargeCible,
    sousObjectif: sousObjectif,
    lignesArdoise: lignesArdoise
  };
})();
