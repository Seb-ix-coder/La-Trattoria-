#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch carte.js : édition de TOUTES les cartes dans l'onglet « La carte »."""
import sys

CHEMIN = 'carte/carte.js'
src = open(CHEMIN, encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom):
    if s.count(vieux) != 1:
        print('ECHEC %s' % nom)
        print(repr(vieux[:200]))
        sys.exit(1)
    return s.replace(vieux, neuf, 1)

# ---- 1. états ----
src = remplacer(src,
"  var CPT_CRAIE = 0;          // alternance des couleurs de craie",
"""  var CPT_CRAIE = 0;          // alternance des couleurs de craie
  var CARTE_VIEW = 'standard'; // vue de l'onglet « La carte » : standard | formules | vins | glaces | bieres
  var LF_A_EDITER = null;     // {fam, id} : ligne libre (catégorie) à éditer après rendu""",
'etats')

# ---- 2. dessinerCF : ouverture différée conditionnée à l'écran ----
src = remplacer(src,
"""    hote.innerHTML = h;
    dessinerCFExtras();
    if (LIGNE_A_EDITER) {
      var liE = hote.querySelector('li[data-cf-id="' + LIGNE_A_EDITER + '"]');
      var cardE = liE && liE.closest('.cf-fam');
      if (liE && cardE) editerLigneLibre(cardE, LIGNE_A_EDITER);
      LIGNE_A_EDITER = null;
    }
  }""",
"""    hote.innerHTML = h;
    dessinerCFExtras();
    if (LIGNE_A_EDITER && ECRAN === 'ardoise') ouvrirEditeurDiffere(hote);
  }

  // Ouvre l'éditeur de la ligne libre posée dans LIGNE_A_EDITER (et consomme).
  function ouvrirEditeurDiffere(hote) {
    if (!LIGNE_A_EDITER || !hote) return;
    var liE = hote.querySelector('li[data-cf-id="' + LIGNE_A_EDITER + '"]');
    var cardE = liE && liE.closest('.cf-fam');
    if (liE && cardE) editerLigneLibre(cardE, LIGNE_A_EDITER);
    LIGNE_A_EDITER = null;
  }""", 'dessinerCF differe')

# ---- 3. dessinerCFExtras : réutilise cfExtrasCardHTML ----
old_dce = src[src.index('  function dessinerCFExtras() {'):]
fin = old_dce.index('\n  }\n') + 4
old_dce = old_dce[:fin]
new_dce = """  function dessinerCFExtras() {
    var hote = $('#liste-cf');
    if (!hote || !CF) return;
    EXTRA_ORDRE.forEach(function (cle) {
      var conf = CF.extras[cle];
      if (!conf) return;
      var carte = document.createElement('div');
      carte.className = 'cf-fam cf-extras carte-bloc';
      carte.setAttribute('data-ex', cle);
      carte.innerHTML = cfExtrasCardHTML(cle);
      hote.appendChild(carte);
    });
  }
"""
src = remplacer(src, old_dce, new_dce, 'dessinerCFExtras refactor')

