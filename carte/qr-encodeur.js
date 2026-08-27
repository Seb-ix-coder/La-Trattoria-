// ============================================================
// La Trattoria - encodeur QR autonome (carte/), extrait de
// build/qr_addon.js (partie 1 : encodeur ISO/IEC 18004, valide
// octet pour octet contre la reference).
// API : TrattoriaQR.makeMatrix(texte,'H') -> matrice
//       TrattoriaQR.render(canvas, matrice, taillePx)
// ============================================================
/* ============================================================================
   Addon « QR code du menu » — ajout durci 11.1 (injecté dans site.js)
   ============================================================================
   1. Encodeur QR code autonome (mode octets, versions 1-10, niveau H)
      — porté de l'implémentation de référence (lib Python "qrcode",
      standard ISO/IEC 18004) et validé octet pour octet contre elle.
   2. Interface tactile pour petits écrans :
      * bouton flottant « QR » (≥ 54 px, zone sûre iOS respectée),
      * plein écran de lecture : QR très grand, contraste maximal, bord
        blanc de sécurité, bouton Fermer ≥ 48 px, fermeture par Échap ou
        par appui hors de la carte,
      * ouverture automatique du QR sur l'adresse /qr (pour l'affichage
        permanent sur la tablette du restaurant).

   L'URL encodée est celle de la page elle-même (location.origin) : le QR
   pointe donc TOUJOURS vers le bon serveur, quel que soit le réseau.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Partie 1 — Encodeur QR (aucune dépendance, fonctionne aussi en Node)
   * ------------------------------------------------------------------ */

  // Table Reed-Solomon (ISO/IEC 18004) : pour chaque version 1..10,
  // liste des groupes de blocs par niveau L, M, Q, H.
  // Un groupe = [nbBlocs, totalCodewords, dataCodewords].
  var RS = {
    1: {L: [[1, 26, 19]], M: [[1, 26, 16]], Q: [[1, 26, 13]], H: [[1, 26, 9]]},
    2: {L: [[1, 44, 34]], M: [[1, 44, 28]], Q: [[1, 44, 22]], H: [[1, 44, 16]]},
    3: {L: [[1, 70, 55]], M: [[1, 70, 44]], Q: [[2, 35, 17]], H: [[2, 35, 13]]},
    4: {L: [[1, 100, 80]], M: [[2, 50, 32]], Q: [[2, 50, 24]], H: [[4, 25, 9]]},
    5: {L: [[1, 134, 108]], M: [[2, 67, 43]], Q: [[2, 33, 15, 2, 34, 16]], H: [[2, 33, 11, 2, 34, 12]]},
    6: {L: [[2, 86, 68]], M: [[4, 43, 27]], Q: [[4, 43, 19]], H: [[4, 43, 15]]},
    7: {L: [[2, 98, 78]], M: [[4, 49, 31]], Q: [[2, 32, 14, 4, 33, 15]], H: [[4, 39, 13, 1, 40, 14]]},
    8: {L: [[2, 121, 97]], M: [[2, 60, 38, 2, 61, 39]], Q: [[4, 40, 18, 2, 41, 19]], H: [[4, 40, 14, 2, 41, 15]]},
    9: {L: [[2, 146, 116]], M: [[3, 58, 36, 2, 59, 37]], Q: [[4, 36, 16, 4, 37, 17]], H: [[4, 36, 12, 4, 37, 13]]},
    10: {L: [[2, 86, 68, 2, 87, 69]], M: [[4, 69, 43, 1, 70, 44]], Q: [[6, 43, 19, 2, 44, 20]], H: [[6, 43, 15, 2, 44, 16]]}
  };

  // Positions des patterns d'alignement par version (v1 : aucun).
  var ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
               [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // Normalisation de la table RS : certaines versions ont DEUX groupes de
  // blocs (ex. v8-H = 4 blocs de (40,14) + 2 blocs de (41,15)), encodés
  // dans la lib de référence comme un seul tableau de 6 entiers
  // [nb1, total1, data1, nb2, total2, data2]. On les découpe en groupes
  // distincts pour que capacité et entrelacement soient corrects.
  (function normalize() {
    var v, lvl;
    for (v = 1; v <= 10; v++) {
      for (lvl in RS[v]) {
        var groups = RS[v][lvl], out = [], g;
        for (g = 0; g < groups.length; g++) {
          var gr = groups[g];
          if (gr.length > 3) {
            for (var i = 0; i < gr.length; i += 3) out.push(gr.slice(i, i + 3));
          } else {
            out.push(gr);
          }
        }
        RS[v][lvl] = out;
      }
    }
  })();

  // Générateurs BCH (format info et version info).
  var G15 = 0x537, G15_MASK = 0x5412, G18 = 0x1f25;

  // Corps fini GF(256), polynôme 0x11d.
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) {
    if (!a || !b) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // Correction d'erreurs Reed-Solomon d'un bloc de données.
  function rsEncode(data, eccLen) {
    // polynôme générateur : (x - α^0)(x - α^1)…(x - α^(eccLen-1))
    var gen = [1], i, j, next;
    for (i = 0; i < eccLen; i++) {
      next = new Array(gen.length + 1).fill(0);
      for (j = 0; j < gen.length; j++) {
        next[j] ^= gen[j];
        next[j + 1] ^= gmul(gen[j], EXP[i]);
      }
      gen = next;
    }
    // division synthétique : le reste est l'ECC
    var res = data.slice().concat(new Array(eccLen).fill(0));
    for (i = 0; i < data.length; i++) {
      var coef = res[i];
      if (coef) {
        for (j = 0; j < gen.length; j++) {
          res[i + j] ^= gmul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Conversion texte -> octets UTF-8.
  function utf8Bytes(s) {
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      } else if (c < 0xD800 || c >= 0xE000) {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else { // paire de substitution UTF-16
        i++;
        var c2 = s.charCodeAt(i);
        var cp = 0x10000 + (((c & 0x3FF) << 10) | (c2 & 0x3FF));
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return out;
  }

  // Choix de la plus petite version capable de contenir `len` octets.
  function chooseVersion(len, ec) {
    var v;
    for (v = 1; v <= 10; v++) {
      var dataBits = 0, groups = RS[v][ec];
      for (var g = 0; g < groups.length; g++) dataBits += groups[g][0] * groups[g][2] * 8;
      // en-tête : mode (4 bits) + longueur (8 bits pour v1-9, 16 pour v10)
      var header = 4 + (v <= 9 ? 8 : 16);
      if (header + len * 8 <= dataBits) return v;
    }
    return 0; // trop long pour v10
  }

  // BCH(15,5) pour le format info (avec masque).
  function bchTypeInfo(data) {
    var d = data << 10;
    while (bitLen(d) - bitLen(G15) >= 0) d ^= G15 << (bitLen(d) - bitLen(G15));
    return ((data << 10) | d) ^ G15_MASK;
  }
  // BCH(18,6) pour la version info.
  function bchTypeNumber(data) {
    var d = data << 12;
    while (bitLen(d) - bitLen(G18) >= 0) d ^= G18 << (bitLen(d) - bitLen(G18));
    return (data << 12) | d;
  }
  function bitLen(n) {
    var l = 0;
    while (n) { l++; n >>>= 1; }
    return l;
  }

  // Construit les codewords complets (données + ECC, entrelacés).
  // 1) flux binaire : mode octets, longueur, données, terminateur, bourrage
  //    (zéros puis octets 0xEC/0x11 alternés jusqu'à la capacité),
  // 2) découpage en blocs, Reed-Solomon par bloc, entrelacement.
  function buildCodewords(text, version, ec) {
    var bytes = utf8Bytes(text);
    var groups = RS[version][ec];

    // -- capacité en bits de données et en-tête
    var dataBits = 0, g, b;
    for (g = 0; g < groups.length; g++) dataBits += groups[g][0] * groups[g][2];
    dataBits *= 8;
    var headerBits = 4 + (version <= 9 ? 8 : 16);

    // -- flux binaire
    var bits = [];
    function push(n, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((n >> i) & 1);
    }
    push(4, 4);
    push(bytes.length, version <= 9 ? 8 : 16);
    for (var k = 0; k < bytes.length; k++) push(bytes[k], 8);
    var remaining = dataBits - bits.length;
    push(0, Math.min(4, remaining));               // terminateur
    while (bits.length % 8 !== 0) bits.push(0);    // alignement sur octet
    var pad = [0xEC, 0x11], pi = 0;
    while (bits.length < dataBits) push(pad[pi++ % 2], 8);

    // -- octets de données (après bourrage)
    var data = [];
    for (k = 0; k < bits.length; k += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[k + j];
      data.push(byte);
    }

    // -- découpage en blocs (les octets se remplissent dans l'ordre)
    var blocks = [], eccLen = 0, idx = 0;
    for (g = 0; g < groups.length; g++) {
      var nb = groups[g][0], total = groups[g][1], dlen = groups[g][2];
      eccLen = total - dlen;
      for (b = 0; b < nb; b++) {
        blocks.push({ data: data.slice(idx, idx + dlen), ecc: [], eccLen: eccLen });
        idx += dlen;
      }
    }
    // -- Reed-Solomon par bloc
    for (g = 0; g < blocks.length; g++) blocks[g].ecc = rsEncode(blocks[g].data, eccLen);

    // -- entrelacement : d'abord les données, puis l'ECC
    var out = [];
    var maxData = 0, maxEcc = 0;
    for (g = 0; g < blocks.length; g++) {
      if (blocks[g].data.length > maxData) maxData = blocks[g].data.length;
      if (blocks[g].ecc.length > maxEcc) maxEcc = blocks[g].ecc.length;
    }
    for (b = 0; b < maxData; b++)
      for (g = 0; g < blocks.length; g++)
        if (b < blocks[g].data.length) out.push(blocks[g].data[b]);
    for (b = 0; b < maxEcc; b++)
      for (g = 0; g < blocks.length; g++)
        out.push(blocks[g].ecc[b]);
    return out;
  }

  // Placement des motifs fonctionnels et des données dans la matrice.
function lostPoint(m) {
      var n = m.length, lp = 0, r, c, run, prev, cnt, dark = 0;
      // règle 1 : suites de 5 modules identiques
      for (r = 0; r < n; r++) {
        run = 1;
        for (c = 1; c < n; c++) {
          if (m[r][c] === m[r][c - 1]) run++;
          else { if (run >= 5) lp += 3 + run - 5; run = 1; }
        }
        if (run >= 5) lp += 3 + run - 5;
      }
      for (c = 0; c < n; c++) {
        run = 1;
        for (r = 1; r < n; r++) {
          if (m[r][c] === m[r - 1][c]) run++;
          else { if (run >= 5) lp += 3 + run - 5; run = 1; }
        }
        if (run >= 5) lp += 3 + run - 5;
      }
      // règle 2 : blocs 2×2
      for (r = 0; r < n - 1; r++)
        for (c = 0; c < n - 1; c++)
          if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) lp += 3;
      // règle 3 : motif 1:1:3:1:1 (1011101) avec 0000 de part et d'autre.
      // NB : les accès m[..][c+10] / m[r+10][..] exigent des bornes strictes
      // (c + 10 < n) : hors tableau, undefined serait traité comme clair.
      for (r = 0; r < n; r++) {
        // le motif 1011101 tient jusqu'à c = n-7 ; la branche « 0000 après »
        // exige en plus c+10 < n (vérifié) pour rester dans le tableau.
        for (c = 0; c < n - 6; c++) {
          if (m[r][c] && !m[r][c + 1] && m[r][c + 2] && m[r][c + 3] &&
              m[r][c + 4] && !m[r][c + 5] && m[r][c + 6]) {
            if ((c - 4 >= 0 && !m[r][c - 1] && !m[r][c - 2] && !m[r][c - 3] && !m[r][c - 4]) ||
                (c + 10 < n && !m[r][c + 7] && !m[r][c + 8] && !m[r][c + 9] && !m[r][c + 10]))
              lp += 40;
          }
        }
      }
      for (c = 0; c < n; c++) {
        for (r = 0; r < n - 6; r++) {
          if (m[r][c] && !m[r + 1][c] && m[r + 2][c] && m[r + 3][c] &&
              m[r + 4][c] && !m[r + 5][c] && m[r + 6][c]) {
            if ((r - 4 >= 0 && !m[r - 1][c] && !m[r - 2][c] && !m[r - 3][c] && !m[r - 4][c]) ||
                (r + 10 < n && !m[r + 7][c] && !m[r + 8][c] && !m[r + 9][c] && !m[r + 10][c]))
              lp += 40;
          }
        }
      }
      // règle 4 : proportion de modules sombres
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (m[r][c]) dark++;
      lp += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
      return lp;
    }
  // Choix du plus petit masque si `forcedMask` est fourni (usage tests).
  function makeMatrix(text, ec, forcedMask) {
    ec = ec || 'H';
    // Le choix de version repose sur le nombre d'OCTETS UTF-8 (les
    // caractères accentués occupent plusieurs octets) : un décompte en
    // caractères sous-estimerait la taille et ferait déborder l'encodage.
    var version = chooseVersion(utf8Bytes(text).length, ec);
    if (!version) return null;
    var size = version * 4 + 17;
    var mod = [];
    for (var r = 0; r < size; r++) mod.push(new Array(size).fill(null));
    var isFunc = function (r, c) { return mod[r][c] !== null; };

    // -- patterns de localisation (3 coins)
    function probe(row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r < 0 || row + r >= size) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c < 0 || col + c >= size) continue;
          mod[row + r][col + c] =
            ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
             (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
             (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        }
      }
    }
    probe(0, 0); probe(0, size - 7); probe(size - 7, 0);

    // -- pattern d'alignement (5×5)
    function adjust(row, col) {
      for (var r = -2; r <= 2; r++)
        for (var c = -2; c <= 2; c++)
          mod[row + r][col + c] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
    }
    var pos = ALIGN[version - 1];
    for (var i = 0; i < pos.length; i++)
      for (var j = 0; j < pos.length; j++)
        if (mod[pos[i]][pos[j]] === null) adjust(pos[i], pos[j]);

    // -- horloge (timing)
    for (r = 8; r < size - 8; r++) if (mod[r][6] === null) mod[r][6] = r % 2 === 0;
    for (var c = 8; c < size - 8; c++) if (mod[6][c] === null) mod[6][c] = c % 2 === 0;

    // -- module sombre fixe
    mod[size - 8][8] = true;

    // -- données : codewords complets (données + ECC entrelacés), convertis
    //    en flux binaire pour le placement dans la matrice.
    var codewords = buildCodewords(text, version, ec);
    var bits = [];
    for (var ci = 0; ci < codewords.length; ci++) {
      for (var bi = 7; bi >= 0; bi--) bits.push((codewords[ci] >> bi) & 1);
    }

    // -- placement des bits en zigzag, 2 colonnes à la fois
    // (DEBUG : enregistre l'ordre de placement pour la validation croisée)
    var placeOrder = [];
    function place(maskPattern, test) {
      // d'abord les motifs de format/version (si test, sans données)
      var inc = -1, row = size - 1, bitIdx = 0, col;
      for (col = size - 1; col > 0; col -= 2) {
        // NB : on travaille sur une COPIE locale `cc` — modifier `col` ici
        // casserait la progression de la boucle (double décrément).
        var cc = col;
        if (cc <= 6) cc--;          // saute la colonne 6 (horloge)
        var cols = [cc, cc - 1];
        while (true) {
          for (var ci = 0; ci < 2; ci++) {
            var c2 = cols[ci];
            if (mod[row][c2] === null) {
              var dark = false;
              // Les DONNÉES réelles sont placées aussi en mode test :
              // c'est ce que fait la référence (map_data utilise toujours
              // les vrais bits) — la pénalité de masque est ainsi calculée
              // sur la matrice complète, pas sur le masque seul.
              if (bitIdx < bits.length) dark = bits[bitIdx] === 1;
              if (maskFunc(maskPattern, row, c2)) dark = !dark;
              mod[row][c2] = dark;
              if (!test) placeOrder.push([row, c2, bitIdx]);  // DEBUG
              bitIdx++;
            }
          }
          row += inc;
          if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
        }
      }
    }

    // -- masques
    function maskFunc(p, r, c) {
      switch (p) {
        case 0: return (r + c) % 2 === 0;
        case 1: return r % 2 === 0;
        case 2: return c % 3 === 0;
        case 3: return (r + c) % 3 === 0;
        case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        case 5: return (r * c) % 2 + (r * c) % 3 === 0;
        case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
        case 7: return ((r * c) % 3 + (r + c) % 2) % 2 === 0;
      }
      return false;
    }

    // -- format info (15 bits) et version info (18 bits, v≥7)
    var ecBits = { L: 1, M: 0, Q: 3, H: 2 }[ec];
    function writeTypeInfo(maskPattern, test) {
      var bits15 = bchTypeInfo((ecBits << 3) | maskPattern);
      var i;
      for (i = 0; i < 15; i++) {
        // En mode test (sélection du masque), la référence écrit des
        // modules de format TOUS BLANCS : même comportement ici.
        var b1 = !test && ((bits15 >> i) & 1) === 1;
        // copie 1 (coin haut-gauche)
        if (i < 6) mod[i][8] = b1;
        else if (i < 8) mod[i + 1][8] = b1;
        else mod[size - 15 + i][8] = b1;
        // copie 2 (bords haut-droit et bas-gauche)
        if (i < 8) mod[8][size - i - 1] = b1;
        else if (i < 9) mod[8][15 - i - 1 + 1] = b1;
        else mod[8][15 - i - 1] = b1;
      }
      mod[size - 8][8] = !test;   // module sombre : blanc en mode test
    }
    function writeVersionInfo(test) {
      if (version < 7) return;
      var bits18 = bchTypeNumber(version);
      for (var i = 0; i < 18; i++) {
        var b2 = !test && ((bits18 >> i) & 1) === 1;
        mod[Math.floor(i / 3)][i % 3 + size - 11] = b2;
        mod[i % 3 + size - 11][Math.floor(i / 3)] = b2;
      }
    }

    // (la fonction lostPoint est définie au niveau supérieur)


    // On évalue les 8 masques sur une copie « test » de la matrice.
    var bestMask = 0, bestLost = Infinity, p;
    var saved = mod.map(function (rowArr) { return rowArr.slice(); });
    if (typeof forcedMask === 'number') {
      bestMask = forcedMask; // test : on impose le masque demandé
    } else {
      for (p = 0; p < 8; p++) {
        // réinitialise la matrice (sans les données) puis place test
        for (r = 0; r < size; r++) mod[r] = saved[r].slice();
        writeTypeInfo(p, true);
        writeVersionInfo(true);
        place(p, true);
        var lp2 = lostPoint(mod);
        if (lp2 < bestLost) { bestLost = lp2; bestMask = p; }
      }
    }
    // application finale avec le meilleur masque
    for (r = 0; r < size; r++) mod[r] = saved[r].slice();
    writeTypeInfo(bestMask, false);
    writeVersionInfo(false);
    place(bestMask, false);

    if (global.TrattoriaQR && global.TrattoriaQR._debug) {
      global.TrattoriaQR._debug.lastPlaceOrder = placeOrder;  // DEBUG
    }
    return { modules: mod, version: version, mask: bestMask, ec: ec };
  }

  // Rendu dans un <canvas> avec bord blanc de sécurité et haute résolution.
  function render(canvas, matrix, px) {
    var m = matrix.modules, n = m.length;
    var border = 4, scale = Math.max(1, Math.round((px || 512) / (n + border * 2)));
    var size = (n + border * 2) * scale;
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++)
      for (var c = 0; c < n; c++)
        if (m[r][c]) ctx.fillRect((c + border) * scale, (r + border) * scale, scale, scale);
  }

  global.TrattoriaQR = { makeMatrix: makeMatrix, render: render,
    // hooks de test (exposés pour la validation croisée uniquement)
    _debug: { buildCodewords: buildCodewords, chooseVersion: chooseVersion,
              utf8Bytes: utf8Bytes, rsEncode: rsEncode, lostPoint: lostPoint } };
})(typeof window !== 'undefined' ? window : globalThis);
