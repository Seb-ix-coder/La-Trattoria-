/* ============================================================
   La Trattoria — gestion de la carte
   Ajout de formules, plats, boissons et cocktails, avec photos,
   descriptifs, et marge calculée automatiquement ou fixée à la
   main. Aucune dépendance : fonctionne hors ligne, sur le wifi
   du restaurant. Données persistées dans le navigateur.
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

  var TYPES = { formule: 'Formule', plat: 'Plat', boisson: 'Boisson', cocktail: 'Cocktail' };

  var CARTE = [];
  var ECRAN = 'carte';
  var FILTRE_TYPE = 'tout';
  var RECHERCHE = '';
  var TRI = { cle: 'fam', sens: 1 };
  var EN_EDITION = null;      // id du produit en cours d'édition, null = création
  var PHOTO_BROUILLON = null; // data-URL en cours dans la fiche (null/''/…)

  // ==========================================================
  //  Utilitaires
  // ==========================================================
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function eur(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2).replace('.', ',') + ' €';
  }
  function pct(v) { return (v * 100).toFixed(1).replace('.', ',') + ' %'; }
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
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  //  Persistance
  // ==========================================================
  function sauver() {
    try {
      localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
    } catch (e) {
      toast('Espace de stockage insuffisant — photo trop lourde ?');
    }
    majInfoDonnees();
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

  function charger() {
    var brut = null;
    try { brut = JSON.parse(localStorage.getItem(CLE_STOCK) || 'null'); } catch (e) { }
    if (brut && Object.prototype.toString.call(brut) === '[object Array]') {
      CARTE = brut.map(produitNormalise);
    } else {
      // Première ouverture : on part du catalogue de l'application.
      CARTE = (window.TRATTORIA_CATALOGUE || []).map(produitNormalise);
      sauver();
    }
  }

  function parId(id) {
    for (var i = 0; i < CARTE.length; i++) if (CARTE[i].id === id) return CARTE[i];
    return null;
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
      ? ' <span class="badge-manuel" title="Marge cible fixée à la main">marge : ' +
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
      '<div class="l">Sous l\u2019objectif de coefficient</div></div>' +
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
        verdict.textContent = '⚠ Sous l\u2019objectif (coeff. ' +
          objectifCoef(brouillon).toFixed(1).replace('.', ',') + ' visé).';
        verdict.className = 'verdict ko';
      } else {
        verdict.textContent = '✓ Dans l\u2019objectif de coefficient.';
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
      toast('Ce fichier n\u2019est pas une image');
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
  //  Enregistrement / suppression
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
    if (famSel === '__nouvelle') {
      famSel = ($('#f-fam-nouveau') || {}).value || '';
    }

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
      Object.keys(donnees).forEach(function (k) { p[k] = donnees[k]; });
      toast(p.nom + ' mis à jour');
    } else {
      donnees.id = 'u' + Date.now().toString(36);
      CARTE.push(produitNormalise(donnees, 0));
      toast(donnees.nom + ' ajouté à la carte');
    }
    sauver();
    fermerFiche();
    dessinerCarte();
    dessinerMarges();
  }

  function supprimerProduit() {
    if (!EN_EDITION) return;
    var p = parId(EN_EDITION);
    if (!p) return;
    if (!confirm('Supprimer « ' + p.nom + ' » de la carte ?')) return;
    CARTE.splice(CARTE.indexOf(p), 1);
    sauver();
    fermerFiche();
    dessinerCarte();
    dessinerMarges();
    toast(p.nom + ' supprimé');
  }

  // ==========================================================
  //  Import / export
  // ==========================================================
  function exporterJSON() {
    var paquet = {
      application: 'la-trattoria-carte',
      version: 1,
      exporte: new Date().toISOString(),
      produits: CARTE
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
    telecharger(new Blob(['\uFEFF' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' }),
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
        sauver();
        dessinerCarte();
        dessinerMarges();
        toast('Carte importée');
      } catch (e) {
        toast('Fichier invalide — import annulé');
      }
    };
    lecteur.readAsText(fichier);
  }

  function restaurer() {
    if (!confirm('Restaurer le catalogue d\u2019origine de l\u2019application ?\n' +
      'Les modifications et les photos seront perdues.')) return;
    CARTE = (window.TRATTORIA_CATALOGUE || []).map(produitNormalise);
    sauver();
    dessinerCarte();
    dessinerMarges();
    toast('Carte d\u2019origine restaurée');
  }

  function majInfoDonnees() {
    var infos = $('#info-donnees');
    if (!infos) return;
    var photos = CARTE.filter(function (p) { return p.photo; }).length;
    infos.textContent = CARTE.length + ' produits · ' + photos + ' photographiés · ' +
      'enregistré sur cet appareil';
  }

  // ==========================================================
  //  Navigation
  // ==========================================================
  function montrer(ecran) {
    ECRAN = ecran;
    ['carte', 'marges', 'donnees'].forEach(function (nom) {
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
    dessinerCarte();
    dessinerMarges();
    majInfoDonnees();

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
          dessinerCarte();
          dessinerMarges();
          toast(p.actif ? p.nom + ' remis à la carte' : p.nom + ' masqué de la carte');
        }
        return;
      }

      var ligne = t.closest('tr[data-id]');
      if (ligne) { ouvrirFiche(ligne.dataset.id); return; }

      if (t.closest('#btn-nouveau')) { ouvrirFiche(null); return; }
      if (t.closest('[data-fermer]')) { fermerFiche(); return; }
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
    });

    document.addEventListener('input', function (e) {
      if (e.target.id === 'recherche') {
        RECHERCHE = e.target.value;
        dessinerCarte();
      }
      if (/^f-(pv|cout|tva|marge-valeur|marge-unite)$/.test(e.target.id)) majChiffresMarge();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#fiche').hidden) fermerFiche();
    });

    $('#form-produit').addEventListener('submit', enregistrer);
    $('#voile').addEventListener('click', fermerFiche);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();

  // exposé pour tests
  window.GestionCarte = {
    carte: function () { return CARTE; },
    marge: margeAuto,
    coef: coef,
    taux: tauxMarge,
    prixPourMargeCible: prixPourMargeCible,
    sousObjectif: sousObjectif
  };
})();