# ---- 4. cfExtrasCardHTML : markup partagé (inséré avant dessinerCFExtras) ----
src = remplacer(src,
"  function dessinerCFExtras() {",
"""  // Markup de la carte éditeur d'une carte additionnelle (partagé entre
  // l'écran « Ardoise & QR » et l'onglet « La carte »).
  function cfExtrasCardHTML(cle) {
    var conf = CF.extras[cle];
    var items = itemsExtra(cle);
    var html = '<div class="cf-tete">' +
      '<div><b>🧾 ' + echap(conf.titre) + '</b>' +
      '<span class="cf-meta">carte dédiée · ' + items.length + ' ligne' +
      (items.length > 1 ? 's' : '') +
      ' · ' + echap(cle) + '</span></div>' +
      '<span class="cf-actions">' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="titre">✏️ Titre &amp; sous-titre</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="produit">＋ Produit du catalogue</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="ligne">+ ' +
          (cle === 'formules' ? 'Nouvelle formule' : 'Ligne libre') + '</button>' +
      '</span>' +
      '</div>' +
      '<div class="cf-edition-titre" hidden>' +
        '<label class="champ"><span>Titre affiché</span>' +
        '<input type="text" data-cf-champ="titre" maxlength="60" value="' + echap(conf.titre) + '"></label>' +
        '<label class="champ"><span>Sous-titre de la carte</span>' +
        '<input type="text" data-cf-champ="sous" maxlength="120" value="' + echap(conf.sous) + '"></label>' +
        '<div class="cf-rangee"><button type="button" class="btn btn-p btn-mini" data-cf="titre-ok">Enregistrer</button>' +
        '<button type="button" class="btn btn-s btn-mini" data-cf="titre-annule">Annuler</button></div>' +
      '</div>' +
      '<ol class="cf-lignes">';
    items.forEach(function (it, i) {
      var premier = i === 0, dernier = i === items.length - 1;
      if (it.kind === 'p') {
        var p = it.p;
        html += '<li class="cf-ligne' + (p.actif ? '' : ' cf-inactif') + '" data-cf-id="' + echap(p.id) + '">' +
          '<span class="cf-ordre">' +
            '<button type="button" class="btn btn-mini" data-cf="monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="btn btn-mini" data-cf="descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
          '</span>' +
          '<span class="cf-nom">' + echap(p.nom) +
            '<small>' + echap(p.fam) + (p.cat ? ' · ' + echap(p.cat) : '') + '</small>' +
            (!p.actif ? '<small class="cf-off">masqué de la carte</small>' : '') +
          '</span>' +
          '<span class="cf-prix">' + eur(prixAffiche(p)) + '</span>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-mini" data-cf="editer" title="Modifier le produit">✏️</button>' +
          '</span></li>';
      } else {
        var l = it.l;
        html += '<li class="cf-ligne cf-libre" data-cf-id="' + echap(l.id) + '">' +
          '<span class="cf-ordre">' +
            '<button type="button" class="btn btn-mini" data-cf="monter"' + (premier ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="btn btn-mini" data-cf="descendre"' + (dernier ? ' disabled' : '') + '>▼</button>' +
          '</span>' +
          '<span class="cf-nom">' + echap(l.nom) +
            '<small class="cf-badge">' + echap(libelleExtra(cle)) + '</small>' +
            (l.sous ? '<small>' + echap(l.sous) + '</small>' : '') +
          '</span>' +
          '<span class="cf-prix">' + (l.prix > 0 ? eur(l.prix) : '—') + '</span>' +
          '<span class="cf-actions">' +
            '<button type="button" class="btn btn-mini" data-cf="libre-editer">✏️</button>' +
            '<button type="button" class="btn btn-mini" data-cf="libre-supprimer">✕</button>' +
          '</span></li>';
      }
    });
    html += '</ol>';
    return html;
  }

  function dessinerCFExtras() {""", 'cfExtrasCardHTML')

# ---- 5. dessinerCarte : dispatch + vue standard enrichie + vue extra ----
old_dc = """  function dessinerCarte() {
    var liste = produitsFiltres();
    $('#nb-visibles').textContent = liste.length + (liste.length > 1 ? ' produits' : ' produit');

    var parFam = {};
    var ordre = [];
    CARTE.forEach(function (p) {                       // l'ordre des familles suit la carte
      if (!parFam[p.fam]) { parFam[p.fam] = []; ordre.push(p.fam); }
    });
    liste.forEach(function (p) { if (parFam[p.fam]) parFam[p.fam].push(p); });

    var h = '';
    ordre.forEach(function (fam) {
      var ps = parFam[fam];
      if (!ps.length) return;
      h += '<section class="famille"><h2>' + echap(fam) +
        ' <span class="nb">' + ps.length + '</span></h2>' +
        '<div class="grille">' + ps.map(carteProduitHTML).join('') + '</div></section>';
    });
    $('#liste-produits').innerHTML = h ||
      '<p class="aide" style="text-align:center;padding:40px 0">Aucun produit ne correspond. ' +
      'Ajoutez-en un avec le bouton « + Ajouter ».</p>';
  }"""
