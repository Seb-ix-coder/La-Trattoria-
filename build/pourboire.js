/* ============================================================================
   Addon « Pourboire numérique » — ajout durci 11.2 (injecté dans site.js)
   ============================================================================
   Permet au client de laisser un pourboire à l'équipe au moment de sa
   commande en ligne (le paiement reste sur place au retrait, conformément
   aux CGV du site — "rien n'est payé en ligne").

   Fonctionnement :
   * un bloc « Pourboire pour l'équipe » apparaît dans le récapitulatif de
     la commande (tiroir) : 0 € / 1 € / 2 € / 5 € / montant libre (0-50 €),
   * le montant choisi est affiché sous le total ("dont pourboire : X €"),
   * au moment de valider, le pourboire est ajouté à la NOTE de la commande
     ("Pourboire : X €") : le personnel le voit sur l'écran des commandes
     de l'application et l'encaisse au retrait avec le reste,
   * le total affiché au client pendant sa commande inclut le pourboire.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var POURBOIRE = 0;          // montant en euros (0 = aucun)
  var MAX = 50;               // plafond de sécurité
  var PRESETS = [1, 2, 5];

  // ------------------------------------------------------------------
  //  Formatage monétaire à la française (indépendant de site.js)
  // ------------------------------------------------------------------
  function pbFmt(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2).replace('.', ',');
  }

  // ------------------------------------------------------------------
  //  Ajout / mise à jour du pourboire dans la note de la commande
  // ------------------------------------------------------------------
  // Le serveur stocke la note (≤ 400 caractères) et l'écran des commandes
  // l'affiche : le personnel voit « Pourboire : X € » et l'encaisse au
  // retrait. La fonction est idempotente (pas de doublon si on valide
  // plusieurs fois, pas de résidu si on change le montant).
  function setNotePourboire() {
    var note = document.getElementById('cl-note');
    if (!note) return;
    var v = note.value || '';
    v = v.replace(/(\s*\|\s*)?Pourboire : [0-9]+(,[0-9]+)? €/g, '');
    if (POURBOIRE > 0) {
      var s = v.trim();
      v = s ? s + ' | Pourboire : ' + pbFmt(POURBOIRE) + ' €'
            : 'Pourboire : ' + pbFmt(POURBOIRE) + ' €';
    }
    note.value = v.trim();
  }

  // ------------------------------------------------------------------
  //  Rendu (boutons, état sélectionné, ligne « dont pourboire »)
  // ------------------------------------------------------------------
  function majAffichage() {
    var tot = document.getElementById('pourboire-total');
    if (tot) {
      tot.textContent = POURBOIRE > 0
        ? 'Pourboire : ' + pbFmt(POURBOIRE) + ' € — réglé au retrait avec votre commande.'
        : '';
    }
    var btns = document.querySelectorAll('#pourboire-bloc .pb-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var actif;
      if (b.dataset.tip === 'libre') {
        actif = POURBOIRE > 0 && PRESETS.indexOf(POURBOIRE) === -1;
      } else {
        actif = Number(b.dataset.tip) === POURBOIRE;
      }
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
      b.classList.toggle('sel', actif);
    }
    var libre = document.getElementById('pourboire-libre');
    if (libre) {
      libre.style.display = (POURBOIRE > 0 && PRESETS.indexOf(POURBOIRE) === -1)
        ? 'block' : 'none';
    }
    // ligne « dont pourboire » sous le total du panier
    var ligne = document.getElementById('pourboire-dont');
    if (ligne) {
      ligne.style.display = POURBOIRE > 0 ? '' : 'none';
      if (POURBOIRE > 0) {
        ligne.textContent = 'dont pourboire : ' + pbFmt(POURBOIRE) + ' €';
      }
    }
  }

  // ------------------------------------------------------------------
  //  Construction du bloc dans le tiroir de commande
  // ------------------------------------------------------------------
  function initPourboire() {
    var pied = document.getElementById('panier-pied');
    var ref = document.querySelector('#panier-pied .mention-tva');
    if (!pied || !ref) return;

    // ligne « dont pourboire » juste sous le total
    var totalDiv = document.querySelector('#panier-pied .total');
    if (totalDiv) {
      var ligne = document.createElement('p');
      ligne.id = 'pourboire-dont';
      ligne.className = 'pourboire-dont';
      ligne.style.display = 'none';
      totalDiv.parentNode.insertBefore(ligne, totalDiv.nextSibling);
    }

    // bloc principal
    var bloc = document.createElement('div');
    bloc.className = 'pourboire';
    bloc.id = 'pourboire-bloc';
    bloc.innerHTML =
      '<p class="pourboire-titre">Pourboire pour l\'équipe ' +
      '<span>(réglé au retrait)</span></p>' +
      '<div class="pourboire-options" role="group" aria-label="Montant du pourboire">' +
      '<button type="button" class="pb-btn" data-tip="0" aria-pressed="true">0&nbsp;€</button>' +
      '<button type="button" class="pb-btn" data-tip="1" aria-pressed="false">1&nbsp;€</button>' +
      '<button type="button" class="pb-btn" data-tip="2" aria-pressed="false">2&nbsp;€</button>' +
      '<button type="button" class="pb-btn" data-tip="5" aria-pressed="false">5&nbsp;€</button>' +
      '<button type="button" class="pb-btn" data-tip="libre" aria-pressed="false">Autre</button>' +
      '</div>' +
      '<div class="pourboire-libre" id="pourboire-libre" style="display:none">' +
      '<label for="pb-montant">Montant (€)</label>' +
      '<input id="pb-montant" type="number" min="0" max="' + MAX +
      '" step="0.5" inputmode="decimal" placeholder="Ex. 3,50">' +
      '</div>' +
      '<p class="pourboire-total" id="pourboire-total" role="status"></p>';
    ref.parentNode.insertBefore(bloc, ref.nextSibling);

    // sélection des boutons
    bloc.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.pb-btn') : null;
      if (!b) return;
      if (b.dataset.tip === 'libre') {
        POURBOIRE = 0;
        var champ = document.getElementById('pb-montant');
        var libreBox = document.getElementById('pourboire-libre');
        if (libreBox) libreBox.style.display = 'block';
        if (champ) champ.focus();
        majAffichage();
        return;
      }
      POURBOIRE = Number(b.dataset.tip) || 0;
      majAffichage();
    });

    // montant libre
    var champ = document.getElementById('pb-montant');
    if (champ) {
      champ.addEventListener('input', function () {
        var v = parseFloat((champ.value || '').replace(',', '.'));
        if (!isFinite(v) || v < 0) v = 0;
        if (v > MAX) v = MAX;
        POURBOIRE = Math.round(v * 100) / 100;
        majAffichage();
      });
    }

    // AVANT l'envoi de la commande : injecte le pourboire dans la note.
    // On écoute en phase de CAPTURE (s'exécute avant le gestionnaire
    // d'origine du bouton « Envoyer ma commande »).
    document.addEventListener('click', function (e) {
      var t = e.target;
      var v = t && t.closest ? t.closest('#valider') : null;
      if (v) setNotePourboire();
    }, true);

    majAffichage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPourboire);
  } else {
    initPourboire();
  }
})();
