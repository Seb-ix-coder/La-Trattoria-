/* ============================================================================
   Paiement en ligne Monetico — bouton client La Trattoria
   ============================================================================
   La clé commerçant ne quitte jamais le serveur Monetico gateway. Ce module
   ne fabrique aucun MAC dans le navigateur : il demande au relais HTTPS de
   préparer un formulaire signé, puis le transmet à Monetico.

   Configuration facultative de la page :
     window.TRATTORIA_MONETICO_URL = 'https://paiement.example/prepare';
   À défaut, le module utilise /api/monetico/prepare sur l'origine courante.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var ENDPOINT = (window.TRATTORIA && window.TRATTORIA.moneticoUrl) ||
    window.TRATTORIA_MONETICO_URL || (location.origin + '/api/monetico/prepare');
  var FORM_ID = 'monetico-form-auto';
  var PAYMENT_MARKER = 'monetico';

  function el(id) { return document.getElementById(id); }
  function value(id) {
    var node = el(id);
    return node ? String(node.value || '').trim() : '';
  }
  function selectedPayment() {
    var node = document.querySelector('input[name="pm"]:checked');
    return node ? node.value : '';
  }
  function cart() {
    try {
      if (window.TrattoriaSite && typeof window.TrattoriaSite.panier === 'function') {
        return window.TrattoriaSite.panier() || [];
      }
    } catch (e) { /* état indisponible */ }
    return [];
  }
  function total() {
    try {
      if (window.TrattoriaSite && typeof window.TrattoriaSite.total === 'function') {
        return Number(window.TrattoriaSite.total()) || 0;
      }
    } catch (e) { /* état indisponible */ }
    return cart().reduce(function (s, l) {
      return s + (Number(l.prix) || 0) * (Number(l.qte) || 0);
    }, 0);
  }
  function setMessage(text, error) {
    var zone = el('monetico-message');
    if (!zone) return;
    zone.textContent = text;
    zone.classList.toggle('is-error', !!error);
    zone.classList.toggle('is-ok', !error && !!text);
  }
  function toggle() {
    var box = el('monetico-payer-wrap');
    if (!box) return;
    var actif = selectedPayment() === 'carte';
    box.hidden = !actif;
    if (!actif) setMessage('', false);
  }
  function formHidden(form, name, value) {
    var input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value == null ? '' : String(value);
    form.appendChild(input);
  }
  function submitMonetico(fields, action) {
    var old = el(FORM_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var form = document.createElement('form');
    form.id = FORM_ID; form.method = 'post'; form.action = action;
    form.target = '_top'; form.style.display = 'none';
    Object.keys(fields || {}).forEach(function (key) { formHidden(form, key, fields[key]); });
    document.body.appendChild(form);
    form.submit();
  }
  function prepare() {
    var lignes = cart();
    var nom = value('cl-nom');
    var tel = value('cl-tel');
    var email = value('monetico-email');
    var creneau = (document.querySelector('[data-creneau][aria-pressed="true"]') || {}).dataset;
    var note = value('cl-note');
    if (!lignes.length) { setMessage('Votre panier est vide.', true); return; }
    if (!nom || !tel) { setMessage('Indiquez votre nom et votre téléphone avant de payer.', true); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Indiquez une adresse e-mail valide pour recevoir le reçu.', true); return;
    }
    if (!creneau || !creneau.creneau) { setMessage('Choisissez d’abord un créneau de retrait.', true); return; }
    var button = el('monetico-payer');
    if (button) { button.disabled = true; button.classList.add('is-loading'); }
    setMessage('Préparation sécurisée du paiement…', false);
    var payload = {
      nom: nom, tel: tel, email: email, creneau: creneau.creneau,
      note: note, lignes: lignes, total: Number(total().toFixed(2)),
      source: 'site-la-trattoria'
    };
    var xhr = new XMLHttpRequest();
    xhr.open('POST', ENDPOINT, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 15000;
    xhr.onload = function () {
      var response = {};
      try { response = JSON.parse(xhr.responseText || '{}'); } catch (e) { }
      if (xhr.status >= 200 && xhr.status < 300 && response.ok && response.form) {
        submitMonetico(response.form, response.action);
        return;
      }
      var msg = response.error || response.erreur || 'Le paiement en ligne est momentanément indisponible.';
      setMessage(msg, true);
      if (button) { button.disabled = false; button.classList.remove('is-loading'); }
    };
    xhr.onerror = xhr.ontimeout = function () {
      setMessage('Connexion au paiement impossible. Vous pouvez choisir le règlement au retrait.', true);
      if (button) { button.disabled = false; button.classList.remove('is-loading'); }
    };
    xhr.send(JSON.stringify(payload));
  }
  function install() {
    if (el('monetico-payer-wrap')) return;
    var payment = el('paiement-bloc');
    if (!payment) return;
    var wrap = document.createElement('div');
    wrap.id = 'monetico-payer-wrap';
    wrap.className = 'monetico-payer-wrap';
    wrap.hidden = selectedPayment() !== 'carte';
    wrap.innerHTML =
      '<div class="monetico-head"><span class="monetico-lock">▣</span>' +
      '<div><strong>Paiement sécurisé par carte</strong>' +
      '<small>Vous serez redirigé vers Monetico Paiement</small></div></div>' +
      '<label class="monetico-email-label" for="monetico-email">E-mail pour le reçu</label>' +
      '<input id="monetico-email" class="monetico-email" type="email" inputmode="email" ' +
      'autocomplete="email" maxlength="255" placeholder="vous@exemple.fr">' +
      '<button type="button" id="monetico-payer" class="monetico-payer">' +
      'Continuer vers le paiement <span aria-hidden="true">→</span></button>' +
      '<p id="monetico-message" class="monetico-message" role="status" aria-live="polite"></p>';
    payment.appendChild(wrap);
    el('monetico-payer').addEventListener('click', prepare);
    document.addEventListener('change', function (event) {
      if (event.target && event.target.name === 'pm') toggle();
    });
  }
  function start() {
    install();
    if (el('paiement-bloc')) return;
    var observer = new MutationObserver(function () {
      install();
      if (el('paiement-bloc')) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
