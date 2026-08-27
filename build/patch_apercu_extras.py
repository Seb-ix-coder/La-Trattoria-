#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch apercu-carte.html : cartes additionnelles (formules, vins, glaces, bières)."""
import sys

CHEMIN = 'carte/apercu-carte.html'
src = open(CHEMIN, encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom):
    if s.count(vieux) != 1:
        print('ECHEC %s' % nom)
        print(repr(vieux[:160]))
        sys.exit(1)
    return s.replace(vieux, neuf, 1)

# ---- 1. EXTRA_DEFS + semis + lignes par défaut ----
src = remplacer(src,
"""  var CLE_STOCK = 'trattoria.carte.v1';
  var CLE_CONFIG = 'trattoria.config.v1';
  var CRAIE = ['craie--jaune', 'craie--blanc', 'craie--rose', 'craie--verte', 'craie--bleue'];""",
"""  var CLE_STOCK = 'trattoria.carte.v1';
  var CLE_CONFIG = 'trattoria.config.v1';
  var CRAIE = ['craie--jaune', 'craie--blanc', 'craie--rose', 'craie--verte', 'craie--bleue'];
  var EXTRA_ORDRE = ['formules', 'vins', 'glaces', 'bieres'];
  var EXTRA_DEFS = {
    formules: { titre: 'Nos formules',        sous: 'Menus et formules du moment' },
    vins:     { titre: 'La carte des vins',   sous: 'Au pichet et à la bouteille' },
    glaces:   { titre: 'La carte des glaces', sous: 'Glaces et sorbets maison' },
    bieres:   { titre: 'La carte des bières', sous: 'Pression et bouteilles' }
  };

  // Produits du catalogue placés automatiquement dans une carte.
  function extrasSeed(cle, catalogue) {
    return catalogue.filter(function (p) {
      if (cle === 'formules') return p.type === 'formule';
      if (cle === 'bieres') return /bier/i.test(String(p.cat || ''));
      if (cle === 'vins') {
        return /vin|cave/i.test(String(p.cat || '')) ||
               /chianti|pinot|prosecco|ros[eé]/i.test(String(p.nom || ''));
      }
      return false;
    }).map(function (p) { return p.id; });
  }

  function ligneLibreNormalisee(l, i) {
    if (!l || typeof l !== 'object') return null;
    var nom = String(l.nom || '').trim().slice(0, 60);
    if (!nom) return null;
    return {
      id: String(l.id || ('l' + Date.now().toString(36) + i)).slice(0, 24),
      nom: nom,
      sous: String(l.sous || '').trim().slice(0, 90),
      desc: String(l.desc || '').trim().slice(0, 200),
      prix: Math.max(0, Math.round(Number(l.prix) * 100) / 100 || 0)
    };
  }

  function extrasDefaut(catalogue) {
    var d = window.TRATTORIA_CONFIG_DEFAUT || {};
    var out = {};
    EXTRA_ORDRE.forEach(function (cle) {
      var def = (d.extras && d.extras[cle]) || EXTRA_DEFS[cle];
      out[cle] = {
        titre: String(def.titre || '').trim() || EXTRA_DEFS[cle].titre,
        sous: String(def.sous != null ? def.sous : EXTRA_DEFS[cle].sous).trim().slice(0, 120),
        ordre: extrasSeed(cle, catalogue),
        libres: (Object.prototype.toString.call(def.libres) === '[object Array]')
          ? def.libres.map(ligneLibreNormalisee).filter(Boolean)
          : []
      };
    });
    return out;
  }

  function confExtraNormalisee(src, cle, defaut, catalogue) {
    var conf = {
      titre: String((src && src.titre) || '').trim().slice(0, 60) || defaut.titre,
      sous: String((src && src.sous) || '').trim().slice(0, 120),
      ordre: [],
      libres: ((src && Object.prototype.toString.call(src.libres) === '[object Array]')
        ? src.libres : defaut.libres).slice(0, 40).map(ligneLibreNormalisee).filter(Boolean)
    };
    var idsValides = {};
    catalogue.forEach(function (p) { idsValides[p.id] = true; });
    conf.libres.forEach(function (l) { idsValides[l.id] = true; });
    var ordre = ((src && Object.prototype.toString.call(src.ordre) === '[object Array]')
      ? src.ordre : defaut.ordre);
    ordre.forEach(function (id) {
      if (idsValides[id] && conf.ordre.indexOf(String(id)) < 0) conf.ordre.push(String(id));
    });
    if (!src) extrasSeed(cle, catalogue).forEach(function (id) {
      if (conf.ordre.indexOf(id) < 0) conf.ordre.push(id);
    });
    conf.libres.forEach(function (l) {
      if (conf.ordre.indexOf(l.id) < 0) conf.ordre.push(l.id);
    });
    return conf;
  }""", 'EXTRA_DEFS')

# ---- 2. configDefaut : extras ----
src = remplacer(src,
"""      out.fams[f] = {
        titre: def.titre || f,
        sous: def.sous || '',
        ordre: catalogue.filter(function (p) { return String(p.fam) === f; })
          .map(function (p) { return p.id; }),
        libres: []
      };
    });
    return out;
  }""",
"""      fams[f] = {
        titre: def.titre || f,
        sous: def.sous || '',
        ordre: catalogue.filter(function (p) { return String(p.fam) === f; })
          .map(function (p) { return p.id; }),
        libres: []
      };
    });
    out.extras = extrasDefaut(catalogue);
    return out;
  }""", 'configDefaut extras')

