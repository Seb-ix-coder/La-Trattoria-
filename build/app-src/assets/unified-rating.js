/* Notation unifiée : l'autorisation vient toujours du serveur local. */
(function () {
  'use strict';
  var session = '';
  var selected = 0;
  var $ = function (id) { return document.getElementById(id); };
  function msg(text, error) { var zone = $('rating-auth-msg'); if (!zone) return; zone.textContent = text || ''; zone.className = 'lt-status' + (error ? ' error' : ' ok'); }
  function json(path, options) {
    options = options || {}; options.headers = options.headers || {}; options.headers['Content-Type'] = 'application/json';
    if (session) options.headers['X-Session'] = session;
    return fetch(path, options).then(function (r) { return r.json().catch(function () { return { ok: false, erreur: 'Réponse illisible' }; }).then(function (d) { if (!r.ok && !d.erreur) d.erreur = 'La demande n’a pas abouti'; return d; }); });
  }
  function renderStars(n) { var out = ''; for (var i = 1; i <= 5; i++) out += i <= Number(n) ? '★' : '☆'; return out; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function loadRatings() {
    return json('/api/public/ratings').then(function (d) {
      var zone = $('avis-liste'); if (!zone) return; var rows = d.ratings || [];
      if (!rows.length) { zone.innerHTML = '<div class="lt-empty"><strong>Aucun avis vérifié n\'est encore disponible.</strong><br>Les notes publiées seront liées à un achat identifié.</div>'; return; }
      zone.innerHTML = '<div class="carte-bloc"><strong>Moyennes des plats notés</strong>' + rows.map(function (r) { return '<div class="lt-rating-line"><span>' + esc(r.plat_nom || r.plat_id) + '</span><span class="lt-rating-stars" aria-label="' + r.moyenne + ' sur 5">' + renderStars(r.moyenne) + ' <small>(' + r.compteur + ')</small></span></div>'; }).join('') + '</div>';
    }).catch(function () {});
  }
  function auth(mode) {
    var nom = ($('rating-nom').value || '').trim(), tel = ($('rating-tel').value || '').trim(), mdp = $('rating-mdp').value || '';
    if (!tel || mdp.length < 4 || (mode === 'register' && nom.length < 2)) { msg(mode === 'register' ? 'Nom, téléphone et code de 4 caractères minimum requis.' : 'Téléphone et code requis.', true); return; }
    msg('Connexion en cours…', false);
    json('/api/public/auth', { method: 'POST', body: JSON.stringify({ action: mode, nom: nom, tel: tel, mdp: mdp }) }).then(function (d) {
      if (!d.ok) { msg(d.erreur || 'Connexion refusée.', true); return; }
      session = d.session || ''; msg('Compte connecté. Choisissez un plat acheté.', false);
      if ($('rating-form')) $('rating-form').hidden = false;
      $('rating-nom').disabled = $('rating-tel').disabled = $('rating-mdp').disabled = true; loadRatings();
    });
  }
  function choose(n) { selected = Number(n) || 0; Array.prototype.forEach.call(document.querySelectorAll('#rating-stars button'), function (b) { b.classList.toggle('on', Number(b.getAttribute('data-note')) <= selected); }); }
  function sendRating() {
    var sel = $('rating-plat'), plat = sel && sel.options[sel.selectedIndex];
    if (!session) { msg('Connectez-vous avant de noter.', true); return; }
    if (!plat || !plat.value || selected < 1 || selected > 5) { msg('Choisissez un plat et une note de 1 à 5.', true); return; }
    json('/api/public/rating', { method: 'POST', body: JSON.stringify({ plat_id: plat.value, plat_nom: plat.getAttribute('data-nom') || plat.textContent, note: selected, commentaire: ($('rating-commentaire').value || '').trim() }) }).then(function (d) { if (!d.ok) { msg(d.erreur || 'Note refusée.', true); return; } msg(d.modifie ? 'Votre note a été modifiée.' : 'Votre note est publiée après vérification de votre achat.', false); loadRatings(); });
  }
  function init() {
    if ($('rating-inscription')) $('rating-inscription').addEventListener('click', function () { auth('register'); });
    if ($('rating-connexion')) $('rating-connexion').addEventListener('click', function () { auth('login'); });
    if ($('rating-envoyer')) $('rating-envoyer').addEventListener('click', sendRating);
    Array.prototype.forEach.call(document.querySelectorAll('#rating-stars button'), function (b) { b.addEventListener('click', function () { choose(b.getAttribute('data-note')); }); });
    var search = $('fd-recherche-public');
    if (search) search.addEventListener('input', function () { var q = search.value.toLowerCase().trim(), n = 0; Array.prototype.forEach.call(document.querySelectorAll('#produits-publics .plat'), function (p) { var ok = !q || (p.textContent || '').toLowerCase().indexOf(q) >= 0; p.style.display = ok ? '' : 'none'; if (ok) n++; }); var empty = $('aucun-produit'); if (empty) empty.hidden = n !== 0; });
    loadRatings();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
