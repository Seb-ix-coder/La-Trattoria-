#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch apercu-carte.html : cartes du moment publiées sur le site."""
import sys

CHEMIN = 'carte/apercu-carte.html'
src = open(CHEMIN, encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom):
    if s.count(vieux) != 1:
        print('ECHEC %s' % nom)
        print(repr(vieux[:160]))
        sys.exit(1)
    return s.replace(vieux, neuf, 1)

# ---- 1. defs moment (comme carte.js, versions courtes) ----
src = remplacer(src,
"""  var EXTRA_ORDRE = ['formules', 'vins', 'glaces', 'bieres'];""",
"""  var EXTRA_ORDRE = ['formules', 'vins', 'glaces', 'bieres'];
  var MOMENT_ORDRE = ['plats', 'boissons', 'vins', 'glaces', 'desserts', 'bieres'];
  var MOMENT_DEFS = {
    plats:     { titre: 'Les plats du moment',     sous: 'La carte change avec les saisons et le marché' },
    boissons:  { titre: 'Les boissons du moment',  sous: 'Avec ou sans alcool' },
    vins:      { titre: 'Vins & alcools du moment', sous: 'La sélection de la maison' },
    glaces:    { titre: 'Glaces artisanales du moment', sous: 'Glaces et sorbets L’Angelys, fabriqués artisanalement' },
    desserts:  { titre: 'Les desserts du moment',  sous: 'Faits maison, chaque jour' },
    bieres:    { titre: 'Les bières du moment',    sous: 'Pression et bouteilles du moment' }
  };

  function momentConfDefaut(cle) {
    var def = MOMENT_DEFS[cle];
    var libres = cle === 'glaces' ? [
      { id: 'lmgl0', nom: 'Vanille Bourbon', sous: 'Gousse de Madagascar', prix: 2.5, tva: 0.1 },
      { id: 'lmgl1', nom: 'Chocolat noir 70 %', sous: 'Cacao intense', prix: 2.5, tva: 0.1 },
      { id: 'lmgl2', nom: 'Pistache', sous: 'Pistaches de Sicile', prix: 2.8, tva: 0.1 },
      { id: 'lmgl3', nom: 'Rhum-raisin', sous: 'Rhum ambré, raisins marinés', prix: 3, tva: 0.1 },
      { id: 'lmgl4', nom: 'Sorbet citron de Sicile', sous: 'Vif et rafraîchissant', prix: 2.5, tva: 0.1 },
      { id: 'lmgl5', nom: 'Sorbet framboise', sous: 'Fruité, sans lactose', prix: 2.5, tva: 0.1 }
    ] : [];
    var seeds = {
      plats: 'plat', boissons: 'boisson'
    };
    var ordre = catalogue.filter(function (p) {
      if (!p.actif) return false;
      if (cle === 'plats') return p.type === 'plat';
      if (cle === 'boissons') return p.type === 'boisson';
      if (cle === 'vins') return /cave/i.test(String(p.cat || '')) || /limoncello|amaretto/i.test(String(p.nom || ''));
      if (cle === 'desserts') return /dessert/i.test(String(p.fam || ''));
      if (cle === 'bieres') return /bier/i.test(String(p.cat || '').toLowerCase());
      return false;
    }).map(function (p) { return p.id; });
    var mentionsAlcool = 'Prix hors taxes en euros. L’abus d’alcool est dangereux pour la santé, à consommer avec modération. La vente d’alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique).';
    var mentions = {
      plats: 'Prix hors taxes en euros. Nos plats sont préparés maison à partir de produits frais. Allergènes : la liste complète est disponible sur demande au comptoir.',
      boissons: 'Prix hors taxes en euros. La vente d’alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique).',
      vins: mentionsAlcool,
      glaces: 'Prix hors taxes en euros. Allergènes : lait, œuf, fruits à coque possibles selon les parfums. Glaces artisanales L’Angelys — parfums susceptibles de varier selon les arrivages.',
      desserts: 'Prix hors taxes en euros. Nos desserts sont préparés maison. Allergènes : gluten, lait, œuf, fruits à coque possibles selon les desserts.',
      bieres: mentionsAlcool
    };
    return {
      titre: def.titre, sous: def.sous, mentions: mentions[cle], ht: true,
      ordre: ordre,
      libres: libres.map(function (l) {
        return { id: l.id, nom: l.nom, sous: l.sous, desc: '', prix: l.prix, tva: l.tva };
      })
    };
  }

  function momentConfNormalisee(src, cle, catalogue) {
    var def = momentConfDefaut(cle, catalogue);
    var conf = {
      titre: String((src && src.titre) || '').trim().slice(0, 60) || def.titre,
      sous: String((src && src.sous) || '').trim().slice(0, 120),
      mentions: String((src && src.mentions) || '').trim().slice(0, 600) || def.mentions,
      ht: (src && typeof src.ht === 'boolean') ? src.ht : true,
      ordre: [],
      libres: ((src && Object.prototype.toString.call(src.libres) === '[object Array]')
        ? src.libres : def.libres).slice(0, 40).filter(function (l) {
            return l && typeof l === 'object' && String(l.nom || '').trim();
          })
    };
    var ids = {};
    catalogue.forEach(function (p) { ids[p.id] = true; });
    conf.libres.forEach(function (l) { ids[l.id] = true; });
    var ordre = ((src && Object.prototype.toString.call(src.ordre) === '[object Array]')
      ? src.ordre : def.ordre);
    ordre.forEach(function (id) {
      if (ids[id] && conf.ordre.indexOf(String(id)) < 0) conf.ordre.push(String(id));
    });
    if (!src) def.ordre.forEach(function (id) {
      if (conf.ordre.indexOf(id) < 0) conf.ordre.push(id);
    });
    conf.libres.forEach(function (l) {
      if (conf.ordre.indexOf(l.id) < 0) conf.ordre.push(l.id);
    });
    return conf;
  }""", 'defs moment public')

