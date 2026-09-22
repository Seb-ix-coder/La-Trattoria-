/* La Trattoria — client d'adresses API partagé par l'administration et les pages publiques. */
(function (global) {
  'use strict';
  var CLE = 'trattoria.sync_base.v1';

  function normaliser(value) {
    var raw = String(value || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return '';
    return raw.replace(/\/+$/, '');
  }
  function memorise(value) {
    var base = normaliser(value);
    try {
      if (base) localStorage.setItem(CLE, base);
      else localStorage.removeItem(CLE);
    } catch (e) { }
    return base;
  }
  function memorisee() {
    try { return normaliser(localStorage.getItem(CLE) || ''); } catch (e) { return ''; }
  }
  function origine() {
    return location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : '';
  }
  function base(value) {
    // Une page publique servie par le serveur courant doit rester liée à cette
    // origine ; la base mémorisée ne sert que de repli pour une page locale.
    return normaliser(value) || origine() || memorisee();
  }
  function url(route, override) {
    var racine = base(override);
    return racine ? racine + '/api/' + String(route || '').replace(/^\/+/, '') : '';
  }

  global.TrattoriaApi = {
    normaliser: normaliser,
    base: base,
    url: url,
    setBase: memorise
  };
}(window));
