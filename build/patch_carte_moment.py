#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch carte.js : cartes du moment (plats, boissons, vins, glaces,
desserts, bières) — éditeur + rendu craie + prix HT + mentions."""
import sys

CHEMIN = 'carte/carte.js'
src = open(CHEMIN, encoding='utf-8').read()
module = open('carte/moment-module.tmp.js', encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom):
    if s.count(vieux) != 1:
        print('ECHEC %s' % nom)
        print(repr(vieux[:160]))
        sys.exit(1)
    return s.replace(vieux, neuf, 1)

# ---- 1. insertion du module (avant charger) ----
src = remplacer(src, "  function charger() {",
                module + "\n  function charger() {", 'insertion moment')

# ---- 2. configDefaut : moment ----
src = remplacer(src,
"""      fams: fams,
      extras: extrasDefaut()
    };
  }""",
"""      fams: fams,
      extras: extrasDefaut(),
      moment: (function () {
        var m = {};
        MOMENT_ORDRE.forEach(function (cle) { m[cle] = momentConfDefaut(cle); });
        return m;
      })()
    };
  }""", 'configDefaut moment')

# ---- 3. configNormalisee : moment stocké ----
src = remplacer(src,
"""      fams: {},
      extras: {}
    };""",
"""      fams: {},
      extras: {},
      moment: {}
    };""", 'configNormalisee moment init')

src = remplacer(src,
"""    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle]);
    });
    return out;
  }""",
"""    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle]);
    });
    MOMENT_ORDRE.forEach(function (cle) {
      var confMo = (c.moment && typeof c.moment === 'object') ? c.moment[cle] : null;
      out.moment[cle] = momentConfNormalisee(confMo, cle);
    });
    return out;
  }""", 'configNormalisee moment build')

# ---- 4. vue « ✨ Du moment » dans dessinerCarte ----
src = remplacer(src,
"""  function dessinerCarte() {
    if (CARTE_VIEW !== 'standard') { dessinerVueExtra(CARTE_VIEW); return; }""",
"""  function dessinerCarte() {
    if (CARTE_VIEW === 'moment') { dessinerVueMoment(); return; }
    if (CARTE_VIEW !== 'standard') { dessinerVueExtra(CARTE_VIEW); return; }""", 'dispatch moment')

# ---- 5. clics : câblage clicMoment ----
src = remplacer(src,
"      if (clicArdoise(t)) return;\n      if (clicCarteStandard(t)) return;",
"      if (clicArdoise(t)) return;\n      if (clicMoment(t)) return;\n      if (clicCarteStandard(t)) return;",
'wire clicMoment')

# ---- 6. cueillette : mode moment ----
src = remplacer(src,
"""  function dessinerCueillette() {
    if (!CUEILLETTE) return;
    var modeExtra = CUEILLETTE.cle.indexOf('extras:') === 0;
    var q = norm($('#cueillette-recherche').value);
    var candidats = (modeExtra ? CARTE.filter(function (p) { return p.actif; })
                               : candidatsArdoise(CUEILLETTE.cle)).filter(function (p) {
      return !q || norm(p.nom + ' ' + p.fam + ' ' + p.cat).indexOf(q) >= 0;
    });""",
"""  function dessinerCueillette() {
    if (!CUEILLETTE) return;
    var modeExtra = CUEILLETTE.cle.indexOf('extras:') === 0;
    var modeMoment = CUEILLETTE.cle.indexOf('moment:') === 0;
    var q = norm($('#cueillette-recherche').value);
    var candidats = ((modeExtra || modeMoment)
      ? CARTE.filter(function (p) { return p.actif; })
      : candidatsArdoise(CUEILLETTE.cle)).filter(function (p) {
      return !q || norm(p.nom + ' ' + p.fam + ' ' + p.cat).indexOf(q) >= 0;
    });""", 'dessinerCueillette moment')

src = remplacer(src,
"""    if (CUEILLETTE.cle.indexOf('extras:') === 0) {""",
"""    if (CUEILLETTE.cle.indexOf('moment:') === 0) {
      var cleM = CUEILLETTE.cle.slice(7);
      var confM = CF.moment[cleM];
      var libresM = confM.libres.map(function (l) { return l.id; });
      var gardesM = confM.ordre.filter(function (id) {
        return libresM.indexOf(id) >= 0 || CUEILLETTE.choisis.indexOf(id) >= 0;
      });
      CUEILLETTE.choisis.forEach(function (id) {
        if (gardesM.indexOf(id) < 0) gardesM.push(id);
      });
      confM.ordre = gardesM;
      fermerCueillette();
      sauver();
      dessinerCF();
      if (ECRAN === 'carte') dessinerCarte();
      toast(confM.titre + ' : ' + gardesM.length + ' ligne(s)');
      return;
    }
    if (CUEILLETTE.cle.indexOf('extras:') === 0) {""", 'validerCueillette moment')

# ---- 7. exports tests ----
src = remplacer(src,
"""    htmlArdoiseExtras: htmlArdoiseExtras,
    itemsFamille: itemsFamille,
    itemsExtra: itemsExtra,""",
"""    htmlArdoiseExtras: htmlArdoiseExtras,
    itemsFamille: itemsFamille,
    itemsExtra: itemsExtra,
    htmlMoment: htmlMoment,
    itemsMoment: itemsMoment,""", 'exports moment')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Patch moment appliqué —', len(src), 'octets')
