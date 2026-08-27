#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch carte.js : cartes additionnelles (formules, vins, glaces, bières)."""
import sys

CHEMIN = 'carte/carte.js'
src = open(CHEMIN, encoding='utf-8').read()
module = open('carte/module-extras.tmp.js', encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom, compte=1):
    n = s.count(vieux)
    if n < compte:
        print('ECHEC %s : %d occurrence(s)' % (nom, n))
        print(repr(vieux[:160]))
        sys.exit(1)
    return s.replace(vieux, neuf, compte)

# ---- 1. insertion du module extras (après le module ardoise, avant charger) ----
src = remplacer(src, "  function charger() {",
                module + "\n  function charger() {", 'insertion module extras')

# ---- 2. compteur de craie (état) ----
src = remplacer(src,
"  var LIGNE_A_EDITER = null;  // id de ligne libre à éditer après le prochain rendu",
"  var LIGNE_A_EDITER = null;  // id de ligne libre à éditer après le prochain rendu\n"
"  var CPT_CRAIE = 0;          // alternance des couleurs de craie", 'CPT_CRAIE')

# ---- 3. htmlArdoise : exclusion extras + rendu factorisé + extras ----
old_loop = """    var ci = 0;
    famsCatalogue().forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam).filter(function (it) {
        return it.kind === 'l' || it.p.actif;
      });
      if (!items.length) return;
      var craie = CRAIE_CLASSES[ci % CRAIE_CLASSES.length];
      ci++;
      // première photo de la catégorie (photo d'ardoise, sinon photo)
      var photo = null;
      items.some(function (it) {
        if (it.kind === 'p') { photo = photoArdoiseDe(it.p); return !!photo; }
        return false;
      });
      h += '<section class="catArdoise' + (photo ? ' catAvecPhoto' : '') + '">' +
        '<h2 class="' + craie + '">' + echap(conf.titre) + '</h2>' +
        (conf.sous ? '<div class="sousCat">' + echap(conf.sous) + '</div>' : '');
      if (photo) {
        h += '<figure class="photoCraie"><img src="' + photo +
          '" alt="Photo — ' + echap(conf.titre) + '" loading="lazy"></figure>';
      }
      h += '<ul class="itemsArdoise' + (items.length > 9 ? ' tailleModeree' : '') + '">';
      items.forEach(function (it) {
        if (it.kind === 'l') {
          h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
            echap(it.l.nom) + '</span><span class="pts"></span>' +
            '<span class="prix craie--jaune">' + (it.l.prix > 0 ? eur(it.l.prix) : '') + '</span></div>' +
            (it.l.sous ? '<span class="desc">' + echap(it.l.sous) + '</span>' : '') +
            (it.l.desc ? '<span class="desc">' + echap(it.l.desc) + '</span>' : '') +
            '</li>';
        } else {
          var q = it.p;
          var sous = q.sous || q.desc || '';
          var formats = (q.formats && q.formats.length)
            ? q.formats.map(function (f) {
                return echap(f.nom) + ' <b class="craie--jaune">' + eur(f.pv) + '</b>';
              }).join(' · ')
            : null;
          h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
            echap(q.nom) + '</span><span class="pts"></span>' +
            '<span class="prix craie--jaune">' + eur(prixAffiche(q)) + '</span></div>' +
            (sous ? '<span class="desc">' + echap(sous) + '</span>' : '') +
            (formats ? '<span class="desc">' + formats + '</span>' : '') +
            '</li>';
        }
      });
      h += '</ul></section>';
    });
"""
new_loop = """    CPT_CRAIE = 0;
    var dansExtras = idsDansExtras();
    famsCatalogue().forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam).filter(function (it) {
        if (it.kind === 'p') {
          if (!it.p.actif) return false;
          if (dansExtras[it.p.id]) return false; // déjà dans une carte dédiée
        }
        return true;
      });
      if (!items.length) return;
      h += htmlCategorieArdoise(conf.titre, conf.sous, items);
    });

    // cartes additionnelles : formules, vins, glaces, bières
    h += htmlArdoiseExtras(cfg);
"""
src = remplacer(src, old_loop, new_loop, 'htmlArdoise boucle fams')

# ---- 4. configDefaut : extras par défaut ----
src = remplacer(src,
"""    return {
      site: d.site || 'https://latrattoria-saintes.fr/',
      badges: (d.badges || []).slice(0, 4),
      pates: {
        titre: (d.pates && d.pates.titre) || 'Pâte à pizza maison',
        sous: (d.pates && d.pates.sous) || 'Fraîche, maturée 48 heures'
      },
      fams: fams
    };
  }""",
"""    return {
      site: d.site || 'https://latrattoria-saintes.fr/',
      badges: (d.badges || []).slice(0, 4),
      pates: {
        titre: (d.pates && d.pates.titre) || 'Pâte à pizza maison',
        sous: (d.pates && d.pates.sous) || 'Fraîche, maturée 48 heures'
      },
      fams: fams,
      extras: extrasDefaut()
    };
  }""", 'configDefaut extras')