# ---- 2. configDefaut : moment ----
src = remplacer(src,
"""    out.extras = extrasDefaut(catalogue);
    return out;
  }""",
"""    out.extras = extrasDefaut(catalogue);
    out.moment = {};
    MOMENT_ORDRE.forEach(function (cle) { out.moment[cle] = momentConfDefaut(cle, catalogue); });
    return out;
  }""", 'configDefaut moment')

# ---- 3. configNormalisee : moment stocké ----
src = remplacer(src,
"""    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle], catalogue);
    });
    return out;
  }""",
"""    EXTRA_ORDRE.forEach(function (cle) {
      var confStockee = (c.extras && typeof c.extras === 'object') ? c.extras[cle] : null;
      out.extras[cle] = confExtraNormalisee(confStockee, cle, def.extras[cle], catalogue);
    });
    out.moment = {};
    MOMENT_ORDRE.forEach(function (cle) {
      var confMo = (c.moment && typeof c.moment === 'object') ? c.moment[cle] : null;
      out.moment[cle] = momentConfNormalisee(confMo, cle, catalogue);
    });
    return out;
  }""", 'configNormalisee moment')

# ---- 4. rendu : sections moment (avant le QR) ----
src = remplacer(src,
"""    h += '<div class="qrBlocArdoise">' +
      '<div class="t craie--blanc">Retrouvez-nous en ligne</div>' +""",
"""    // cartes du moment : illustration craie + prix HT + mentions
    if (cfg.moment) {
      var assetsMo = (window.ARDOISE_ASSETS && window.ARDOISE_ASSETS.moment) || {};
      MOMENT_ORDRE.forEach(function (cle) {
        var conf = cfg.moment[cle];
        var items = (conf.ordre || []).map(function (id) {
          if (parId[id]) {
            return parId[id].actif === false ? null : { kind: 'p', p: parId[id] };
          }
          var l = conf.libres.filter(function (x) { return x.id === id; })[0];
          return l ? { kind: 'l', l: l } : null;
        }).filter(Boolean);
        if (!items.length) return;
        var craie = CRAIE[ci % CRAIE.length];
        ci++;
        h += '<section class="catArdoise carte-moment ' + craie + '">' +
          '<img class="moment-illus" alt="" src="' + (assetsMo[cle] || '') + '">' +
          '<h2>' + echap(conf.titre) + '</h2>' +
          (conf.sous ? '<div class="sousCat">' + echap(conf.sous) + '</div>' : '');
        h += '<ul class="moment-liste itemsArdoise">';
        items.forEach(function (it) {
          if (it.kind === 'l') {
            var l = it.l;
            var tvaL = l.tva || 0.1;
            var prixL = conf.ht
              ? eur(Math.round((l.prix / (1 + tvaL)) * 100) / 100) + ' HT' : eur(l.prix);
            h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
              echap(l.nom) + '</span><span class="pts"></span>' +
              '<span class="prix craie--jaune">' + prixL + '</span></div>' +
              (l.sous ? '<span class="desc">' + echap(l.sous) + '</span>' : '') + '</li>';
          } else {
            var q = it.p;
            var prixP = conf.ht
              ? eur(Math.round((q.pv / (1 + q.tva)) * 100) / 100) + ' HT' : eur(q.pv);
            var sousP = q.sous || q.desc || '';
            h += '<li><div class="itemArdoise"><span class="nom craie--blanc">' +
              echap(q.nom) + '</span><span class="pts"></span>' +
              '<span class="prix craie--jaune">' + prixP + '</span></div>' +
              (sousP ? '<span class="desc">' + echap(sousP) + '</span>' : '') + '</li>';
          }
        });
        h += '</ul>';
        h += '<div class="moment-mentions"><span>' +
          (conf.ht ? 'Prix nets hors taxes — TVA en sus. ' : 'Prix TTC en euros. ') +
          echap(conf.mentions) + '</span></div></section>';
      });
    }

    h += '<div class="qrBlocArdoise">' +
      '<div class="t craie--blanc">Retrouvez-nous en ligne</div>' +""", 'rendu moment')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('apercu-carte.html : cartes du moment publiées')
