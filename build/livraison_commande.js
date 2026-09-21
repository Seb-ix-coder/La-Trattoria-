/* ============================================================================
   Addon « Réception, livraison et frais » — site client
   --------------------------------------------------------------------------
   Les frais sont une ligne séparée du panier : ils ne modifient jamais le
   prix unitaire d'une pizza ou d'un autre produit. La configuration est
   éditée dans le module Carte et conservée sous localStorage.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var CLE = 'trattoria.delivery.v1';
  var CONFIG = { sur_place: 0, uber: 4.5, livraison_urbaine: 3 };
  var MODES = [
    { id: 'sur_place', label: 'Sur place', aide: 'Retrait ou consommation au restaurant' },
    { id: 'uber', label: 'Uber', aide: 'Frais Uber ajoutés séparément' },
    { id: 'livraison_urbaine', label: 'Livraison urbaine', aide: 'Livraison locale par la Trattoria' }
  ];
  var MODE = 'sur_place';

  function charger() {
    try {
      var src = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (src && typeof src === 'object') MODES.forEach(function (m) {
        var n = Number(src[m.id]);
        if (isFinite(n) && n >= 0 && n <= 100) CONFIG[m.id] = Math.round(n * 100) / 100;
      });
    } catch (e) { }
  }
  function eur(n) {
    return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
  }
  function lireEuro(text) {
    var n = parseFloat(String(text || '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  function frais() { return CONFIG[MODE] || 0; }
  function labelMode() {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === MODE) return MODES[i].label;
    return 'Sur place';
  }
  function totalProduits() {
    var el = document.getElementById('panier-total');
    var recap = document.getElementById('livraison-recap');
    var total = el ? lireEuro(el.textContent) : 0;
    // Le noyau réécrit le total produits lors de chaque modification du
    // panier ; sinon la valeur courante comprend déjà nos frais.
    if (recap && recap.dataset.produits) {
      var ancien = Number(recap.dataset.produits) || 0;
      var ancienTotal = ancien + frais();
      if (Math.abs(total - ancienTotal) < 0.001) total = ancien;
    }
    return Math.max(0, total);
  }
  function totalCommande() { return totalProduits() + frais(); }

  function majTotaux() {
    var produits = totalProduits();
    var total = produits + frais();
    var totalEl = document.getElementById('panier-total');
    if (totalEl) totalEl.textContent = eur(total);
    var flot = document.getElementById('flot-total');
    if (flot) flot.textContent = eur(total);
    var recap = document.getElementById('livraison-recap');
    if (recap) {
      recap.dataset.produits = String(produits);
      recap.innerHTML = 'Produits : ' + eur(produits) + ' · ' + labelMode() +
        ' : ' + (frais() ? '+' + eur(frais()) : 'gratuit') +
        ' · <strong>Total : ' + eur(total) + '</strong>';
    }
    var titre = document.getElementById('livraison-aide');
    if (titre) titre.textContent = MODES.filter(function (m) { return m.id === MODE; })[0].aide;
    var paiement = document.getElementById('paiement-recap');
    if (paiement && paiement.dataset.paiement) {
      paiement.textContent = paiement.dataset.paiement + ' · ' + labelMode() +
        (frais() ? ' · Frais : ' + eur(frais()) : ' · Frais : gratuit');
    }
  }

  function injecter() {
    if (!document.getElementById('paiement-bloc') || document.getElementById('livraison-bloc')) return;
    var paiement = document.getElementById('paiement-bloc');
    var bloc = document.createElement('div');
    bloc.id = 'livraison-bloc';
    bloc.className = 'livraison-commande';
    bloc.innerHTML = '<p class="paiement-titre">Mode de réception / livraison</p>' +
      '<div class="livraison-options" role="radiogroup" aria-label="Mode de réception">' +
      MODES.map(function (m, i) {
        return '<label class="liv-opt"><input type="radio" name="mode-reception" value="' + m.id + '"' +
          (i === 0 ? ' checked' : '') + '><span>' + m.label +
          '<small>' + (CONFIG[m.id] ? '+' + eur(CONFIG[m.id]) : 'Sans frais') + '</small></span></label>';
      }).join('') + '</div>' +
      '<p id="livraison-aide" class="paiement-aide">' + MODES[0].aide + '</p>' +
      '<p id="livraison-recap" class="livraison-recap"></p>';
    paiement.appendChild(bloc);

    var recap = document.getElementById('paiement-recap');
    if (recap) recap.dataset.paiement = recap.textContent;
    bloc.addEventListener('change', function (e) {
      if (!e.target || e.target.name !== 'mode-reception') return;
      MODE = e.target.value;
      majTotaux();
    });
    majTotaux();
  }

  function noteNettoyee(v) {
    return String(v || '').replace(/(\s*\|\s*)?(Réception : [^|]*|Frais de livraison : [^|]*)/g, '');
  }
  function ajouterNote() {
    var note = document.getElementById('cl-note');
    if (!note) return;
    var parts = [];
    var base = noteNettoyee(note.value).trim();
    if (base) parts.push(base);
    parts.push('Réception : ' + labelMode());
    parts.push('Frais de livraison : ' + eur(frais()));
    note.value = parts.join(' | ');
  }

  // À partir de la prochaine version du serveur, ces champs deviennent
  // vérifiables côté restaurant. Le total reste aussi dans le champ historique
  // « total » afin que le site et les systèmes compatibles affichent le même
  // montant.
  function envelopperEnvoi() {
    if (window.__trattoriaLivraisonXhr) return;
    var Original = window.XMLHttpRequest;
    if (!Original || !Original.prototype) return;
    var ancien = Original.prototype.send;
    Original.prototype.send = function (body) {
      try {
        if (this.__url && /\/site\/commande$|\/api\/commande$/.test(this.__url) && typeof body === 'string') {
          var cmd = JSON.parse(body);
          var paiement = document.querySelector('input[name="pm"]:checked');
          var paiementLabel = paiement && paiement.parentNode
            ? (paiement.parentNode.querySelector('span') || {}).textContent || paiement.value
            : 'Espèces';
          cmd.modeReception = MODE;
          cmd.reception = labelMode();
          cmd.fraisLivraison = frais();
          cmd.totalProduits = totalProduits();
          cmd.total = totalCommande();
          // Adaptation au contrat JSON du serveur natif 13.0 : client et q
          // sont les noms validés par ServeurSite. Les informations de
          // réception/paiement restent visibles dans l'écran restaurant via
          // le libellé client, même avec le DEX conservé intact.
          cmd.client = String(cmd.client || cmd.nom || 'Client').trim();
          var suffixe = ' · ' + paiementLabel.replace(/\\s+/g, ' ').trim() +
            ' · ' + labelMode() + (frais() ? ' +' + eur(frais()) : ' gratuit');
          cmd.client = (suffixe + ' · ' + cmd.client).slice(0, 80);
          cmd.lignes = (cmd.lignes || []).map(function (l) {
            return { id: l.id, nom: l.nom, pv: Number(l.prix || l.pv || 0),
              q: Number(l.qte || l.q || 1) };
          });
          body = JSON.stringify(cmd);
        }
      } catch (e) { }
      return ancien.call(this, body);
    };
    var ouvert = Original.prototype.open;
    Original.prototype.open = function (m, u) {
      this.__url = u || '';
      return ouvert.apply(this, arguments);
    };
    window.__trattoriaLivraisonXhr = true;
  }

  function styles() {
    if (document.getElementById('livraison-commande-style')) return;
    var s = document.createElement('style');
    s.id = 'livraison-commande-style';
    s.textContent = '#livraison-bloc{margin-top:10px;padding-top:10px;border-top:1px solid var(--trait,#D8CFC0)}' +
      '.livraison-options{display:flex;flex-wrap:wrap;gap:7px}' +
      '.liv-opt{flex:1 1 30%;min-width:125px;position:relative;cursor:pointer}' +
      '.liv-opt input{position:absolute;opacity:0;width:100%;height:100%;cursor:pointer}' +
      '.liv-opt span{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:46px;padding:5px 8px;border:1.5px solid var(--trait,#D8CFC0);border-radius:11px;background:#fff;color:var(--texte,#2B2B28);font-size:14px;font-weight:600;text-align:center}' +
      '.liv-opt small{font-size:11px;font-weight:400;color:var(--gris,#6E6A63);margin-top:2px}' +
      '.liv-opt input:checked+span{background:var(--rouge,#A51822);border-color:var(--rouge,#A51822);color:#fff}' +
      '.liv-opt input:checked+span small{color:#fff}' +
      '.livraison-recap{margin:7px 0 0;font-size:12.5px;color:var(--texte,#2B2B28);text-align:right}' +
      '@media(max-width:560px){.liv-opt{min-width:100px}.liv-opt span{font-size:12.5px}}';
    document.head.appendChild(s);
  }

  function afficherSucces() {
    var etat = document.querySelector('#panier-corps .etat.ok');
    if (!etat || document.getElementById('livraison-succes-info')) return;
    var p = document.createElement('p');
    p.id = 'livraison-succes-info';
    p.className = 'aide livraison-succes-info';
    var pm = document.querySelector('input[name="pm"]:checked');
    var pmLabel = pm && pm.parentNode && pm.parentNode.querySelector('span');
    p.innerHTML = '<strong>Paiement : ' + (pmLabel ? pmLabel.textContent : 'Espèces') +
      '</strong><br>Réception : ' + labelMode() + '<br>Frais de livraison : ' + eur(frais()) +
      '<br><strong>Total : ' + eur(totalCommande()) + '</strong>';
    var aide = etat.querySelector('.aide');
    if (aide) etat.insertBefore(p, aide);
    else etat.appendChild(p);
  }

  function init() {
    styles();
    charger();
    envelopperEnvoi();
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('#valider')) ajouterNote();
    }, true);
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'pm') {
        var recap = document.getElementById('paiement-recap');
        if (recap) recap.dataset.paiement = recap.textContent;
        majTotaux();
      }
    });
    var observer = null;
    try {
      observer = new MutationObserver(function () {
        injecter();
        if (document.getElementById('livraison-bloc')) majTotaux();
        afficherSucces();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
    injecter();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.TrattoriaLivraison = {
    total: totalCommande,
    frais: frais,
    mode: function () { return MODE; },
    label: labelMode
  };
})();