new_dc = """  function dessinerCarte() {
    if (CARTE_VIEW !== 'standard') { dessinerVueExtra(CARTE_VIEW); return; }
    $('#outils-standard').hidden = false;
    var liste = produitsFiltres();
    $('#nb-visibles').textContent = liste.length + (liste.length > 1 ? ' produits' : ' produit');

    var parFam = {};
    var ordre = [];
    CARTE.forEach(function (p) {                       // l'ordre des familles suit la carte
      if (!parFam[p.fam]) { parFam[p.fam] = []; ordre.push(p.fam); }
    });
    liste.forEach(function (p) { if (parFam[p.fam]) parFam[p.fam].push(p); });

    var h = '';
    ordre.forEach(function (fam) {
      var ps = parFam[fam];
      if (!ps.length) return;
      var confF = CF ? CF.fams[fam] : null;
      var libres = confF ? confF.libres : [];
      h += '<section class="famille" data-fam="' + echap(fam) + '">' +
        '<div class="fam-tete"><h2>' + echap(fam) +
        ' <span class="nb">' + ps.length + '</span></h2>' +
        '<span class="fam-actions">' +
          '<button type="button" class="btn btn-s btn-mini" data-fam-edit="1">✏️ Titre ardoise</button>' +
          '<button type="button" class="btn btn-s btn-mini" data-fam-ligne="1">+ Ligne libre</button>' +
        '</span></div>' +
        (confF && (confF.titre !== fam || confF.sous)
          ? '<p class="fam-ardoise">📋 Ardoise : <b>' + echap(confF.titre) + '</b>' +
            (confF.sous ? ' — <i>' + echap(confF.sous) + '</i>' : '') + '</p>'
          : '') +
        '<div class="fam-edit" hidden>' +
          '<label class="champ"><span>Titre affiché sur l\\'ardoise</span>' +
          '<input type="text" data-fe="titre" maxlength="60" value="' + echap(confF ? confF.titre : fam) + '"></label>' +
          '<label class="champ"><span>Sous-titre de la catégorie</span>' +
          '<input type="text" data-fe="sous" maxlength="120" value="' + echap(confF ? confF.sous : '') + '"></label>' +
          '<div class="cf-rangee">' +
            '<button type="button" class="btn btn-p btn-mini" data-fam-ok="1">Enregistrer</button>' +
            '<button type="button" class="btn btn-s btn-mini" data-fam-annule="1">Annuler</button>' +
          '</div>' +
        '</div>';
      if (libres.length) {
        h += '<div class="fam-libres"><span class="t">Lignes libres (ardoise) :</span>' +
          libres.map(function (l) {
            var edit = LF_A_EDITER && LF_A_EDITER.fam === fam && LF_A_EDITER.id === l.id;
            return '<span class="lf-chip">' + echap(l.nom) +
              (l.prix > 0 ? ' · <b>' + eur(l.prix) + '</b>' : '') +
              ' <button type="button" class="btn btn-mini" data-lf-edit="' + echap(l.id) + '" title="Modifier">✏️</button>' +
              ' <button type="button" class="btn btn-mini" data-lf-del="' + echap(l.id) + '" title="Supprimer">✕</button>' +
              (edit ? '</span><div class="lf-form">' +
                '<input type="text" data-lf-champ="nom" maxlength="60" value="' + echap(l.nom) + '" placeholder="Nom (ex. : Menu enfant)">' +
                '<input type="text" data-lf-champ="sous" maxlength="90" value="' + echap(l.sous) + '" placeholder="Sous-titre (facultatif)">' +
                '<input type="text" data-lf-champ="prix" inputmode="decimal" value="' +
                  (l.prix > 0 ? String(l.prix).replace('.', ',') : '') + '" placeholder="Prix €">' +
                '<div class="cf-rangee">' +
                  '<button type="button" class="btn btn-p btn-mini" data-lf-ok="' + echap(l.id) + '">OK</button>' +
                  '<button type="button" class="btn btn-s btn-mini" data-lf-annule="1">Annuler</button>' +
                '</div></div>'
              : '') +
              '</span>';
          }).join('') + '</div>';
      }
      h += '<div class="grille">' + ps.map(carteProduitHTML).join('') + '</div></section>';
    });
    $('#liste-produits').innerHTML = h ||
      '<p class="aide" style="text-align:center;padding:40px 0">Aucun produit ne correspond. ' +
      'Ajoutez-en un avec le bouton « + Ajouter ».</p>';
  }

  // Vue d'une carte dédiée (formules, vins, glaces, bières) dans l'onglet.
  function dessinerVueExtra(cle) {
    var conf = CF.extras[cle];
    if (!conf) return;
    $('#outils-standard').hidden = true;
    var items = itemsExtra(cle);
    $('#nb-visibles').textContent = items.length + (items.length > 1 ? ' lignes' : ' ligne');
    var h = '<p class="note-vue">Éditez « <b>' + echap(conf.titre) + '</b> » : titre &amp; sous-titre, ' +
      'ordre ▲▼, lignes libres et produits du catalogue. Ces lignes apparaissent sur ' +
      'l\\'ardoise et sur le site (apercu-carte.html).</p>' +
      '<div class="cf-fam cf-extras carte-bloc" data-ex="' + echap(cle) + '">' +
      cfExtrasCardHTML(cle) + '</div>';
    $('#liste-produits').innerHTML = h;
    if (LIGNE_A_EDITER) ouvrirEditeurDiffere($('#liste-produits'));
  }"""
