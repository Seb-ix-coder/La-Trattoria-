/* ============================================================================
   Addon « Modes App : Client & Partenaire » (site.js)
   ============================================================================
   Deux modes « application » accessibles par l'URL servie par la tablette :

     http://<tablette>:8720/?client       -> App CLIENT
        Affichage limité à : le menu, les cartes spéciales du jour et les
        fonctionnalités sociales (avis, réseaux, appeler). La commande en
        ligne, la réservation et les outils de gestion sont masqués.

     http://<tablette>:8720/?partenaire   -> App PARTENAIRE
        Comme le client + un « Espace Partenaires » : formulaire de message
        transmis au restaurant (route locale POST /partenaire, visible dans
        la Messagerie de l'application), coordonnées et programme.

   Le client « installe » l'app via son navigateur (Ajouter à l'écran
   d'accueil) : le QR code affiché en salle pointe vers ces URL.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var MODE = null;
  var TEL = '0627213190';               // réservations (sans espaces)
  var TEL_AF = '+33 6 27 21 31 90';

  function detecterMode() {
    var q = (location.search || '') + '&' + (location.hash || '').replace('#', '&');
    if (q.indexOf('partenaire') >= 0) return 'partenaire';
    if (q.indexOf('client') >= 0) return 'client';
    return null;
  }

  // ------------------------------------------------------------------
  //  Masquage des fonctionnalités non souhaitées en mode app
  // ------------------------------------------------------------------
  function appliquerModeApp() {
    document.body.classList.add('mode-app');

    // commande en ligne (panier flottant, tiroir, boutons d'ajout)
    var panier = document.getElementById('panier-flot');
    if (panier) panier.style.display = 'none';
    var tiroir = document.getElementById('tiroir');
    if (tiroir) tiroir.style.display = 'none';
    var ajouts = document.querySelectorAll('[data-ajout]');
    for (var i = 0; i < ajouts.length; i++) {
      ajouts[i].style.display = 'none';
    }
    // boutons "ajouter" du panier déjà ouverts éventuels
    var ajouterBtns = document.querySelectorAll('.ajout');
    for (var j = 0; j < ajouterBtns.length; j++) ajouterBtns[j].style.display = 'none';

    // réservation en ligne
    var reserver = document.getElementById('reserver');
    if (reserver) reserver.style.display = 'none';

    // outils de gestion + QR (réservés au personnel)
    var outils = document.getElementById('btn-outils');
    if (outils) outils.style.display = 'none';
    var qr = document.getElementById('btn-qr');
    if (qr) qr.style.display = 'none';

    // mention « commande à emporter » éventuelle dans le titre de la carte
    var carteTitre = document.querySelector('#carte .titre-sec p');
    if (carteTitre) carteTitre.style.display = 'none';

    // barre sociale rapide (appeler + avis) sous le hero
    if (!document.getElementById('barre-sociale')) {
      var hero = document.querySelector('.hero .in');
      if (hero) {
        var barre = document.createElement('div');
        barre.id = 'barre-sociale';
        barre.className = 'barre-sociale';
        barre.innerHTML =
          '<a class="bs-btn bs-tel" href="tel:' + TEL + '">📞 Appeler</a>' +
          '<a class="bs-btn" target="_blank" rel="noopener noreferrer" ' +
          'href="https://www.google.com/search?q=La+Trattoria+Saintes">⭐ Avis Google</a>' +
          '<a class="bs-btn" target="_blank" rel="noopener noreferrer" ' +
          'href="https://www.facebook.com/search/top?q=La+Trattoria+Saintes">👍 Facebook</a>' +
          '<a class="bs-btn" target="_blank" rel="noopener noreferrer" ' +
          'href="https://www.tripadvisor.fr/Search?q=La+Trattoria+Saintes">🧭 Tripadvisor</a>';
        hero.appendChild(barre);
      }
    }

    // raccourci "réserver par téléphone" sous le menu (remplace la résa web)
    if (!document.getElementById('reserver-tel')) {
      var carte = document.getElementById('carte');
      if (carte) {
        var telBloc = document.createElement('p');
        telBloc.id = 'reserver-tel';
        telBloc.className = 'reserver-tel';
        telBloc.innerHTML = '📞 Pour réserver une table : <a href="tel:' + TEL + '">' +
          TEL_AF + '</a> — dites-nous simplement quand vous venez !';
        carte.appendChild(telBloc);
      }
    }
  }

  // ------------------------------------------------------------------
  //  Espace Partenaires (mode partenaire)
  // ------------------------------------------------------------------
  function sectionPartenaires() {
    if (document.getElementById('partenaires')) return;
    var section = document.createElement('section');
    section.id = 'partenaires';
    section.className = 'alt';
    section.innerHTML =
      '<div class="conteneur" style="max-width:620px">' +
      '<div class="titre-sec"><h2>Espace Partenaires</h2>' +
      '<p>Établissements amis, ce coin est pour vous</p></div><div class="sep"></div>' +
      '<div class="carte-bloc" style="margin-bottom:14px">' +
      '<h3>La Trattoria — coordonnées</h3>' +
      '<p>Rue de la Liste, 17100 SAINTES<br>Réservations : <a href="tel:' + TEL + '">' +
      TEL_AF + '</a><br>Patron : Alex</p>' +
      '</div>' +
      '<div class="carte-bloc">' +
      '<h3>Envoyer un message au restaurant</h3>' +
      '<p class="aide">Sur le réseau du restaurant, votre message arrive ' +
      'directement dans la Messagerie de l\'application (onglet Partenaires).</p>' +
      '<label for="pt-nom">Votre établissement</label>' +
      '<input id="pt-nom" type="text" placeholder="Ex. Hôtel du Parc" maxlength="60">' +
      '<label for="pt-texte">Message</label>' +
      '<textarea id="pt-texte" rows="3" maxlength="500" placeholder="Bonjour, pour une commande groupée…"></textarea>' +
      '<button type="button" class="btn btn-p btn-bloc" id="pt-envoyer" style="margin-top:12px">' +
      'Envoyer le message</button>' +
      '<p id="pt-msg" role="status" aria-live="polite"></p>' +
      '</div>' +
      '<p class="aide" style="margin-top:14px">Hors du réseau, appelez-nous : nous ' +
      'organisons les commandes partenaires par téléphone.</p>' +
      '</div></section>';
    var pied = document.querySelector('footer');
    if (pied && pied.parentNode) {
      pied.parentNode.insertBefore(section, pied);
    } else {
      document.body.appendChild(section);
    }

    var envoyer = document.getElementById('pt-envoyer');
    if (envoyer) {
      envoyer.addEventListener('click', function () {
        var nom = (document.getElementById('pt-nom').value || '').trim();
        var texte = (document.getElementById('pt-texte').value || '').trim();
        var zone = document.getElementById('pt-msg');
        if (!nom || !texte) {
          zone.innerHTML = '<p class="err">Précisez votre établissement et votre message.</p>';
          return;
        }
        zone.innerHTML = '<p class="aide">Envoi…</p>';
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/partenaire', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 8000;
        xhr.onload = function () {
          try {
            var r = JSON.parse(xhr.responseText);
            if (r && r.ok) {
              zone.innerHTML = '<p style="color:var(--vert)">✅ Message envoyé au restaurant !</p>';
              document.getElementById('pt-texte').value = '';
            } else {
              zone.innerHTML = '<p class="err">Le restaurant n\'a pas accusé réception.</p>';
            }
          } catch (e) {
            zone.innerHTML = '<p class="err">Réponse illisible.</p>';
          }
        };
        xhr.onerror = xhr.ontimeout = function () {
          zone.innerHTML = '<p class="err">Restaurant injoignable (hors réseau ?). ' +
            'Appelez le ' + TEL_AF + '.</p>';
        };
        xhr.send(JSON.stringify({ type: 'message', de: nom, texte: texte }));
      });
    }
  }

  // ------------------------------------------------------------------
  //  Init
  // ------------------------------------------------------------------
  function init() {
    MODE = detecterMode();
    if (!MODE) return;
    document.body.classList.add('mode-' + MODE);
    appliquerModeApp();
    if (MODE === 'partenaire') sectionPartenaires();
    // remonte en haut de page
    window.scrollTo(0, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
