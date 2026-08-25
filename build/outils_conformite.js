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
    factures: { titre: 'Factures fournisseurs', sous: 'Contrôle Factur-X + registre' }
  };
  var REGISTRE_KEY = 'trattoria_registre_factures';

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
    // tableau
    var h = '<table class="oc-tab"><thead><tr><th>Jour</th><th>CA TTC</th>' +
      '<th>CA HT</th><th>TVA</th><th>Tickets</th><th>Couverts</th></tr></thead><tbody>';
    donnees.sort(function (a, b) { return a.jour < b.jour ? -1 : 1; });
    donnees.forEach(function (r) {
      h += '<tr><td>' + r.jour + '</td><td>' + eur(r.chiffre_affaires_ttc) +
        '</td><td>' + eur(r.chiffre_affaires_ht) + '</td><td>' + eur(r.tva_collectee) +
        '</td><td>' + r.tickets + '</td><td>' + r.couverts + '</td></tr>';
    });
    h += '</tbody></table>';

    // CSV
    var csv = 'jour;ca_ttc;ca_ht;tva;tickets;couverts;ticket_moyen\r\n';
    donnees.forEach(function (r) {
      csv += [r.jour, r.chiffre_affaires_ttc, r.chiffre_affaires_ht,
        r.tva_collectee, r.tickets, r.couverts, r.ticket_moyen]
        .map(function (v) { return csv_escape(v); }).join(';') + '\r\n';
    });
    // XML
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<e_reporting>\n';
    donnees.forEach(function (r) {
      xml += '  <jour date="' + r.jour + '">\n    <ca_ttc>' + r.chiffre_affaires_ttc +
        '</ca_ttc>\n    <ca_ht>' + r.chiffre_affaires_ht + '</ca_ht>\n    <tva>' +
        r.tva_collectee + '</tva>\n    <tickets>' + r.tickets + '</tickets>\n' +
        '    <couverts>' + r.couverts + '</couverts>\n    <ticket_moyen>' +
        r.ticket_moyen + '</ticket_moyen>\n  </jour>\n';
    });
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
      '</div>' +
      '<div id="oc-contenu"></div>' +
      '</div>';
    document.body.appendChild(ov);

    $id('oc-fermer').addEventListener('click', fermer);
    ov.addEventListener('click', function (e) { if (e.target === ov) fermer(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('on')) fermer();
    });
    var btns = ov.querySelectorAll('.oc-nav-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { ouvrir(this.dataset.outil); });
    }
  }

  function contenuEreporting() {
    var auj = new Date().toISOString().slice(0, 10);
    var hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return '<div class="oc-form">' +
      '<label>Du <input type="date" id="er-de" value="' + hier + '"></label>' +
      '<label>Au <input type="date" id="er-a" value="' + auj + '"></label>' +
      '<button type="button" class="oc-btn" id="er-gen">Générer l\'export</button>' +
      '</div><div id="er-resultat"></div>';
  }

  function contenuFactures() {
    return '<div class="oc-form">' +
      '<p class="oc-small">Déposez une facture fournisseur (XML Factur-X, ou PDF avec XML embarqué) pour la contrôler et l\'ajouter au registre.</p>' +
      '<input type="file" id="fx-fichier" accept=".xml,.pdf">' +
      '</div><div id="fx-resultat"></div>' +
      '<h3 class="oc-h3">Registre des factures reçues</h3><div id="fx-registre"></div>';
  }

  function ouvrir(outil) {
    var ov = $id('oc-overlay');
    if (!ov) return;
    ov.classList.add('on');
    document.body.style.overflow = 'hidden';
    $id('oc-titre').textContent = OUTILS[outil].titre;
    $id('oc-sous').textContent = OUTILS[outil].sous;
    if (outil === 'ereporting') {
      $id('oc-contenu').innerHTML = contenuEreporting();
      $id('er-gen').addEventListener('click', genererEreporting);
    } else {
      $id('oc-contenu').innerHTML = contenuFactures();
      $id('fx-fichier').addEventListener('change', lireFichier);
      afficherRegistre();
    }
    var f = $id('oc-fermer');
    if (f) f.focus();
  }

  function fermer() {
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