src = remplacer(src, old_dc, new_dc, 'dessinerCarte dispatch')

# ---- 6. clicCarteStandard + wire dans la chaîne de clics ----
src = remplacer(src,
"""      if (clicArdoise(t)) return;
""",
"""      if (clicArdoise(t)) return;
      if (clicCarteStandard(t)) return;
""", 'wire clicCarteStandard')

src = remplacer(src,
"  function dessinerQR() {",
"""  // Clics de l'onglet « La carte » : vues + édition en place.
  function clicCarteStandard(t) {
    if (ECRAN !== 'carte') return false;
    var cv = t.closest('.cv[data-cv]');
    if (cv) {
      CARTE_VIEW = cv.dataset.cv;
      $$('.cv').forEach(function (b) {
        var on = b === cv;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      dessinerCarte();
      return true;
    }
    var section = t.closest('.famille[data-fam]');
    if (!section) return false;
    var fam = section.dataset.fam;
    var confF = CF && CF.fams[fam];
    if (!confF) return false;
    if (t.closest('[data-fam-edit]')) {
      var zone = $('.fam-edit', section);
      if (zone) { zone.hidden = false; $('input[data-fe="titre"]', zone).focus(); }
      return true;
    }
    if (t.closest('[data-fam-annule]')) {
      var zone2 = $('.fam-edit', section);
      if (zone2) zone2.hidden = true;
      return true;
    }
    if (t.closest('[data-fam-ok]')) {
      confF.titre = String($('[data-fe="titre"]', section).value || '').trim().slice(0, 60) || fam;
      confF.sous = String($('[data-fe="sous"]', section).value || '').trim().slice(0, 120);
      sauver(); dessinerCF(); dessinerCarte();
      toast('Catégorie mise à jour : ' + confF.titre);
      return true;
    }
    if (t.closest('[data-fam-ligne]')) {
      if (confF.libres.length >= 30) { toast('Maximum 30 lignes libres par catégorie'); return true; }
      var ln = { id: 'l' + Date.now().toString(36), nom: 'Nouvelle ligne', sous: '', desc: '', prix: 0 };
      confF.libres.push(ln);
      confF.ordre.push(ln.id);
      LF_A_EDITER = { fam: fam, id: ln.id };
      sauver(); dessinerCF(); dessinerCarte();
      return true;
    }
    var lfEdit = t.closest('[data-lf-edit]');
    if (lfEdit) {
      LF_A_EDITER = { fam: fam, id: lfEdit.getAttribute('data-lf-edit') };
      dessinerCarte();
      return true;
    }
    if (t.closest('[data-lf-annule]')) { LF_A_EDITER = null; dessinerCarte(); return true; }
    var lfOk = t.closest('[data-lf-ok]');
    if (lfOk) {
      var idOk = lfOk.getAttribute('data-lf-ok');
      var lOk = confF.libres.filter(function (x) { return x.id === idOk; })[0];
      if (lOk) {
        var nomOk = String($('[data-lf-champ="nom"]', section).value || '').trim();
        if (!nomOk) { toast('Le nom de la ligne est obligatoire'); return true; }
        lOk.nom = nomOk.slice(0, 60);
        lOk.sous = String($('[data-lf-champ="sous"]', section).value || '').trim().slice(0, 90);
        lOk.prix = Math.max(0, Math.round(
          (parseFloat(String($('[data-lf-champ="prix"]', section).value).replace(',', '.')) || 0) * 100) / 100);
        LF_A_EDITER = null;
        sauver(); dessinerCF(); dessinerCarte();
        toast('Ligne enregistrée');
      }
      return true;
    }
    var lfDel = t.closest('[data-lf-del]');
    if (lfDel) {
      var idDel = lfDel.getAttribute('data-lf-del');
      var lDel = confF.libres.filter(function (x) { return x.id === idDel; })[0];
      if (lDel && confirm('Supprimer la ligne libre « ' + lDel.nom + ' » ?')) {
        confF.libres = confF.libres.filter(function (x) { return x.id !== idDel; });
        confF.ordre = confF.ordre.filter(function (x) { return x !== idDel; });
        sauver(); dessinerCF(); dessinerCarte();
        toast('Ligne supprimée');
      }
      return true;
    }
    return false;
  }

  function dessinerQR() {""", 'clicCarteStandard def')

