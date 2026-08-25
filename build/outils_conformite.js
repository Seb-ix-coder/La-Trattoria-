/* ============================================================================
   Addon « Outils de conformité » — ajout durci 11.2 (injecté dans site.js)
   ============================================================================
   Deux outils intégrés à l'application, accessibles depuis la page servie
   par la tablette (http://<ip-tablette>:8720) :

     #ereporting  → export e-reporting des ventes (CSV + XML)
                   Les données viennent de la nouvelle route locale
                   /site/ventes (ajoutée dans Reseau.routerSite) : aucune
                   clé API nécessaire, réseau local uniquement.
     #factures    → contrôle + registre des factures fournisseurs Factur-X
                   (fichier XML ou PDF contenant le XML Factur-X) :
                   validation des champs, ajout au registre local, export
                   du registre en CSV (suivi comptable 10 ans).

   Ouverture : tapez l'URL  http://<ip-tablette>:8720/#ereporting  (ou
   #factures) sur la tablette ou un poste du bureau. L'écran s'ouvre
   automatiquement, avec un bouton Fermer tactile.
   ========================================================================== */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  var OUTILS = {
    ereporting: { titre: 'Export e-reporting', sous: 'Ventes par jour (CSV/XML)' },
    factures: { titre: 'Factures fournisseurs', sous: 'Contrôle Factur-X + registre' },
    fidelite: { titre: 'Cartes de fidélité', sous: 'Tampons, offres et historique' },
    produits: { titre: 'Produits à la vente', sous: 'Consultation et export du catalogue' }
  };
  var FIDELITE_KEY = 'trattoria_fidelite';
  var REGISTRE_KEY = 'trattoria_registre_factures';
  var PIN_KEY = 'trattoria_pin_hash';
  var OUTIL_COURANT = 'ereporting';
  var SESSION_OK = false;   // PIN validé : reste vrai tant que l'overlay est ouvert

  // ------------------------------------------------------------------
  //  Code PIN (protection d'accès aux outils de gestion)
  // ------------------------------------------------------------------
  // NB : protection LÉGÈRE côté navigateur (le réseau local reste la vraie
  // frontière) — on stocke un simple hash (djb2) du code, jamais le code en
  // clair. Crypto.subtle n'est pas disponible en http local, d'où ce hash
  // maison ; à remplacer par une vraie authentification si l'application
  // passe en HTTPS.
  function hashPin(code) {
    var h = 5381;
    for (var i = 0; i < code.length; i++) {
      h = ((h << 5) + h + code.charCodeAt(i)) >>> 0;
    }
    return 'h' + h.toString(16);
  }
  function pinDefini() {
    try { return !!localStorage.getItem(PIN_KEY); } catch (e) { return false; }
  }
  function pinValide(code) {
    return /^\d{4}$/.test(code) &&
      hashPin(code) === localStorage.getItem(PIN_KEY);
  }

  function ecranPin(mode) {
    // mode : 'definir' (première fois / modification) ou 'verif'
    var definir = mode === 'definir';
    $id('oc-titre').textContent = definir ? 'Définir un code PIN'
                                          : 'Code PIN requis';
    $id('oc-sous').textContent = definir
      ? 'Choisissez un code à 4 chiffres pour protéger l\'accès aux outils.'
      : 'Entrez le code PIN pour accéder aux outils de gestion.';
    var h = '<div class="oc-form oc-pin">' +
      '<label for="oc-pin1">' + (definir ? 'Nouveau code (4 chiffres)' : 'Code PIN') + '</label>' +
      '<input id="oc-pin1" type="password" inputmode="numeric" maxlength="4" ' +
      'autocomplete="off" placeholder="••••" enterkeyhint="done">' +
      (definir
        ? '<label for="oc-pin2">Confirmez le code</label>' +
          '<input id="oc-pin2" type="password" inputmode="numeric" maxlength="4" ' +
          'autocomplete="off" placeholder="••••" enterkeyhint="done">'
        : '') +
      '<p class="oc-err" id="oc-pin-msg" role="alert"></p>' +
      '<div class="oc-btns">' +
      '<button type="button" class="oc-btn oc-btn-sec" id="oc-pin-annuler">Annuler</button>' +
      '<button type="button" class="oc-btn" id="oc-pin-ok">' + (definir ? 'Enregistrer' : 'Valider') + '</button>' +
      '</div></div>';
    $id('oc-contenu').innerHTML = h;

    var p1 = $id('oc-pin1'), p2 = $id('oc-pin2');
    if (p1) p1.focus();

    $id('oc-pin-annuler').addEventListener('click', fermer);
    $id('oc-pin-ok').addEventListener('click', function () {
      var code = p1.value;
      if (definir) {
        if (!/^\d{4}$/.test(code)) {
          $id('oc-pin-msg').textContent = 'Le code doit contenir exactement 4 chiffres.';
          return;
        }
        if (code !== p2.value) {
          $id('oc-pin-msg').textContent = 'Les deux codes ne correspondent pas.';
          return;
        }
        try { localStorage.setItem(PIN_KEY, hashPin(code)); } catch (e) { }
        SESSION_OK = true;
        ouvrirOutils(OUTIL_COURANT);
      } else {
        if (!pinValide(code)) {
          $id('oc-pin-msg').textContent = 'Code incorrect.';
          p1.value = '';
          p1.focus();
          return;
        }
        SESSION_OK = true;
        ouvrirOutils(OUTIL_COURANT);
      }
    });
    // Entrée pour valider
    [p1, p2].forEach(function (p) {
      if (p) p.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $id('oc-pin-ok').click();
      });
    });
  }

  function ouvrirOutils(outil) {
    OUTIL_COURANT = outil;
    $id('oc-titre').textContent = OUTILS[outil].titre;
    $id('oc-sous').textContent = OUTILS[outil].sous;
    if (outil === 'ereporting') {
      $id('oc-contenu').innerHTML = contenuEreporting();
      $id('er-gen').addEventListener('click', genererEreporting);
    } else if (outil === 'factures') {
      $id('oc-contenu').innerHTML = contenuFactures();
      $id('fx-fichier').addEventListener('change', lireFichier);
      afficherRegistre();
    } else if (outil === 'fidelite') {
      $id('oc-contenu').innerHTML = contenuFidelite();
      brancherFidelite();
    } else if (outil === 'produits') {
      $id('oc-contenu').innerHTML = contenuProduits();
      chargerProduits();
    }
    var f = $id('oc-fermer');
    if (f) f.focus();
  }

  // ------------------------------------------------------------------
  //  Utilitaires
  // ------------------------------------------------------------------
  function $id(id) { return document.getElementById(id); }

  function echap(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function eur(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  function telecharger(nom, contenu, mime) {
    try {
      var blob = new Blob([contenu], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nom;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
    } catch (e) {
      alert('Téléchargement impossible : ' + e.message);
    }
  }

  // ------------------------------------------------------------------
  //  Écran e-reporting
  // ------------------------------------------------------------------
  function csv_escape(v) {
    v = String(v == null ? '' : v);
    if (/[;"\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function jours_plage(d1, d2) {
    var out = [], d = new Date(d1 + 'T00:00:00');
    var fin = new Date(d2 + 'T00:00:00');
    while (d <= fin) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function genererEreporting() {
    var zone = $id('er-resultat');
    var d1 = $id('er-de').value, d2 = $id('er-a').value;
    if (!d1 || !d2 || d1 > d2) {
      zone.innerHTML = '<p class="oc-err">Vérifiez les dates (début ≤ fin).</p>';
      return;
    }
    zone.innerHTML = '<p class="oc-info">Récupération des ventes…</p>';
    var jours = jours_plage(d1, d2);
    var donnees = [], restant = jours.length;
    var montantPourboires = parseFloat(($id('er-pourboires').value || '0').replace(',', '.')) || 0;

    jours.forEach(function (j) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/site/ventes?jour=' + j, true);
      xhr.timeout = 8000;
      xhr.onload = function () {
        try {
          var r = JSON.parse(xhr.responseText);
          if (r && typeof r.chiffre_affaires_ttc !== 'undefined') {
            r.jour = j;
            donnees.push(r);
          }
        } catch (e) { /* jour sans données */ }
        restant--;
        if (restant === 0) afficherEreporting(donnees, zone);
      };
      xhr.onerror = xhr.ontimeout = function () { restant--; if (restant === 0) afficherEreporting(donnees, zone); };
      xhr.send();
    });
  }

  function afficherEreporting(donnees, zone) {
    if (!donnees.length) {
      zone.innerHTML = '<p class="oc-info">Aucune vente sur cette période.</p>';
      return;
    }
    // tableau (avec colonne Pourboires et ligne de total)
    var h = '<table class="oc-tab"><thead><tr><th>Jour</th><th>CA TTC</th>' +
      '<th>CA HT</th><th>TVA</th><th>Tickets</th><th>Couverts</th><th>Pourboires (espèces)</th></tr></thead><tbody>';
    donnees.sort(function (a, b) { return a.jour < b.jour ? -1 : 1; });
    var totTtc = 0, totPourboires = 0;
    donnees.forEach(function (r) {
      totTtc += Number(r.chiffre_affaires_ttc) || 0;
      h += '<tr><td>' + r.jour + '</td><td>' + eur(r.chiffre_affaires_ttc) +
        '</td><td>' + eur(r.chiffre_affaires_ht) + '</td><td>' + eur(r.tva_collectee) +
        '</td><td>' + r.tickets + '</td><td>' + r.couverts + '</td><td>—</td></tr>';
    });
    // pourboires : une ligne de total sur la période
    h += '<tr><td><strong>Total</strong></td><td><strong>' + eur(totTtc) +
      '</strong></td><td></td><td></td><td></td><td></td>' +
      '<td><strong>' + eur(montantPourboires) + '</strong></td></tr>';
    h += '</tbody></table>';
    h += '<p class="oc-small">Pourboires : ' + eur(montantPourboires) +
      ' — à déposer à la caisse, comptabilisés en espèces uniquement.</p>';

    // CSV (une ligne par jour + ligne pourboires de la période)
    var csv = 'jour;ca_ttc;ca_ht;tva;tickets;couverts;ticket_moyen;pourboires_especes\r\n';
    donnees.forEach(function (r) {
      csv += [r.jour, r.chiffre_affaires_ttc, r.chiffre_affaires_ht,
        r.tva_collectee, r.tickets, r.couverts, r.ticket_moyen, '']
        .map(function (v) { return csv_escape(v); }).join(';') + '\r\n';
    });
    csv += 'TOTAL_PERIODE;;;;;;;' + csv_escape(montantPourboires) + '\r\n';
    // XML
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<e_reporting>\n';
    donnees.forEach(function (r) {
      xml += '  <jour date="' + r.jour + '">\n    <ca_ttc>' + r.chiffre_affaires_ttc +
        '</ca_ttc>\n    <ca_ht>' + r.chiffre_affaires_ht + '</ca_ht>\n    <tva>' +
        r.tva_collectee + '</tva>\n    <tickets>' + r.tickets + '</tickets>\n' +
        '    <couverts>' + r.couverts + '</couverts>\n    <ticket_moyen>' +
        r.ticket_moyen + '</ticket_moyen>\n  </jour>\n';
    });
    xml += '  <pourboires_especes>' + montantPourboires + '</pourboires_especes>\n';
    xml += '</e_reporting>\n';

    zone.innerHTML = h +
      '<div class="oc-btns">' +
      '<button type="button" class="oc-btn" id="er-csv">Télécharger le CSV</button>' +
      '<button type="button" class="oc-btn oc-btn-sec" id="er-xml">Télécharger le XML</button>' +
      '</div>';
    $id('er-csv').onclick = function () {
      telecharger('ereporting_' + d1 + '_' + d2 + '.csv', csv, 'text/csv;charset=utf-8');
    };
    $id('er-xml').onclick = function () {
      telecharger('ereporting_' + d1 + '_' + d2 + '.xml', xml, 'application/xml');
    };
    // stocke le montant pourboires pour référence (export inclus)
  }

  // ------------------------------------------------------------------
  //  Écran factures Factur-X
  // ------------------------------------------------------------------
  // Recherche récursive d'une balise par NOM LOCAL (insensible aux
  // namespaces : Factur-X, UBL, CII…)
  function trouverBalise(root, nomLocal) {
    if (!root) return '';
    if (root.nodeType === 1 && (root.localName || root.tagName.split(':').pop()) === nomLocal) {
      return (root.textContent || '').trim();
    }
    for (var i = 0; i < root.childNodes.length; i++) {
      var v = trouverBalise(root.childNodes[i], nomLocal);
      if (v) return v;
    }
    return '';
  }

  function lireFichier(ev) {
    var fichier = ev.target.files && ev.target.files[0];
    if (!fichier) return;
    var lecteur = new FileReader();
    lecteur.onload = function () {
      analyserFacture(lecteur.result, fichier.name);
    };
    lecteur.readAsArrayBuffer(fichier);
  }

  function analyserFacture(buffer, nomFichier) {
    var zone = $id('fx-resultat');
    // décode comme texte (les XML Factur-X sont en UTF-8)
    var texte = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    var xml = texte;

    // si c'est un PDF : extraire le XML Factur-X embarqué (FlateDecode)
    if (/^%PDF/.test(texte.trim()) || nomFichier.toLowerCase().endsWith('.pdf')) {
      xml = extraireXmlDuPdf(buffer);
      if (!xml) {
        zone.innerHTML = '<p class="oc-err">Aucun XML Factur-X trouvé dans ce PDF. ' +
          'Utilisez le fichier XML, ou le script build/facturx_archivage.py sur ordinateur.</p>';
        return;
      }
    }

    var doc;
    try {
      doc = new DOMParser().parseFromString(xml, 'application/xml');
    } catch (e) {
      zone.innerHTML = '<p class="oc-err">XML illisible : ' + echap(e.message) + '</p>';
      return;
    }
    var racine = doc.documentElement;
    var tag = (racine.localName || racine.tagName).split(':').pop();

    if (tag !== 'CrossIndustryInvoice' && tag !== 'Invoice') {
      zone.innerHTML = '<p class="oc-err">Type de document inconnu : ' + echap(tag) +
        ' (attendu Factur-X / CII ou UBL Invoice).</p>';
      return;
    }

    var champs = {
      fournisseur: trouverBalise(racine, 'Name') || trouverBalise(racine, 'RegistrationName'),
      numero: trouverBalise(racine, 'ApplicableHeaderTradeAgreementReference') || trouverBalise(racine, 'ID'),
      date: trouverBalise(racine, 'ApplicableHeaderTradeAgreementIssueDateTime') || trouverBalise(racine, 'IssueDate'),
      total_ttc: trouverBalise(racine, 'GrandTotalAmount') || trouverBalise(racine, 'TaxInclusiveAmount'),
      tva: trouverBalise(racine, 'TaxTotalAmount') || trouverBalise(racine, 'TaxAmount')
    };
    // normalise la date (20260820 -> 2026-08-20)
    if (/^\d{8}$/.test(champs.date)) {
      champs.date = champs.date.slice(0, 4) + '-' + champs.date.slice(4, 6) + '-' + champs.date.slice(6, 8);
    }
    var manques = [];
    if (!champs.fournisseur) manques.push('fournisseur');
    if (!champs.numero) manques.push('n° de facture');
    if (!champs.date) manques.push('date');
    if (!champs.total_ttc) manques.push('total TTC');
    if (!champs.tva) manques.push('TVA');

    var bilan = manques.length ? 'INCOMPLÈTE (' + manques.join(', ') + ')' : 'OK';
    zone.innerHTML = '<div class="oc-carte">' +
      '<p class="oc-bilan ' + (manques.length ? 'oc-bad' : 'oc-good') + '">' + bilan + '</p>' +
      '<p><strong>Fournisseur :</strong> ' + echap(champs.fournisseur || '—') + '</p>' +
      '<p><strong>N° facture :</strong> ' + echap(champs.numero || '—') + '</p>' +
      '<p><strong>Date :</strong> ' + echap(champs.date || '—') + '</p>' +
      '<p><strong>Total TTC :</strong> ' + eur(champs.total_ttc || 0) + '</p>' +
      '<p><strong>TVA :</strong> ' + eur(champs.tva || 0) + '</p>' +
      '<p class="oc-small">Fichier : ' + echap(nomFichier) + '</p>' +
      (manques.length ? '' :
        '<button type="button" class="oc-btn" id="fx-ajouter">Ajouter au registre</button>') +
      '</div>';
    if (!manques.length) {
      $id('fx-ajouter').onclick = function () { ajouterRegistre(champs, nomFichier); };
    }
  }

  // --- extraction du XML Factur-X depuis un PDF (FlateDecode) ---
  // Recherche d'un flux PDF contenant le XML en clair (les Factur-X PDF
  // ont souvent le XML non compressé). Si le flux est compressé
  // (FlateDecode), le traitement complet se fait via le script
  // build/facturx_archivage.py sur ordinateur — l'outil intégré couvre
  // le cas courant (XML direct ou PDF en clair).
  function extraireXmlDuPdf(buffer) {
    var u8 = new Uint8Array(buffer);
    var texte = new TextDecoder('latin1').decode(u8);
    var re = /stream\r?\n([\s\S]*?)\r?\nendstream/g, m;
    while ((m = re.exec(texte)) !== null) {
      var flux = m[1];
      if (flux.indexOf('Factur-X') >= 0 || flux.indexOf('CrossIndustryInvoice') >= 0) {
        return flux;
      }
    }
    return null;
  }

  // --- registre local (localStorage) ---
  function lireRegistre() {
    try { return JSON.parse(localStorage.getItem(REGISTRE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function ajouterRegistre(champs, nomFichier) {
    var reg = lireRegistre();
    reg.push({
      date_archivage: new Date().toISOString().slice(0, 10),
      fournisseur: champs.fournisseur,
      numero: champs.numero,
      date_facture: champs.date,
      total_ttc: champs.total_ttc,
      tva: champs.tva,
      fichier: nomFichier
    });
    try { localStorage.setItem(REGISTRE_KEY, JSON.stringify(reg)); } catch (e) { }
    afficherRegistre();
    var zone = $id('fx-resultat');
    zone.innerHTML = '<p class="oc-good">Facture ajoutée au registre.</p>' + zone.innerHTML;
  }
  function afficherRegistre() {
    var reg = lireRegistre();
    var zone = $id('fx-registre');
    if (!zone) return;
    if (!reg.length) {
      zone.innerHTML = '<p class="oc-info">Registre vide. Ajoutez vos premières factures Factur-X.</p>';
      return;
    }
    var h = '<table class="oc-tab"><thead><tr><th>Date</th><th>Fournisseur</th>' +
      '<th>N°</th><th>Total TTC</th></tr></thead><tbody>';
    reg.forEach(function (r) {
      h += '<tr><td>' + r.date_facture + '</td><td>' + echap(r.fournisseur) +
        '</td><td>' + echap(r.numero) + '</td><td>' + eur(r.total_ttc) + '</td></tr>';
    });
    h += '</tbody></table>';
    // export CSV du registre
    var csv = 'date_facture;fournisseur;numero;total_ttc;tva;date_archivage;fichier\r\n';
    reg.forEach(function (r) {
      csv += [r.date_facture, r.fournisseur, r.numero, r.total_ttc, r.tva,
        r.date_archivage, r.fichier].map(function (v) { return csv_escape(v); }).join(';') + '\r\n';
    });
    zone.innerHTML = h +
      '<button type="button" class="oc-btn" id="fx-reg-csv">Télécharger le registre (CSV)</button>';
    $id('fx-reg-csv').onclick = function () {
      telecharger('registre-factures.csv', csv, 'text/csv;charset=utf-8');
    };
  }

  // ------------------------------------------------------------------
  //  Cartes de fidélité (programme classique)
  //  Stockage : localStorage de la tablette (export/import JSON pour
  //  sauvegarde). 1 tampon par produit éligible, seuil configurable
  //  (défaut 10) = 1 pizza offerte.
  // ------------------------------------------------------------------
  var FID_DEFAUT = {
    seuil: 10,
    famillesEligibles: ['Pizzas'],
    message: '1 pizza = 1 tampon · 10 tampons = 1 pizza offerte',
    cards: []
  };

  function lireFidelite() {
    try {
      var d = JSON.parse(localStorage.getItem(FIDELITE_KEY) || 'null');
      if (d && d.cards) return d;
    } catch (e) { }
    return JSON.parse(JSON.stringify(FID_DEFAUT));
  }
  function sauverFidelite(d) {
    try { localStorage.setItem(FIDELITE_KEY, JSON.stringify(d)); } catch (e) { }
  }
  function newCardId(d) {
    var n = d.cards.length + 1;
    while (d.cards.some(function (c) { return c.id === 'F-' + String(n).padStart(4, '0'); })) n++;
    return 'F-' + String(n).padStart(4, '0');
  }

  function contenuFidelite() {
    var d = lireFidelite();
    return '<div class="oc-form">' +
      '<label>Rechercher (n° ou téléphone)</label>' +
      '<input id="fd-recherche" type="text" placeholder="F-0042 ou 06 12…">' +
      '<div class="oc-btns">' +
      '<button type="button" class="oc-btn" id="fd-creer">Nouvelle carte</button>' +
      '<button type="button" class="oc-btn oc-btn-sec" id="fd-config">Configurer</button>' +
      '<button type="button" class="oc-btn oc-btn-sec" id="fd-export">Exporter (CSV)</button>' +
      '</div></div>' +
      '<div class="oc-small" style="margin-top:6px">Programme : ' + echap(d.message) +
      ' — tampons stockés sur la tablette (sauvegardez via l\'export).</div>' +
      '<div id="fd-liste"></div>';
  }

  function carteLigne(c, d) {
    var stamps = 0, offres = 0;
    (c.tampons || []).forEach(function (t) {
      if (t.type === 'offre') offres += t.qte; else stamps += t.qte;
    });
    var prog = stamps % d.seuil;
    return '<div class="oc-carte fd-carte">' +
      '<p><strong>' + echap(c.id) + '</strong> · ' + echap(c.nom || c.tel || '—') +
      ' <span class="oc-small">(créée le ' + echap(c.cree || '') + ')</span></p>' +
      '<p>Tampons : <strong>' + stamps + '</strong> / seuil ' + d.seuil +
      ' · progressif ' + prog + '/' + d.seuil +
      ' · offres utilisées : ' + offres + '</p>' +
      '<div class="oc-btns">' +
      '<button type="button" class="oc-btn oc-btn-sec" data-fd-stamp="' + echap(c.id) + '">+1 tampon</button>' +
      '<button type="button" class="oc-btn oc-btn-sec" data-fd-offre="' + echap(c.id) + '">Offrir une pizza</button>' +
      '<button type="button" class="oc-btn oc-btn-sec" data-fd-detail="' + echap(c.id) + '">Historique</button>' +
      '</div><div class="oc-small" data-fd-hist="' + echap(c.id) + '"></div></div>';
  }

  function afficherFidelite() {
    var d = lireFidelite();
    var zone = $id('fd-liste');
    if (!zone) return;
    var q = ($id('fd-recherche').value || '').toLowerCase();
    var liste = d.cards.filter(function (c) {
      if (!q) return true;
      return (c.id + ' ' + (c.nom || '') + ' ' + (c.tel || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!liste.length) {
      zone.innerHTML = '<p class="oc-info">Aucune carte' + (q ? ' correspondante' : '') +
        '. Créez la première carte de fidélité.</p>';
      return;
    }
    zone.innerHTML = liste.map(function (c) { return carteLigne(c, d); }).join('');
    // branche les actions
    zone.querySelectorAll('[data-fd-stamp]').forEach(function (b) {
      b.addEventListener('click', function () { ajouterTampon(b.dataset.fdStamp, 1); });
    });
    zone.querySelectorAll('[data-fd-offre]').forEach(function (b) {
      b.addEventListener('click', function () { utiliserOffre(b.dataset.fdOffre); });
    });
    zone.querySelectorAll('[data-fd-detail]').forEach(function (b) {
      b.addEventListener('click', function () { afficherDetail(b.dataset.fdDetail); });
    });
  }

  function ajouterTampon(id, qte) {
    var d = lireFidelite();
    var c = d.cards.find(function (x) { return x.id === id; });
    if (!c) return;
    c.tampons = c.tampons || [];
    c.tampons.push({ date: new Date().toISOString().slice(0, 10), qte: qte, type: 'tampon' });
    sauverFidelite(d);
    afficherFidelite();
  }
  function utiliserOffre(id) {
    var d = lireFidelite();
    var c = d.cards.find(function (x) { return x.id === id; });
    if (!c) return;
    var stamps = 0;
    (c.tampons || []).forEach(function (t) { if (t.type !== 'offre') stamps += t.qte; });
    if (stamps < d.seuil) {
      alert('Pas assez de tampons : ' + stamps + ' / ' + d.seuil);
      return;
    }
    if (!confirm('Offrir une pizza à ' + c.id + ' ? (consomme ' + d.seuil + ' tampons)')) return;
    c.tampons.push({ date: new Date().toISOString().slice(0, 10), qte: 1, type: 'offre', note: 'pizza offerte' });
    sauverFidelite(d);
    afficherFidelite();
  }
  function afficherDetail(id) {
    var d = lireFidelite();
    var c = d.cards.find(function (x) { return x.id === id; });
    var zone = document.querySelector('[data-fd-hist="' + id + '"]');
    if (!zone || !c) return;
    var h = (c.tampons || []).slice().reverse().map(function (t) {
      return '<div>' + t.date + ' — ' + (t.type === 'offre' ? '🎁 ' : '➕ ') +
        (t.type === 'offre' ? 'pizza offerte' : '+' + t.qte + ' tampon(s)') +
        (t.note ? ' (' + echap(t.note) + ')' : '') + '</div>';
    }).join('') || 'Aucun mouvement.';
    zone.innerHTML = h;
  }

  function creerCarte() {
    var d = lireFidelite();
    var id = newCardId(d);
    var nom = prompt('Nom du client (facultatif) :') || '';
    var tel = prompt('Téléphone (facultatif) :') || '';
    d.cards.push({ id: id, nom: nom, tel: tel, cree: new Date().toISOString().slice(0, 10), tampons: [] });
    sauverFidelite(d);
    afficherFidelite();
  }
  function configurerFidelite() {
    var d = lireFidelite();
    var seuil = prompt('Seuil de tampons pour une pizza offerte (défaut 10) :', String(d.seuil));
    var s = parseInt(seuil, 10);
    if (!isNaN(s) && s > 0) d.seuil = s;
    var fam = prompt('Familles éligibles, séparées par des virgules (ex. Pizzas) :',
                    d.famillesEligibles.join(', '));
    if (fam && fam.trim()) {
      d.famillesEligibles = fam.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    }
    d.message = '1 tampon par produit éligible · ' + d.seuil + ' tampons = 1 pizza offerte';
    sauverFidelite(d);
    afficherFidelite();
  }
  function exporterFidelite() {
    var d = lireFidelite();
    var lignes = ['id;nom;tel;cree;type;date;qte;note'];
    d.cards.forEach(function (c) {
      (c.tampons || []).forEach(function (t) {
        lignes.push([c.id, c.nom, c.tel, c.cree, t.type, t.date, t.qte, t.note || '']
          .map(csv_escape).join(';'));
      });
    });
    telecharger('fidelite.csv', lignes.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  }

  function brancherFidelite() {
    $id('fd-creer').addEventListener('click', creerCarte);
    $id('fd-config').addEventListener('click', configurerFidelite);
    $id('fd-export').addEventListener('click', exporterFidelite);
    $id('fd-recherche').addEventListener('input', afficherFidelite);
    afficherFidelite();
  }

  // ------------------------------------------------------------------
  //  Produits à la vente (consultation + export)
  //  NB : la modification (nom, tarif, description, photo) se fait dans
  //  l'application native (Administration → Catalogue). Cet outil permet
  //  de consulter et d'exporter le catalogue (via la route locale /carte).
  // ------------------------------------------------------------------
  function contenuProduits() {
    return '<p class="oc-info">Chargement du catalogue…</p><div id="pd-liste"></div>';
  }
  function chargerProduits() {
    var zone = $id('pd-liste');
    if (!zone) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/carte', true);
    xhr.timeout = 8000;
    xhr.onload = function () {
      try {
        var r = JSON.parse(xhr.responseText);
        var prods = (r && r.produits) || [];
        if (!prods.length) {
          zone.innerHTML = '<p class="oc-info">Catalogue vide.</p>';
          return;
        }
        var h = '<div class="oc-btns">' +
          '<button type="button" class="oc-btn" id="pd-csv">Exporter le catalogue (CSV)</button>' +
          '</div>' +
          '<table class="oc-tab"><thead><tr><th>Nom</th><th>Famille</th>' +
          '<th>Prix TTC</th><th>TVA</th><th>Actif</th></tr></thead><tbody>';
        prods.forEach(function (p) {
          h += '<tr><td>' + echap(p.nom) + '</td><td>' + echap(p.fam) +
            '</td><td>' + eur(p.prix_ttc) + '</td><td>' + (p.tva || 0) +
            '%</td><td>' + (p.disponible ? '✓' : '✗') + '</td></tr>';
        });
        h += '</tbody></table>' +
          '<p class="oc-small">Pour modifier un produit (nom, tarif, description, photo) : ' +
          'application → Administration → Catalogue. L\'export sert de référence ' +
          '(e-reporting, menus imprimés).</p>';
        zone.innerHTML = h;
        $id('pd-csv').addEventListener('click', function () {
          var lignes = ['nom;famille;categorie;description;prix_ttc;tva;disponible'];
          prods.forEach(function (p) {
            lignes.push([p.nom, p.fam, p.cat, p.description || '', p.prix_ttc, p.tva,
              p.disponible ? 'oui' : 'non'].map(csv_escape).join(';'));
          });
          telecharger('catalogue.csv', lignes.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
        });
      } catch (e) {
        zone.innerHTML = '<p class="oc-err">Catalogue illisible : ' + echap(e.message) + '</p>';
      }
    };
    xhr.onerror = xhr.ontimeout = function () {
      zone.innerHTML = '<p class="oc-err">Tablette injoignable.</p>';
    };
    xhr.send();
  }

  // ------------------------------------------------------------------
  //  Construction / ouverture / fermeture des écrans
  // ------------------------------------------------------------------
  function construireEcrans() {
    var ov = document.createElement('div');
    ov.id = 'oc-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div id="oc-carte">' +
      '<div class="oc-entete"><h2 id="oc-titre">Outils</h2>' +
      '<button type="button" id="oc-fermer" aria-label="Fermer">×</button></div>' +
      '<p class="oc-sous" id="oc-sous"></p>' +
      '<div class="oc-nav">' +
      '<button type="button" class="oc-nav-btn" data-outil="ereporting">Export e-reporting</button>' +
      '<button type="button" class="oc-nav-btn" data-outil="factures">Factures Factur-X</button>' +
      '<button type="button" class="oc-nav-btn" data-outil="fidelite">Fidélité</button>' +
      '<button type="button" class="oc-nav-btn" data-outil="produits">Produits</button>' +
      '<button type="button" class="oc-nav-btn oc-nav-pin" id="oc-pin-btn" ' +
      'aria-label="Modifier le code PIN">🔒 Code</button>' +
      '</div>' +
      '<div id="oc-contenu"></div>' +
      '</div>';
    document.body.appendChild(ov);

    $id('oc-fermer').addEventListener('click', fermer);
    ov.addEventListener('click', function (e) { if (e.target === ov) fermer(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('on')) fermer();
    });
    var btns = ov.querySelectorAll('.oc-nav-btn[data-outil]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { ouvrir(this.dataset.outil); });
    }
    // « Code » : permet de modifier le PIN depuis l'intérieur des outils
    $id('oc-pin-btn').addEventListener('click', function () {
      ecranPin('definir');
    });

    // bouton flottant « Outils » (visible, en bas à gauche au-dessus du QR)
    var btnOutils = document.createElement('button');
    btnOutils.id = 'btn-outils';
    btnOutils.type = 'button';
    btnOutils.setAttribute('aria-label', 'Outils de gestion : e-reporting, factures');
    btnOutils.textContent = '⚙';
    btnOutils.addEventListener('click', function () { ouvrir('ereporting'); });
    document.body.appendChild(btnOutils);
  }

  function contenuEreporting() {
    var auj = new Date().toISOString().slice(0, 10);
    var hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return '<div class="oc-form">' +
      '<label>Du <input type="date" id="er-de" value="' + hier + '"></label>' +
      '<label>Au <input type="date" id="er-a" value="' + auj + '"></label>' +
      '<label for="er-pourboires">Pourboires reçus sur la période (€) — ' +
      '<span class="oc-small">déposés à la caisse, comptabilisés en espèces uniquement</span></label>' +
      '<input id="er-pourboires" type="number" min="0" step="0.5" inputmode="decimal" placeholder="Ex. 45,50" value="">' +
      '<button type="button" class="oc-btn" id="er-gen">Générer l\'export</button>' +
      '</div>' +
      '<p class="oc-small" style="margin-top:6px">💡 Règle comptable : les pourboires sont ' +
      'déposés à la caisse et enregistrés en <strong>espèces uniquement</strong>. Ils sont ' +
      'inclus dans les statistiques et l\'export ci-dessous.</p>' +
      '<div id="er-resultat"></div>';
  }

  function contenuFactures() {
    return '<div class="oc-form">' +
      '<p class="oc-small">Déposez une facture fournisseur (XML Factur-X, ou PDF avec XML embarqué) pour la contrôler et l\'ajouter au registre.</p>' +
      '<input type="file" id="fx-fichier" accept=".xml,.pdf">' +
      '</div><div id="fx-resultat"></div>' +
      '<h3 class="oc-h3">Registre des factures reçues</h3><div id="fx-registre"></div>';
  }

  function ouvrir(outil) {
    OUTIL_COURANT = outil;
    var ov = $id('oc-overlay');
    if (!ov) return;
    ov.classList.add('on');
    document.body.style.overflow = 'hidden';
    // accès protégé par code PIN (défini à la première utilisation).
    // Une fois validé, la session reste ouverte jusqu'à la fermeture :
    // on peut naviguer entre les onglets sans ressaisir le code.
    if (SESSION_OK) {
      ouvrirOutils(outil);
    } else if (!pinDefini()) {
      ecranPin('definir');
    } else {
      ecranPin('verif');
    }
    var f = $id('oc-fermer');
    if (f) f.focus();
  }

  function fermer() {
    SESSION_OK = false;   // on reverrouille à la fermeture
    var ov = $id('oc-overlay');
    if (ov) ov.classList.remove('on');
    document.body.style.overflow = '';
    // nettoie le hash pour ne pas rouvrir au rechargement
    try { history.replaceState(null, '', '#'); } catch (e) { }
  }

  function init() {
    construireEcrans();
    // ouverture automatique par hash : #ereporting ou #factures
    var h = (location.hash || '').replace('#', '');
    if (h === 'ereporting' || h === 'factures') {
      setTimeout(function () { ouvrir(h); }, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