# ---- 3. configNormalisee : extras stockés ----
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
        titre: String(src.titre || '').trim().slice(0, 60) || def.fams[f].titre,
        sous: String(src.sous || '').trim().slice(0, 120),
        ordre: ordre,
        libres: libres
      };
    });
    return out;
  }""",
"""      out.fams[f] = {
        titre: String(src.titre || '').trim().slice(0, 60) || def.fams[f].titre,
        sous: String(src.sous || '').trim().slice(0, 120),
        ordre: ordre,
        libres: libres
      };
    });
    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle], catalogue);
    });
    return out;
  }""", 'configNormalisee extras build')

# ---- 4. rendu : exclusion + cartes additionnelles ----
src = remplacer(src,
"""    var parId = {};
    catalogue.forEach(function (p) { parId[p.id] = p; });
    var ci = 0;

    Object.keys(cfg.fams).forEach(function (fam) {
      var conf = cfg.fams[fam];
      var items = (conf.ordre || []).map(function (id) {
        if (parId[id]) return parId[id].actif === false ? null : { kind: 'p', p: parId[id] };
        var l = conf.libres.filter(function (x) { return x.id === id; })[0];
        return l ? { kind: 'l', l: l } : null;
      }).filter(Boolean);
      if (!items.length) return;
      var craie = CRAIE[ci % CRAIE.length];
      ci++;""",
"""    var parId = {};
    catalogue.forEach(function (p) { parId[p.id] = p; });
    var ci = 0;
    var dansExtras = {};
    if (cfg.extras) {
      Object.keys(cfg.extras).forEach(function (cle) {
        (cfg.extras[cle].ordre || []).forEach(function (id) { dansExtras[id] = true; });
      });
    }

    Object.keys(cfg.fams).forEach(function (fam) {
      var conf = cfg.fams[fam];
      var items = (conf.ordre || []).map(function (id) {
        if (parId[id]) {
          if (parId[id].actif === false) return null;
          if (dansExtras[id]) return null; // dans une carte dédiée
          return { kind: 'p', p: parId[id] };
        }
        var l = conf.libres.filter(function (x) { return x.id === id; })[0];
        return l ? { kind: 'l', l: l } : null;
      }).filter(Boolean);
      if (!items.length) return;
      var craie = CRAIE[ci % CRAIE.length];
      ci++;""", 'rendu exclusion')

# ---- 5. rendu des extras (avant le bloc QR) ----
src = remplacer(src,
"""    h += '<div class="qrBlocArdoise">' +
      '<div class="t craie--blanc">Retrouvez-nous en ligne</div>' +""",
"""    // cartes additionnelles : formules, vins, glaces, bières
    if (cfg.extras) {
      EXTRA_ORDRE.forEach(function (cle) {
        var conf = cfg.extras[cle];
        var items = (conf.ordre || []).map(function (id) {
          if (parId[id]) {
            if (parId[id].actif === false) return null;
            return { kind: 'p', p: parId[id] };
          }
          var l = conf.libres.filter(function (x) { return x.id === id; })[0];
          return l ? { kind: 'l', l: l } : null;
        }).filter(Boolean);
        if (!items.length) return;
        var craie = CRAIE[ci % CRAIE.length];
        ci++;
        var photo = null;
        items.some(function (it) {
          if (it.kind === 'p') { photo = it.p.photoArdoise || it.p.photo || null; return !!photo; }
          return false;
        });
        h += '<section class="catArdoise' + (photo ? ' catAvecPhoto' : '') + ' carte-' + cle + '">' +
          '<h2 class="' + craie + '">' + echap(conf.titre) + '</h2>' +
          (conf.sous ? '<div class="sousCat">' + echap(conf.sous) + '</div>' : '');
        if (photo) {
          h += '<figure class="photoCraie"><img src="' + photo + '" alt="Photo — ' +
            echap(conf.titre) + '" loading="lazy"></figure>';
        }
        h += '<ul class="itemsArdoise' + (items.length > 9 ? ' tailleModeree' : '') + '">';
        items.forEach(function (it) {
          if (it.kind === 'l') {
            h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
              echap(it.l.nom) + '</span><span class="pts"></span>' +
              '<span class="prix craie--jaune">' + (it.l.prix > 0 ? eur(it.l.prix) : '') + '</span></div>' +
              (it.l.sous ? '<span class="desc">' + echap(it.l.sous) + '</span>' : '') +
              (it.l.desc ? '<span class="desc">' + echap(it.l.desc) + '</span>' : '') + '</li>';
          } else {
            var q = it.p;
            var sousP = q.sous || q.desc || '';
            var formats = (q.formats && q.formats.length)
              ? q.formats.map(function (f) {
                  return echap(f.nom) + ' <b class="craie--jaune">' + eur(f.pv) + '</b>';
                }).join(' · ') : null;
            h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
              echap(q.nom) + '</span><span class="pts"></span>' +
              '<span class="prix craie--jaune">' + eur(prixAffiche(q)) + '</span></div>' +
              (sousP ? '<span class="desc">' + echap(sousP) + '</span>' : '') +
              (formats ? '<span class="desc">' + formats + '</span>' : '') + '</li>';
          }
        });
        h += '</ul></section>';
      });
    }

    h += '<div class="qrBlocArdoise">' +
      '<div class="t craie--blanc">Retrouvez-nous en ligne</div>' +""", 'rendu extras')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Patch apercu-carte.html appliqué')