# ---- 7. redraws : les fonctions partagées rafraîchissent aussi l'onglet carte ----
for nom, vieux, neuf in [
  ('enregistrerTitreFamille redraw',
   """    sauver();
    dessinerCF();
    toast('Catégorie mise à jour : ' + conf.titre);""",
   """    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
    toast('Catégorie mise à jour : ' + conf.titre);"""),
  ('deplacerLigneCF redraw',
   """    var tmp = ordre[i]; ordre[i] = ordre[j]; ordre[j] = tmp;
    sauver();
    dessinerCF();
  }""",
   """    var tmp = ordre[i]; ordre[i] = ordre[j]; ordre[j] = tmp;
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
  }"""),
  ('ajouterLigneLibre redraw',
   """    LIGNE_A_EDITER = l.id;
    sauver();
    dessinerCF();
  }""",
   """    LIGNE_A_EDITER = l.id;
    LF_A_EDITER = null;
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
  }"""),
  ('enregistrerLigneLibre redraw',
   """    l.prix = Math.max(0, Math.round((parseFloat(String($('[data-cf-l="prix"]', li).value).replace(',', '.')) || 0) * 100) / 100);
    sauver();
    dessinerCF();
    toast('Ligne enregistrée');""",
   """    l.prix = Math.max(0, Math.round((parseFloat(String($('[data-cf-l="prix"]', li).value).replace(',', '.')) || 0) * 100) / 100);
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
    toast('Ligne enregistrée');"""),
  ('supprimerLigneLibre redraw',
   """    conf.libres = conf.libres.filter(function (x) { return x.id !== id; });
    conf.ordre = conf.ordre.filter(function (x) { return x !== id; });
    sauver();
    dessinerCF();
    toast('Ligne supprimée');""",
   """    conf.libres = conf.libres.filter(function (x) { return x.id !== id; });
    conf.ordre = conf.ordre.filter(function (x) { return x !== id; });
    sauver();
    dessinerCF();
    if (ECRAN === 'carte') dessinerCarte();
    toast('Ligne supprimée');"""),
]:
    src = remplacer(src, vieux, neuf, nom)

# ---- 8. montrer('carte') : redessiner selon la vue active ----
src = remplacer(src,
"    if (ecran === 'ardoise') { dessinerCF(); dessinerQR(); }",
"""    if (ecran === 'ardoise') { dessinerCF(); dessinerQR(); }
    if (ecran === 'carte') dessinerCarte();""", 'montrer carte')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Patch onglet carte appliqué —', len(src), 'octets')