# ---- 5. configNormalisee : extras stockés ----
src = remplacer(src,
"""      pates: {
        titre: String((c.pates && c.pates.titre) || '').trim().slice(0, 60) || def.pates.titre,
        sous: String((c.pates && c.pates.sous) || '').trim().slice(0, 120) || def.pates.sous
      },
      fams: {}
    };""",
"""      pates: {
        titre: String((c.pates && c.pates.titre) || '').trim().slice(0, 60) || def.pates.titre,
        sous: String((c.pates && c.pates.sous) || '').trim().slice(0, 120) || def.pates.sous
      },
      fams: {},
      extras: {}
    };""", 'configNormalisee extras init')

src = remplacer(src,
"""      out.fams[f] = {
        titre: String(src.titre || '').trim().slice(0, 60) || (def.fams[f] ? def.fams[f].titre : f),
        sous: String(src.sous || '').trim().slice(0, 120),
        ordre: ordre,
        libres: libres
      };
    });
    return out;
  }""",
"""      out.fams[f] = {
        titre: String(src.titre || '').trim().slice(0, 60) || (def.fams[f] ? def.fams[f].titre : f),
        sous: String(src.sous || '').trim().slice(0, 120),
        ordre: ordre,
        libres: libres
      };
    });
    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle]);
    });
    return out;
  }""", 'configNormalisee extras build')

# ---- 6. dessinerCF : masquer les produits partis en carte dédiée ----
src = remplacer(src,
"""  function dessinerCF() {
    var hote = $('#liste-cf');
    if (!hote || !CF) return;
    var h = '';
    famsCatalogue().forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam);
      var nPhotos = items.filter(function (it) {
        return it.kind === 'p' && photoArdoiseDe(it.p);
      }).length;""",
"""  function dessinerCF() {
    var hote = $('#liste-cf');
    if (!hote || !CF) return;
    var h = '';
    var dansEx = idsDansExtras();
    famsCatalogue().forEach(function (fam) {
      var conf = CF.fams[fam];
      if (!conf) return;
      var items = itemsFamille(fam).filter(function (it) {
        return it.kind === 'l' || !dansEx[it.p.id];
      });
      var nPhotos = items.filter(function (it) {
        return it.kind === 'p' && photoArdoiseDe(it.p);
      }).length;""", 'dessinerCF exclusion')

# ---- 7. dessinerCF : ajouter les cartes additionnelles après innerHTML ----
src = remplacer(src,
"""    hote.innerHTML = h;
    if (LIGNE_A_EDITER) {""",
"""    hote.innerHTML = h;
    dessinerCFExtras();
    if (LIGNE_A_EDITER) {""", 'dessinerCF extras call')

# ---- 8. handlers génériques via confDeCarte ----
for nom, vieux, neuf in [
  ('enregistrerTitreFamille',
   """  function enregistrerTitreFamille(card) {
    var fam = card.dataset.fam;
    var conf = CF.fams[fam];
    if (!conf) return;""",
   """  function enregistrerTitreFamille(card) {
    var conf = confDeCarte(card);
    if (!conf) return;"""),
  ('deplacerLigneCF',
   """  function deplacerLigneCF(card, id, delta) {
    var conf = CF.fams[card.dataset.fam];
    if (!conf) return;""",
   """  function deplacerLigneCF(card, id, delta) {
    var conf = confDeCarte(card);
    if (!conf) return;"""),
  ('ajouterLigneLibre',
   """  function ajouterLigneLibre(card) {
    var conf = CF.fams[card.dataset.fam];
    if (!conf) return;
    if (conf.libres.length >= 30) { toast('Maximum 30 lignes libres par catégorie'); return; }""",
   """  function ajouterLigneLibre(card) {
    var conf = confDeCarte(card);
    if (!conf) return;
    if (conf.libres.length >= 30) { toast('Maximum 30 lignes libres par catégorie'); return; }"""),
  ('editerLigneLibre',
   """  function editerLigneLibre(card, id) {
    var conf = CF.fams[card.dataset.fam];""",
   """  function editerLigneLibre(card, id) {
    var conf = confDeCarte(card);"""),
  ('enregistrerLigneLibre',
   """  function enregistrerLigneLibre(card, id) {
    var conf = CF.fams[card.dataset.fam];""",
   """  function enregistrerLigneLibre(card, id) {
    var conf = confDeCarte(card);"""),
  ('supprimerLigneLibre',
   """  function supprimerLigneLibre(card, id) {
    var conf = CF.fams[card.dataset.fam];""",
   """  function supprimerLigneLibre(card, id) {
    var conf = confDeCarte(card);"""),
]:
    src = remplacer(src, vieux, neuf, nom)

