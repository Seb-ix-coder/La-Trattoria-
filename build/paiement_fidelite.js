/* ============================================================================
   Addon « Mode de paiement & carte de fidélité » — client (site.js)
   ============================================================================
   1. Choix du MODE DE PAIEMENT prévu par le client, au moment de sa
      commande en ligne :
        Espèces · Carte · Tickets restaurant · Chèque · Bon de fidélité
      Le choix est rappelé dans le récapitulatif, envoyé dans la commande
      et ajouté à la NOTE de la commande (« Paiement : … ») pour que le
      personnel le voie à l'écran et l'encaisse au retrait.

   2. CARTE DE FIDÉLITÉ (programme classique) :
      - le client peut saisir son numéro de carte (ou téléphone) au moment
        de la commande : « Carte fidélité : … » est ajouté à la note pour
        que le personnel appose les tampons au retrait,
      - une section d'information « Carte de fidélité » est ajoutée à la
        page (1 pizza = 1 tampon, 10 tampons = 1 pizza offerte — seuil
        configurable dans les outils de gestion).

   NB : le pourboire (addon pourboire.js) reste géré séparément ; cet
   addon ne touche pas à sa note.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var PAIEMENTS = [
    { id: 'especes', label: 'Espèces' },
    { id: 'carte', label: 'Carte' },
    { id: 'tickets', label: 'Tickets restaurant' },
    { id: 'cheque', label: 'Chèque' },
    { id: 'fidelite', label: 'Bon de fidélité' }
  ];
  var PAIEMENT = 'especes';          // valeur par défaut
  var CARTE_FIDELITE = '';           // n° de carte ou téléphone saisi

  // ------------------------------------------------------------------
  //  Construction du bloc dans le tiroir de commande (après le pourboire)
  // ------------------------------------------------------------------
  function initPaiement() {
    // idempotent : ne crée jamais deux fois le bloc (le MutationObserver
    // peut redéclencher cette fonction après chaque modification du pied)
    if (document.getElementById('paiement-bloc')) return;
    var ref = document.getElementById('pourboire-bloc')
      || document.querySelector('#panier-pied .mention-tva');
    var pied = document.getElementById('panier-pied');
    if (!ref || !pied) return;

    // ligne « Paiement prévu » dans le récapitulatif
    var totalDiv = document.querySelector('#panier-pied .total');
    if (totalDiv && !document.getElementById('paiement-recap')) {
      var recap = document.createElement('p');
      recap.id = 'paiement-recap';
      recap.className = 'paiement-recap';
      totalDiv.parentNode.insertBefore(recap, totalDiv.nextSibling);
    }

    var bloc = document.createElement('div');
    bloc.className = 'paiement';
    bloc.id = 'paiement-bloc';
    var opts = PAIEMENTS.map(function (p, i) {
      return '<label class="pm-opt"><input type="radio" name="pm" value="' + p.id + '"' +
        (i === 0 ? ' checked' : '') + '><span>' + p.label + '</span></label>';
    }).join('');
    bloc.innerHTML =
      '<p class="paiement-titre">Mode de paiement prévu <span>(réglé au retrait)</span></p>' +
      '<div class="paiement-options" role="radiogroup" aria-label="Mode de paiement">' +
      opts + '</div>' +
      '<div class="paiement-fidelite">' +
      '<label for="pm-fidelite">Carte de fidélité (facultatif) : n° ou téléphone</label>' +
      '<input id="pm-fidelite" type="text" inputmode="text" autocomplete="off" ' +
      'placeholder="Ex. F-0042 ou 06 12 34 56 78" maxlength="30">' +
      '<p class="paiement-aide">1 pizza = 1 tampon · 10 tampons = 1 pizza offerte</p>' +
      '</div>' +
      '<p class="paiement-tip">💡 Le pourboire est à déposer à la caisse au retrait.</p>';
    ref.parentNode.insertBefore(bloc, ref.nextSibling);

    // gestion des radios
    bloc.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'pm') {
        PAIEMENT = e.target.value;
        majRecap();
      }
    });
    var champ = document.getElementById('pm-fidelite');
    if (champ) {
      champ.addEventListener('input', function () {
        CARTE_FIDELITE = champ.value.trim();
      });
    }

    majRecap();
  }

  // ------------------------------------------------------------------
  //  Récapitulatif + injection dans la note (idempotent)
  // ------------------------------------------------------------------
  function majRecap() {
    var recap = document.getElementById('paiement-recap');
    if (!recap) return;
    var label = '';
    for (var i = 0; i < PAIEMENTS.length; i++) {
      if (PAIEMENTS[i].id === PAIEMENT) label = PAIEMENTS[i].label;
    }
    recap.textContent = 'Paiement prévu : ' + label +
      (CARTE_FIDELITE ? ' · Carte fidélité : ' + CARTE_FIDELITE : '');
  }

  // Marqueurs gérés par cet addon (Paiement / Carte fidélité) — on ne
  // touche pas au marqueur « Pourboire » de l'addon pourboire.js.
  function noteSansMarqueurs(v) {
    return String(v || '').replace(/(\s*\|\s*)?(Paiement : [^|]*|Carte fidélité : [^|]*)/g, '');
  }
  function composerNote() {
    var note = document.getElementById('cl-note');
    if (!note) return;
    var v = noteSansMarqueurs(note.value);
    var parts = [];
    if (v.trim()) parts.push(v.trim());
    parts.push('Paiement : ' + labelPaiement());
    if (CARTE_FIDELITE) parts.push('Carte fidélité : ' + CARTE_FIDELITE);
    note.value = parts.join(' | ');
  }
  function labelPaiement() {
    for (var i = 0; i < PAIEMENTS.length; i++) {
      if (PAIEMENTS[i].id === PAIEMENT) return PAIEMENTS[i].label;
    }
    return 'Espèces';
  }

  // ------------------------------------------------------------------
  //  Section d'information « Carte de fidélité » sur la page
  // ------------------------------------------------------------------
  function sectionFidelite() {
    if (document.getElementById('fidelite-info')) return;
    var section = document.createElement('section');
    section.id = 'fidelite-info';
    section.className = 'alt';
    section.innerHTML =
      '<div class="conteneur" style="max-width:620px">' +
      '<div class="titre-sec"><h2>Carte de fidélité</h2>' +
      '<p>Merci de votre fidélité !</p></div><div class="sep"></div>' +
      '<p>À chaque <strong>pizza</strong> achetée, gagnez un <strong>tampon</strong> ' +
      'sur votre carte. Après <strong>10 tampons</strong>, votre <strong>pizza ' +
      'offerte</strong> vous attend !</p>' +
      '<p>Indiquez le numéro de votre carte (ou votre téléphone) au moment de ' +
      'la commande, ou présentez-la au comptoir : nous apposons vos tampons ' +
      'à chaque passage.</p>' +
      '</div></section>';
    // insère avant le footer (après la dernière section principale)
    var pied = document.querySelector('footer') || document.body.lastChild;
    if (pied && pied.parentNode) {
      pied.parentNode.insertBefore(section, pied);
    } else {
      document.body.appendChild(section);
    }
  }

  // ------------------------------------------------------------------
  //  Branchement
  // ------------------------------------------------------------------
  function init() {
    // injection dans la note AVANT l'envoi (phase de capture, comme le
    // pourboire — on n'écrase pas son marqueur)
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('#valider')) composerNote();
    }, true);
    // après le chargement du panier (le tiroir peut être reconstruit)
    var pret = function () { initPaiement(); sectionFidelite(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', pret);
    } else {
      pret();
    }
    // si le tiroir est reconstruit après coup (panier modifié), on
    // ré-attache le bloc (idempotent : on ne crée pas de doublon)
    var obs = null;
    try {
      obs = new MutationObserver(function () {
        if (!document.getElementById('paiement-bloc') && document.getElementById('panier-pied')) {
          initPaiement();
        }
        // dès que le bloc est en place, on arrête d'observer
        if (document.getElementById('paiement-bloc') && obs) obs.disconnect();
      });
      var pied = document.getElementById('panier-pied');
      if (pied) obs.observe(pied, { childList: true, subtree: true });
    } catch (e) { /* pas de MutationObserver : on s'en passe */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
