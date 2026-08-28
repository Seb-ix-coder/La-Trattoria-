/* ============================================================
   La Trattoria — gestion de la carte : service worker
   Mise en cache de tous les fichiers au premier passage :
   l'application fonctionne ensuite sans aucune connexion,
   comme l'APK. Incrémenter CACHE à chaque nouvelle version.
   ============================================================ */
'use strict';

var CACHE = 'trattoria-carte-v7-logo-officiel';
var FICHIERS = [
  './',
  './index.html',
  './carte.css',
  './ardoise.css',
  './carte.js',
  './donnees.js',
  './donnees-carte.js',
  './ardoise-assets.js',
  './qr-encodeur.js',
  './apercu-carte.html',
  './legal.html',
  './public.html',
  './manifest.webmanifest',
  './icones/icone-180.png',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/icone-512-masquable.png',
  './img/logo-256.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (cles) {
        return Promise.all(cles.map(function (cle) {
          if (cle !== CACHE) return caches.delete(cle);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Cache d'abord, réseau en secours : le réflexe « hors ligne » avant tout.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (enCache) {
      return enCache || fetch(e.request).then(function (reponse) {
        var copie = reponse.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copie); });
        return reponse;
      }).catch(function () {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