# ---- 9. clicArdoise : bouton « ＋ Produit du catalogue » ----
src = remplacer(src,
"""    if (a === 'ligne') { ajouterLigneLibre(card); return true; }""",
"""    if (a === 'ligne') { ajouterLigneLibre(card); return true; }
    if (a === 'produit' && card.dataset.ex) { ouvrirCueilletteExtra(card.dataset.ex); return true; }""",
'clic produit extra')

# ---- 10. cueillette : mode extras ----
src = remplacer(src,
"""  function ouvrirCueillette(cle) {
    CUEILLETTE = { cle: cle, choisis: ARDOISES[cle].selection.slice() };
    $('#cueillette-titre').textContent = ARDOISES[cle].titre;""",
"""  // mode « carte dédiée » : CUEILLETTE.cle = 'extras:<cle>'
  function ouvrirCueilletteExtra(cle) {
    var conf = CF.extras[cle];
    if (!conf) return;
    CUEILLETTE = {
      cle: 'extras:' + cle,
      choisis: conf.ordre.filter(function (id) { return !!parId(id); })
    };
    $('#cueillette-titre').textContent = conf.titre + ' — produits du catalogue';
    $('#cueillette-recherche').value = '';
    dessinerCueillette();
    $('#cueillette').hidden = false;
    $('#cueillette-recherche').focus();
  }

  function ouvrirCueillette(cle) {
    CUEILLETTE = { cle: cle, choisis: ARDOISES[cle].selection.slice() };
    $('#cueillette-titre').textContent = ARDOISES[cle].titre;""", 'ouvrirCueilletteExtra')

src = remplacer(src,
"""  function dessinerCueillette() {
    if (!CUEILLETTE) return;
    var q = norm($('#cueillette-recherche').value);
    var candidats = candidatsArdoise(CUEILLETTE.cle).filter(function (p) {
      return !q || norm(p.nom + ' ' + p.fam + ' ' + p.cat).indexOf(q) >= 0;
    });""",
"""  function dessinerCueillette() {
    if (!CUEILLETTE) return;
    var modeExtra = CUEILLETTE.cle.indexOf('extras:') === 0;
    var q = norm($('#cueillette-recherche').value);
    var candidats = (modeExtra ? CARTE.filter(function (p) { return p.actif; })
                               : candidatsArdoise(CUEILLETTE.cle)).filter(function (p) {
      return !q || norm(p.nom + ' ' + p.fam + ' ' + p.cat).indexOf(q) >= 0;
    });""", 'dessinerCueillette extras')

src = remplacer(src,
"""  function validerCueillette() {
    if (!CUEILLETTE) return;
    var a = ARDOISES[CUEILLETTE.cle];""",
"""  function validerCueillette() {
    if (!CUEILLETTE) return;
    if (CUEILLETTE.cle.indexOf('extras:') === 0) {
      var cleX = CUEILLETTE.cle.slice(7);
      var confX = CF.extras[cleX];
      var libresX = confX.libres.map(function (l) { return l.id; });
      var gardes = confX.ordre.filter(function (id) {
        return libresX.indexOf(id) >= 0 || CUEILLETTE.choisis.indexOf(id) >= 0;
      });
      CUEILLETTE.choisis.forEach(function (id) {
        if (gardes.indexOf(id) < 0) gardes.push(id);
      });
      confX.ordre = gardes;
      fermerCueillette();
      sauver();
      dessinerCF();
      toast(confX.titre + ' : ' + gardes.length + ' ligne(s)');
      return;
    }
    var a = ARDOISES[CUEILLETTE.cle];""", 'validerCueillette extras')

# ---- 11. exports tests ----
src = remplacer(src,
"""    config: function () { return CF; },
    htmlArdoise: htmlArdoise,
    itemsFamille: itemsFamille,""",
"""    config: function () { return CF; },
    htmlArdoise: htmlArdoise,
    htmlArdoiseExtras: htmlArdoiseExtras,
    itemsFamille: itemsFamille,
    itemsExtra: itemsExtra,
    extrasSeed: extrasSeed,
    ouvrirCueilletteExtra: ouvrirCueilletteExtra,""", 'exports')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Patch extras appliqué —', len(src), 'octets')
