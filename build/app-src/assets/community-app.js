/* ============================================================
   La Trattoria — Communauté (build 3 · refonte pro)
   Application : feed, fidélité, gaming, messages, profil,
   validation, consentement, temps réel.
   ============================================================ */
(function () {
  'use strict';

  // ---------------- état ----------------
  var moi = null;                 // mon compte
  var jeton = localStorage.getItem('communaute_jeton') || '';
  var FIL = 'tous';
  var photosLocales = [];
  var msgAvec = null;
  var verifModaleSession = false; // modale de validation déjà montrée cette session
  var AC = null;

  // ---------------- helpers ----------------
  function niveauCalc(pts) {
    var NIV = [['Bronze', 0, '\ud83e\udd49'], ['Argent', 150, '\ud83e\udd48'], ['Or', 400, '\ud83e\udd47'], ['Platine', 1000, '\ud83d\udc8e']];
    var cur = NIV[0], suivan = null;
    for (var i = 0; i < NIV.length; i++) { if (pts >= NIV[i][1]) cur = NIV[i]; }
    for (var j = 0; j < NIV.length; j++) { if (NIV[j][1] > pts) { suivan = NIV[j]; break; } }
    var prog = suivan ? Math.round(100 * (pts - cur[1]) / (suivan[1] - cur[1])) : 100;
    return { nom: cur[0], icone: cur[2], seuil: cur[1], prochain: suivan, prog: prog };
  }
  function $(id) { return document.getElementById(id); }
  function mediaUrl(url) {
    url = String(url || '');
    return /^(data:|https?:|blob:)/i.test(url) ? url : (window.COMMUNAUTE_API || '') + url;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hms(t) {
    var d = new Date(t * 1000), a = new Date();
    if (d.toDateString() === a.toDateString()) return d.toTimeString().slice(0, 5);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
  function hmsFull(t) {
    return new Date(t * 1000).toLocaleDateString('fr-FR',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function avaHtml(u, cls) {
    cls = cls || 'ava-m';
    if (u && u.avatar) return '<div class="ava ' + cls + '"><img src="' + mediaUrl(u.avatar) + '" alt=""></div>';
    if (u && u.logo) return '<div class="ava ' + cls + '" style="border-radius:12px"><img src="' + mediaUrl(u.logo) + '" alt=""></div>';
    return '<div class="ava ' + cls + '">' + esc((u && u.nom || '?').slice(0, 1).toUpperCase()) + '</div>';
  }
  function chipType(t) {
    if (t === 'partenaire') return '<span class="chip chip-pro">Partenaire</span>';
    if (t === 'staff') return '<span class="chip chip-staff">La Trattoria</span>';
    return '';
  }
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  // ---------------- modale ----------------
  function modale(opts) {
    // opts: {icone, titre, texte, actions:[{label, cls, onClick, primary}], close}
    var zone = $('modale-zone');
    zone.innerHTML =
      '<div class="modale-bg" id="mod-bg">' +
      '<div class="modale" style="position:relative">' +
      (opts.close !== false ? '<button class="close" id="mod-x">✕</button>' : '') +
      '<div class="pad">' +
      (opts.icone ? '<div class="ic-g">' + opts.icone + '</div>' : '') +
      (opts.titre ? '<h2>' + opts.titre + '</h2>' : '') +
      (opts.texte ? '<p>' + opts.texte + '</p>' : '') +
      '<div class="actions">' +
      (opts.actions || []).map(function (a, i) {
        return '<button class="btn btn-bloc ' + (a.cls || 'btn-s') + '" data-i="' + i + '">' +
          esc(a.label) + '</button>';
      }).join('') +
      '</div></div></div></div>';
    var bg = $('mod-bg');
    function fermer() { zone.innerHTML = ''; }
    if (opts.close !== false) $('mod-x').onclick = fermer;
    bg.onclick = function (e) { if (e.target === bg && opts.close !== false) fermer(); };
    (opts.actions || []).forEach(function (a, i) {
      bg.querySelector('[data-i="' + i + '"]').onclick = function () {
        if (a.keepOpen) { a.onClick(); } else { fermer(); if (a.onClick) a.onClick(); }
      };
    });
  }
  function modaleValidation() {
    // ne pas empiler si déjà affichée
    if (document.querySelector('#modale-zone .modale')) return;
    modale({
      icone: '🪪',
      titre: 'Compte en attente de validation',
      texte: 'Votre inscription est bien prise en compte. Pour débloquer les ' +
        'services (publier, commenter, échanger), <strong>présentez cette page ' +
        'au comptoir</strong> ou indiquez votre numéro au personnel — la validation ' +
        'prend 30 secondes. Vous serez débloqué instantanément.',
      close: false,
      actions: [
        { label: 'J’ai compris', cls: 'btn-p' }
      ]
    });
  }
  function bloquerNonVerifie() {
    // rappel systématique par modale de la validation
    modaleValidation();
  }

  // ---------------- alerte + sons ----------------
  function audioCtx() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
    return AC;
  }
  function note(freq, t0, dur, type, gain) {
    var ac = audioCtx(); if (!ac) return;
    try {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ac.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.16, ac.currentTime + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + 0.05);
    } catch (e) {}
  }
  function son(type) {
    if (moi && moi.consent && moi.consent.notifs_son === false) return; // consentement
    try {
      if (type === 'reservation') {
        note(660, 0, .12, 'square', .15); note(660, .16, .12, 'square', .15);
        note(880, .32, .2, 'square', .16);
      } else if (type === 'accepte') {
        note(523, 0, .1, 'sine', .18); note(659, .1, .1, 'sine', .18);
        note(784, .2, .18, 'sine', .2);
      } else if (type === 'refuse') {
        note(330, 0, .16, 'sine', .14); note(262, .14, .22, 'sine', .14);
      } else if (type === 'achat') {
        note(784, 0, .08, 'sine', .15); note(1047, .08, .12, 'sine', .16);
      } else if (type === 'badge') {
        note(784, 0, .09, 'triangle', .15); note(988, .1, .09, 'triangle', .15);
        note(1175, .2, .16, 'triangle', .17);
      } else {
        note(880, 0, .07, 'sine', .14); note(1175, .07, .1, 'sine', .15);
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(type === 'reservation' ? [120, 60, 120] : 70); } catch (e) {}
  }
  function alerte(msg, type, icone, action, actionLabel) {
    var el = $('alerte');
    el.className = 'alerte a-' + (type || 'info');
    el.innerHTML = '<span class="ic-alerte">' + (icone || '🔔') + '</span>' +
      '<span class="txt"></span>' +
      (action ? '<button class="act">' + esc(actionLabel || 'Voir') + '</button>' : '');
    el.querySelector('.txt').textContent = msg;
    if (action) el.querySelector('.act').onclick = function (e) {
      e.stopPropagation(); el.hidden = true; action();
    };
    el.hidden = false;
    el.onclick = function () { el.hidden = true; if (action) action(); };
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 9000);
  }
  function celebration(titre, texte, icone) {
    var z = $('celebration-zone');
    z.innerHTML = '<div class="celebration"><div class="card">' +
      '<div class="ic">' + (icone || '🏆') + '</div>' +
      '<h3>' + esc(titre) + '</h3><p>' + esc(texte) + '</p></div></div>';
    setTimeout(function () { z.innerHTML = ''; }, 2600);
  }

  // ---------------- API ----------------
  function api(path, data, ctype, method) {
    var opts = { method: method || (data ? 'POST' : 'GET'),
      headers: { 'X-Requested-With': 'communaute' } };
    if (jeton) opts.headers['X-Jeton'] = jeton;
    if (data && ctype === 'json') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    } else if (data) {
      opts.body = data; // FormData
    }
    return fetch((window.COMMUNAUTE_API || '') + '/api/' + path, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (j) {
        if (j.code === 'non_verifie') { bloquerNonVerifie(); return j; }
        if (r.status === 401 && path !== 'connexion' && path !== 'inscription') {
          seDeconnecter();
        }
        return j;
      });
    }).catch(function () {
      return { ok: false, erreur: 'Hors du réseau du restaurant ?' };
    });
  }

  // ---------------- navigation ----------------
  var NAVS = { accueil: 'vue-accueil', fidelite: 'vue-fidelite', gaming: 'vue-gaming',
    messages: 'vue-messages', profil: 'vue-profil' };
  function naviguer(cible) {
    Object.keys(NAVS).forEach(function (k) { $(NAVS[k]).hidden = (k !== cible); });
    document.querySelectorAll('.nav-b').forEach(function (b) {
      b.classList.toggle('actif', b.dataset.nav === cible);
    });
    $('app').hidden = false;
    ['vue-classement', 'vue-validation'].forEach(function (id) { $(id).hidden = true; });
    if (cible === 'accueil') afficherFil();
    if (cible === 'fidelite') ouvrirFidelite();
    if (cible === 'gaming') ouvrirGaming();
    if (cible === 'messages') ouvrirMessages();
    if (cible === 'profil') ouvrirProfil();
    window.scrollTo(0, 0);
  }
  function ouvrirVueSuper(id) {
    Object.keys(NAVS).forEach(function (k) { $(NAVS[k]).hidden = true; });
    $('app').hidden = true;
    $(id).hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------------- auth ----------------
  function seDeconnecter() {
    jeton = '';
    localStorage.removeItem('communaute_jeton');
    moi = null;
    verifModaleSession = false;
    clearTimeout(window._rt);
    $('app').hidden = true;
    $('ecran-auth').hidden = false;
    var b = $('nb-msg-badge'); if (b) b.hidden = true;
  }
  function apresConnexion() {
    $('ecran-auth').hidden = true;
    $('app').hidden = false;
    naviguer('accueil');
    afficherBanVerif();
    // rappel initial (systématique ensuite à chaque action bloquée)
    if (!moi.verifie) modaleValidation();
    pollRealtime();
  }
  function charger() {
    api('moi').then(function (j) {
      if (!j.ok || !j.moi) { seDeconnecter(); return; }
      moi = j.moi;
      apresConnexion();
    });
  }

  // ---------------- bannière non validé ----------------
  function afficherBanVerif() {
    var z = $('ban-verif-zone');
    if (!z) return;
    if (moi && !moi.verifie && moi.type !== 'staff') {
      z.innerHTML = '<div class="ban-verif"><span style="font-size:20px">🪪</span>' +
        '<span><span class="b">Compte en attente de validation.</span> ' +
        'Présentez cette page au comptoir pour débloquer les services.</span>' +
        '<button id="ban-verif-btn">Détails</button></div>';
      $('ban-verif-btn').onclick = modaleValidation;
    } else z.innerHTML = '';
  }

  // ---------------- FEED ----------------
  function mentionHtml(texte) {
    // encadre les @Mentions connues
    var s = esc(texte);
    return s.replace(/@([A-Za-zÀ-ÿ0-9' -]{2,30})/g, '<span class="mention">@$1</span>');
  }
  function reactChip(emoji, n, actif) {
    return '<button class="react' + (actif ? ' actif' : '') + '" data-emoji="' + emoji + '">' +
      emoji + (n ? ' <span class="n">' + n + '</span>' : '') + '</button>';
  }
  function posterHtml(p) {
    var a = p.auteur || {};
    var photos = (p.photos || []).map(function (u) {
      return '<img src="' + mediaUrl(u) + '" loading="lazy" alt="">';
    }).join('');
    return '<article class="post" data-post="' + p.id + '">' +
      '<div class="post-tete">' + avaHtml(a, 'ava-m') +
      '<div class="post-id"><div class="post-nom" data-nom="' + esc(a.nom) +
      '" data-type="' + (a.type || '') + '">' + esc(a.nom) + ' ' + chipType(a.type) + '</div>' +
      '<div class="post-meta">' +
      (a.niveau ? '<span class="chip chip-niv">' + a.niveau + '</span>' : '') +
      '<span>' + hms(p.cree_le) + '</span></div></div></div>' +
      '<div class="post-texte">' + mentionHtml(p.texte) + '</div>' +
      (photos ? '<div class="post-photos' + (p.photos.length === 1 ? ' one' : '') + '">' + photos + '</div>' : '') +
      '<div class="reacts" data-reacts="' + p.id + '">' +
      reactChip('❤️', 0, false) + reactChip('😍', 0, false) + reactChip('👏', 0, false) + reactChip('🤝', 0, false) +
      '</div>' +
      '<div class="post-actions">' +
      '<button class="act" data-com="' + p.id + '">💬 <span class="n">' + (p.nb_com || 0) + '</span></button>' +
      '<span class="flex1"></span>' +
      '<span class="n" style="font-size:12.5px;color:var(--gris2)">' + (p.nb_likes || 0) + ' ♥</span>' +
      '</div>' +
      '<div class="coms" data-coms="' + p.id + '"></div>' +
      '<div class="com-forme" data-comforme="' + p.id + '" hidden>' +
      '<input type="text" maxlength="300" placeholder="Répondre… (@ pour mentionner)">' +
      '<button class="btn btn-p btn-ico" data-com-ok="' + p.id + '">➤</button>' +
      '</div></article>';
  }

  function chargerReactions(pid) {
    // les réactions exactes ne sont pas dans le feed ; on met à jour les compteurs via l'API si besoin
    // (gardé simple : le toggle renvoie l'état)
  }
  function chargerCommentaires(pid) {
    api('feed?filtre=' + FIL).then(function (j) {
      if (!j.ok) return;
      var p = (j.posts || []).find(function (x) { return x.id === pid; });
      if (!p) return;
      var zone = document.querySelector('[data-coms="' + pid + '"]');
      if (!zone) return;
      // on ne renvoie pas le détail des commentaires dans le feed ; on garde un compteur
      var btn = document.querySelector('[data-com="' + pid + '"] .n');
      if (btn) btn.textContent = p.nb_com;
    });
  }

  function afficherFil() {
    afficherBanVerif();
    var c = $('contenu-feed');
    c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
    if (FIL === 'offres') {
      api('offres').then(function (j) {
        if (!j.ok) { c.innerHTML = '<div class="vide"><span class="g">😕</span>' + esc(j.erreur) + '</div>'; return; }
        c.innerHTML = j.offres.length
          ? j.offres.map(offreHtml).join('')
          : '<div class="vide"><span class="g">🔥</span>Pas d’offres en ce moment.<br>Nos partenaires préparent la suite !</div>';
      });
      return;
    }
    api('feed?filtre=' + FIL).then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide"><span class="g">😕</span>' + esc(j.erreur) + '</div>'; return; }
      c.innerHTML = j.posts.length
        ? j.posts.map(posterHtml).join('')
        : '<div class="vide"><span class="g">🍕</span>' +
          (FIL === 'partenaires'
            ? 'Vos partenaires partageront leurs actualités ici.'
            : 'Soyez le premier à partager un moment !') + '</div>';
    });
  }

  function offreHtml(o) {
    var rest = o.fin - Date.now() / 1000;
    var jours = Math.max(0, Math.ceil(rest / 86400));
    var img = o.photo ? '<img class="offre-img" src="' + mediaUrl(o.photo) + '" alt="">' : '';
    var pl = o.partenaire || {};
    return '<div class="offre">' + img +
      '<div class="offre-corps">' +
      '<div class="offre-p">' +
      (pl.logo ? '<img src="' + mediaUrl(pl.logo) + '" alt="">' : (pl.avatar ? '<img src="' + mediaUrl(pl.avatar) + '" alt="">' : '')) +
      '<span class="lnk" data-part="' + esc(pl.nom) + '">' + esc(pl.nom) + '</span></div>' +
      '<div class="offre-titre">' + esc(o.titre) + '</div>' +
      '<div class="offre-texte">' + esc(o.texte) + '</div>' +
      (o.code ? '<span class="offre-code">' + esc(o.code) + '</span>' : '') +
      '<div class="offre-fin">⏳ Plus que ' + jours + ' jour' + (jours > 1 ? 's' : '') + '</div>' +
      '<div class="offre-actions">' +
      '<button class="btn btn-s" data-essayer="' + o.id + '">🎯 J’essaie cette offre</button>' +
      '</div></div></div>';
  }

  // composer
  function composerAva() {
    var z = $('compo-ava');
    if (moi && moi.avatar) { z.innerHTML = '<img src="' + mediaUrl(moi.avatar) + '" alt="">'; z.style.display = ''; }
    else if (moi) { z.textContent = moi.nom.slice(0, 1).toUpperCase(); z.style.display = ''; }
    else z.style.display = 'none';
  }
  function poster() {
    var txt = $('compo-texte').value.trim();
    if (!txt) { toast('Écrivez quelque chose d’abord'); return; }
    if (!moi.verifie) { bloquerNonVerifie(); return; }
    var fd = new FormData();
    fd.append('texte', txt);
    photosLocales.forEach(function (p, i) { fd.append('photo' + i, p.file); });
    $('compo-poster').disabled = true;
    api('posts', fd, 'form').then(function (j) {
      $('compo-poster').disabled = false;
      if (!j.ok) { toast(j.erreur); return; }
      $('compo-texte').value = '';
      photosLocales = [];
      $('compo-apercu').innerHTML = '';
      toast('Publié ! +10 pts');
      afficherFil();
    });
  }
  function choisirPhotos() {
    var inp = $('compo-fich');
    inp.onchange = function () {
      photosLocales = [];
      var ap = $('compo-apercu');
      ap.innerHTML = '';
      Array.prototype.slice.call(inp.files, 0, 4).forEach(function (f) {
        var rd = new FileReader();
        rd.onload = function (ev) {
          photosLocales.push({ file: f, dataurl: ev.target.result });
          var im = document.createElement('img');
          im.src = ev.target.result;
          im.style.cssText = 'width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--trait)';
          ap.appendChild(im);
        };
        rd.readAsDataURL(f);
      });
      inp.value = '';
    };
  }

  // ---------------- interactions feed (délégation) ----------------
  function feedClick(e) {
    var t = e.target;
    var react = t.closest('.react');
    if (react) {
      var art = react.closest('.post');
      var pid = art.dataset.post;
      var emoji = react.dataset.emoji;
      if (!moi.verifie) { bloquerNonVerifie(); return; }
      api('reaction', { id: pid, emoji: emoji }, 'json').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        var z = art.querySelector('[data-reacts]');
        var chip = z.querySelector('[data-emoji="' + emoji + '"]');
        var n = chip.querySelector('.n');
        var cur = n ? (parseInt(n.textContent, 10) || 0) : 0;
        cur += j.active ? 1 : -1;
        chip.classList.toggle('actif', j.active);
        chip.innerHTML = emoji + (cur > 0 ? ' <span class="n">' + cur + '</span>' : '');
      });
      return;
    }
    var com = t.closest('[data-com]');
    if (com) {
      var f = com.closest('.post').querySelector('[data-comforme="' + com.dataset.com + '"]');
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector('input').focus();
      return;
    }
    var comOk = t.closest('[data-com-ok]');
    if (comOk) {
      if (!moi.verifie) { bloquerNonVerifie(); return; }
      var art2 = comOk.closest('.post');
      var inp = art2.querySelector('[data-comforme] input');
      var txt = inp.value.trim();
      if (!txt) return;
      api('commentaires', { id: comOk.dataset.comOk, texte: txt }, 'json').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        inp.value = '';
        toast('Commentaire envoyé +5 pts');
        var n = art2.querySelector('[data-com] .n');
        if (n) n.textContent = (parseInt(n.textContent, 10) || 0) + 1;
        afficherFil();
      });
      return;
    }
    var ph = t.closest('.post-photos img');
    if (ph) { lumiere(ph.src); return; }
    var pn = t.closest('.post-nom');
    if (pn) {
      if (pn.dataset.type === 'partenaire') ouvrirPartenaire(pn.dataset.nom);
      return;
    }
    var ess = t.closest('[data-essayer]');
    if (ess) {
      if (!moi.verifie) { bloquerNonVerifie(); return; }
      api('offres/essayer', { id: ess.dataset.essayer }, 'json').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        toast('Merci ! +15 pts — le partenaire est prévenu 🤝');
        ess.disabled = true; ess.textContent = '✓ Offre essayée';
      });
      return;
    }
    var part = t.closest('[data-part]');
    if (part) { ouvrirPartenaire(part.dataset.part); return; }
  }

  function lumiere(src) {
    var l = document.createElement('div');
    l.className = 'lumiere';
    l.innerHTML = '<img src="' + src + '" alt="">';
    l.onclick = function () { l.remove(); };
    document.body.appendChild(l);
  }

  // ---------------- PARTENAIRE (page publique) ----------------
  function ouvrirPartenaire(nom) {
    api('partenaire?nom=' + encodeURIComponent(nom)).then(function (j) {
      if (!j.ok) { toast(j.erreur); return; }
      var p = j.partenaire;
      var offers = (j.offres || []).map(offreHtml).join('') ||
        '<div class="vide" style="padding:16px">Aucune offre en cours.</div>';
      var posts = (j.posts || []).map(posterHtml).join('') ||
        '<div class="vide" style="padding:16px">Pas encore de posts.</div>';
      modale({
        icone: '', close: true,
        titre: '',
        texte: '',
        actions: [{ label: 'Fermer', cls: 'btn-s', onClick: function () {} }],
        keepOpen: true
      });
      // contenu riche dans la modale
      var zone = $('modale-zone');
      zone.innerHTML =
        '<div class="modale-bg" id="mod-bg"><div class="modale" style="position:relative">' +
        '<button class="close" id="mod-x">✕</button><div class="pad" style="text-align:left">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        avaHtml(p, 'ava-l') +
        '<div><div style="font-family:var(--font-serif);font-weight:700;font-size:20px">' + esc(p.nom) +
        '</div><div style="margin-top:4px">' + chipType('partenaire') +
        (p.niveau ? ' <span class="chip chip-niv">' + p.niveau + '</span>' : '') + '</div></div></div>' +
        (p.bio ? '<p style="font-size:14px;color:var(--gris);margin-bottom:14px">' + esc(p.bio) + '</p>' : '') +
        '<button class="btn btn-s btn-bloc" id="mod-suivre" style="margin-bottom:16px">➕ Suivre</button>' +
        '<div class="section-titre" style="margin-top:0">🔥 Offres</div>' + offers +
        '<div class="section-titre">Actualités</div>' + posts +
        '</div></div></div>';
      var bg = $('mod-bg');
      function fermer() { zone.innerHTML = ''; }
      $('mod-x').onclick = fermer;
      bg.onclick = function (e) { if (e.target === bg) fermer(); };
      $('mod-suivre').onclick = function () {
        api('suivre', { id: p.id }, 'json').then(function (r) {
          toast(r.suivi ? 'Vous suivez ' + p.nom : 'Vous ne suivez plus ' + p.nom);
        });
      };
    });
  }

  // ---------------- FIDÉLITÉ ----------------
  function carteFidHtml(c, titre) {
    var emoji = c.niveau === 'Platine' ? '💎' : (c.niveau === 'Or' ? '🥇' : (c.niveau === 'Argent' ? '🥈' : '🥉'));
    var tel = esc((c.tel || '').replace(/(\d{2})(?=\d)/g, '$1 '));
    return '<div class="carte-fid">' +
      '<div class="tete"><span class="logo">LT</span>' +
      '<div><div class="tt">' + esc(titre || 'Carte fidélité') + '</div>' +
      '<div class="nom">' + esc(c.nom || '') + '</div></div></div>' +
      '<span class="niveau">' + emoji + ' ' + esc(c.niveau) + '</span>' +
      '<div class="pts">' + (c.points || 0) + ' <small>points</small></div>' +
      '<div class="progression"><div class="barre" style="width:' + (c.progression || 0) + '%"></div></div>' +
      '<div class="reste">' + (c.prochain_niveau
        ? 'Plus que ' + c.reste + ' pts pour ' + c.prochain_niveau
        : 'Niveau maximum atteint 🏆') + '</div>' +
      '<div class="tel">' + tel + '</div></div>';
  }
  function achHtml(a) {
    return '<div class="achat-ligne"><span class="mode-badge">' +
      (a.mode === 'sur_place' ? '🍽 Sur place' : '🥡 À emporter') + '</span>' +
      '<span>' + esc(a.produits || '—') + ' · ' + hms(a.cree_le) + '</span>' +
      '<span class="m">+' + a.points + ' pts</span></div>';
  }
  function ouvrirFidelite() {
    var c = $('fid-corps');
    if (moi.type === 'client') {
      $('fid-titre').textContent = 'Ma carte fidélité';
      $('fid-sous').textContent = 'Gagnez 1 pt / € à chaque achat';
      c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
      api('fidelite/moi').then(function (j) {
        if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur) + '</div>'; return; }
        if (!j.carte) {
          c.innerHTML = '<div class="vide"><span class="g">⭐</span>Votre carte est créée ' +
            'automatiquement au premier achat enregistré au comptoir.<br>Vos points apparaîtront ici !</div>';
          return;
        }
        c.innerHTML = carteFidHtml(j.carte, 'Carte fidélité La Trattoria') +
          '<div class="stats-row">' +
          '<div class="stat"><div class="v">' + j.carte.nb_achats + '</div><div class="l">achats</div></div>' +
          '<div class="stat"><div class="v">' + (j.carte.total || 0).toFixed(0) + ' €</div><div class="l">total</div></div>' +
          '<div class="stat"><div class="v">' + j.carte.points + '</div><div class="l">points</div></div></div>' +
          (j.achats.length ? '<div class="section-titre">Derniers achats</div>' +
            '<div class="cart cart-pad" style="padding:6px 16px">' + j.achats.map(achHtml).join('') + '</div>' : '');
      });
    } else if (moi.type === 'partenaire') {
      $('fid-titre').textContent = 'Espace partenaire';
      $('fid-sous').textContent = 'Carte pro & envois de clients';
      c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
      api('pro/moi').then(function (j) {
        if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur) + '</div>'; return; }
        var pro = j.pro;
        var opts = (j.partenaires || []).map(function (p) {
          return '<option value="' + p.id + '">' + esc(p.nom) + '</option>';
        }).join('');
        var pn = niveauCalc(pro.points);
        c.innerHTML =
          carteFidHtml({ nom: moi.nom, points: pro.points, niveau: pn.nom,
            progression: pn.prog,
            prochain_niveau: pn.prochain ? pn.prochain[0] : null,
            reste: pn.prochain ? (pn.prochain[1] - pro.points) : 0,
            tel: moi.tel }, 'Carte fidélité Pro') +
          '<div class="stats-row">' +
          '<div class="stat"><div class="v">' + pro.nb_envois + '</div><div class="l">clients envoyés</div></div>' +
          '<div class="stat"><div class="v">' + pro.nb_acceptes + '</div><div class="l">acceptées</div></div>' +
          '<div class="stat"><div class="v">+25</div><div class="l">pts / envoi</div></div></div>' +
          '<div class="cart cart-pad form" style="margin-top:16px">' +
          '<div class="section-titre" style="margin-top:0">🤝 Envoyer un client à un partenaire</div>' +
          '<p class="aide">Un client veut ce que la Trattoria ne fait pas (cocktails, ' +
          'chocolaterie, hôtel…) ? Envoyez-le : <strong>la demande de réservation part ' +
          'automatiquement</strong> dans son appli, la Trattoria est prévenue, et vous ' +
          'gagnez <strong>+25 pts</strong> (et +5 si accepté).</p>' +
          '<label>Partenaire destinataire</label>' +
          '<select id="env-vers">' + (opts || '<option value="">(aucun autre partenaire)</option>') + '</select>' +
          '<label>Nom du client</label>' +
          '<input id="env-client" type="text" maxlength="60" placeholder="Ex. M. Dupont">' +
          '<label>Précisions (ce qu’il veut, nombre de personnes)</label>' +
          '<input id="env-detail" type="text" maxlength="300" placeholder="Ex. 2 cocktails, vers 21h">' +
          '<label>Quand (facultatif)</label>' +
          '<input id="env-quand" type="text" maxlength="60" placeholder="Ex. ce soir vers 21h">' +
          '<button class="btn btn-p btn-bloc" id="env-ok">Envoyer la demande (+25 pts)</button></div>' +
          '<div class="section-titre">📥 Demandes reçues</div>' +
          '<div id="fid-recus"><div class="chargement" style="padding:12px"><div class="spinner"></div></div></div>' +
          '<div class="section-titre">📤 Envoyés</div>' +
          '<div id="fid-envoyes"><div class="chargement" style="padding:12px"><div class="spinner"></div></div></div>';
        chargerEnvois();
        $('env-ok').onclick = function () {
          var vers = $('env-vers').value, client = $('env-client').value.trim(),
            detail = $('env-detail').value.trim();
          if (!vers || !client || !detail) { toast('Complétez partenaire, client et précisions'); return; }
          api('envoi', { vers_id: vers, client_nom: client, detail: detail,
            quand: $('env-quand').value.trim() }, 'json').then(function (r) {
            if (!r.ok) { toast(r.erreur); return; }
            toast('Demande envoyée ! +' + (r.points || 25) + ' pts');
            $('env-client').value = ''; $('env-detail').value = ''; $('env-quand').value = '';
            chargerEnvois();
          });
        };
      });
    } else {
      // staff
      $('fid-titre').textContent = 'Fidélité clients';
      $('fid-sous').textContent = 'Personnel — enregistrement des achats';
      c.innerHTML =
        '<div class="cart cart-pad form">' +
        '<div class="section-titre" style="margin-top:0">🧾 Enregistrer un achat (carte fidélité)</div>' +
        '<p class="aide">Sur place ou à emporter : <strong>1 pt / €</strong> (+20 au 1er achat). ' +
        'La carte du client est mise à jour immédiatement.</p>' +
        '<label>Téléphone du client</label>' +
        '<input id="ach-tel" type="tel" maxlength="15" placeholder="Ex. 06 12 34 56 78">' +
        '<label>Nom (facultatif)</label>' +
        '<input id="ach-nom" type="text" maxlength="40" placeholder="Ex. Marie Dubois">' +
        '<label>Montant (€)</label>' +
        '<input id="ach-montant" type="number" step="0.5" min="1" placeholder="Ex. 42">' +
        '<label>Mode</label>' +
        '<select id="ach-mode"><option value="sur_place">🍽 Sur place</option>' +
        '<option value="a_emporter">🥡 À emporter</option></select>' +
        '<label>Produits (facultatif)</label>' +
        '<input id="ach-produits" type="text" maxlength="200" placeholder="Ex. 2 pizzas, 1 tarte">' +
        '<button class="btn btn-p btn-bloc" id="ach-ok">Enregistrer l’achat</button></div>' +
        '<div id="ach-resultat"></div>' +
        '<div class="cart cart-pad form" style="margin-top:16px">' +
        '<div class="section-titre" style="margin-top:0">🔎 Rechercher une carte</div>' +
        '<label>Téléphone</label>' +
        '<input id="carte-tel" type="tel" maxlength="15" placeholder="Ex. 06 12 34 56 78">' +
        '<button class="btn btn-s btn-bloc" id="carte-ok">Afficher la carte</button></div>' +
        '<div id="carte-resultat"></div>' +
        '<div class="section-titre">📥 Demandes de réservation (tous partenaires)</div>' +
        '<div id="fid-recus"><div class="chargement" style="padding:12px"><div class="spinner"></div></div></div>';
      $('ach-ok').onclick = function () {
        api('fidelite/achat', { tel: $('ach-tel').value, nom: $('ach-nom').value,
          montant: parseFloat($('ach-montant').value) || 0, mode: $('ach-mode').value,
          produits: $('ach-produits').value }, 'json').then(function (r) {
          if (!r.ok) { toast(r.erreur); return; }
          $('ach-resultat').innerHTML = r.carte
            ? carteFidHtml(r.carte, 'Carte fidélité — mise à jour') : '';
          toast('Achat enregistré : +' + (r.points || 0) + ' pts');
          $('ach-montant').value = ''; $('ach-produits').value = '';
        });
      };
      $('carte-ok').onclick = function () {
        api('fidelite?tel=' + encodeURIComponent($('carte-tel').value)).then(function (r) {
          if (!r.ok) { $('carte-resultat').innerHTML = '<p class="aide" style="color:var(--danger)">' + esc(r.erreur) + '</p>'; return; }
          $('carte-resultat').innerHTML =
            (r.carte ? carteFidHtml(r.carte, 'Carte fidélité') :
              '<div class="vide" style="padding:16px">Pas encore de carte pour ce numéro.</div>') +
            (r.achats && r.achats.length ? '<div class="cart cart-pad" style="margin-top:12px;padding:6px 16px">' +
              r.achats.map(achHtml).join('') + '</div>' : '');
        });
      };
      chargerEnvois();
    }
  }
  function envoiHtml(e, peutRepondre) {
    var st = e.statut;
    return '<div class="envoi ' + st + '">' +
      '<div class="tete">' +
      (e.autre && (e.autre.logo || e.autre.avatar) ? '<img src="' + mediaUrl(e.autre.logo || e.autre.avatar) + '" alt="">' : '') +
      esc(e.de.nom) + ' → ' + esc(e.vers.nom) +
      '<span class="statut ' + st + '">' + (st === 'en_attente' ? 'En attente' : (st === 'accepte' ? 'Acceptée' : 'Refusée')) + '</span></div>' +
      '<div class="client">👤 ' + esc(e.client_nom) + '</div>' +
      '<div class="detail">' + esc(e.detail) + '</div>' +
      (e.quand ? '<div class="quand">🕐 ' + esc(e.quand) + '</div>' : '') +
      (peutRepondre && st === 'en_attente'
        ? '<div class="actions"><button class="btn btn-no" data-refuse="' + e.id + '">Refuser</button>' +
          '<button class="btn btn-ok" data-accepte="' + e.id + '">Accepter</button></div>' : '') +
      '</div>';
  }
  function chargerEnvois() {
    api('envois/recus').then(function (j) {
      var z = $('fid-recus');
      if (!z) return;
      if (!j.ok) { z.innerHTML = '<div class="vide" style="padding:16px">' + esc(j.erreur) + '</div>'; return; }
      z.innerHTML = j.envois.length
        ? j.envois.map(function (e) { return envoiHtml(e, true); }).join('')
        : '<div class="vide" style="padding:16px">Aucune demande pour l’instant.</div>';
    });
    if (moi.type === 'partenaire') {
      api('envois/envoyes').then(function (j) {
        var z = $('fid-envoyes');
        if (!z) return;
        if (!j.ok) { z.innerHTML = ''; return; }
        z.innerHTML = j.envois.length
          ? j.envois.map(function (e) { return envoiHtml(e, false); }).join('')
          : '<div class="vide" style="padding:16px">Vous n’avez pas encore envoyé de client.</div>';
      });
    }
  }

  // ---------------- GAMING ----------------
  function ouvrirGaming() {
    var c = $('gam-corps');
    c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
    api('moi').then(function (fj) {
      if (fj.ok && fj.moi) { moi = fj.moi; renderGaming(); }
    });
  }
  function renderGaming() {
    var c = $('gam-corps');
    var pts = moi.pts;
    var nv = niveauCalc(pts);
    var cur = [nv.nom, nv.seuil, nv.icone], suivan = nv.prochain, prog = nv.prog;
    api('missions').then(function (mj) {
      if (!mj.ok) { c.innerHTML = '<div class="vide">' + esc(mj.erreur) + '</div>'; return; }
      var missions = (mj.missions || []).map(function (m) {
        return '<div class="mission' + (m.fait ? ' done' : '') + '" data-mis="' + m.id + '">' +
          '<div class="ic">' + m.icone + '</div>' +
          '<div class="info"><div class="nm">' + esc(m.nom) +
          (m.fait ? ' <span class="chip chip-niv">✓</span>' : '') + '</div>' +
          '<div class="ds">' + esc(m.desc) + '</div>' +
          '<div class="bar"><div class="f" style="width:' + Math.round(100 * m.progression / m.cible) + '%"></div></div></div>' +
          (m.fait ? '' : '<button class="btn btn-ok" style="min-height:38px;font-size:12.5px" data-faire="' + m.id + '">+' + m.pts + '</button>') +
          '</div>';
      }).join('') || '<div class="vide" style="padding:16px">Aucune mission pour le moment.</div>';
      c.innerHTML =
        '<div class="niveau-hero"><div class="medal">' + cur[2] + '</div>' +
        '<div class="info"><div class="lv">' + cur[0] + ' · ' + pts + ' pts</div>' +
        '<div class="xp">' + (suivan ? 'Plus que ' + (suivan[1] - pts) + ' pts pour ' + suivan[0] : 'Niveau maximum 🏆') + '</div></div></div>' +
        '<div class="xpbar" style="margin:0"><div class="fill" style="width:' + prog + '%"></div></div>' +
        '<div class="section-titre">🎯 Missions <span class="sub">en cours</span></div>' + missions +
        '<div class="section-titre">🏅 Mes badges</div><div id="gam-badges"><div class="chargement" style="padding:10px"><div class="spinner"></div></div></div>' +
        '<div class="section-titre">🎁 Récompenses <span class="sub">échanger vos points</span></div>' +
        '<div id="gam-recomp"><div class="chargement" style="padding:10px"><div class="spinner"></div></div></div>' +
        '<button class="btn btn-s btn-bloc" id="gam-classement" style="margin-top:18px">🏆 Voir le classement des membres</button>';
      $('gam-classement').onclick = ouvrirClassement;
      // badges
      api('badges').then(function (bj) {
        var z = $('gam-badges');
        if (!z) return;
        if (!bj.ok) { z.innerHTML = ''; return; }
        z.innerHTML = '<div class="badges-grid">' + bj.badges.map(function (b) {
          return '<div class="badge' + (b.acquis ? '' : ' locked') + '"><div class="ic">' + b.icone +
            '</div><div class="nm">' + esc(b.nom) + '</div><div class="ds">' + esc(b.desc) + '</div></div>';
        }).join('') + '</div>';
      });
      // récompenses
      api('recompenses').then(function (rj) {
        var z = $('gam-recomp');
        if (!z) return;
        if (!rj.ok) { z.innerHTML = ''; return; }
        z.innerHTML = rj.recompenses.map(function (r) {
          var ok = pts >= r.cout;
          return '<div class="reward"><div class="ic">' + r.icone + '</div>' +
            '<div class="info"><div class="nm">' + esc(r.nom) + '</div><div class="ds">' + esc(r.desc) + '</div></div>' +
            '<div style="text-align:right"><div class="cout">' + r.cout + ' pts</div>' +
            '<button class="btn ' + (ok ? 'btn-p' : 'btn-no') + '" style="min-height:38px;font-size:12.5px;margin-top:6px" ' +
            (ok ? 'data-reward="' + r.id + '"' : 'disabled') + '>' + (ok ? 'Échanger' : 'Points insuffisants') + '</button></div></div>';
        }).join('');
      });
      // boutons missions
      c.querySelectorAll('[data-faire]').forEach(function (b) {
        b.onclick = function () {
          api('mission', { id: b.dataset.faire }, 'json').then(function (r) {
            if (!r.ok) { toast(r.erreur); return; }
            moi.pts += r.pts;
            toast('Mission accomplie ! +' + r.pts + ' pts');
            ouvrirGaming();
          });
        };
      });
      // boutons récompenses
      c.querySelectorAll('[data-reward]').forEach(function (b) {
        b.onclick = function () {
          api('recompense', { reward_id: b.dataset.reward }, 'json').then(function (r) {
            if (!r.ok) { toast(r.erreur); return; }
            moi.pts -= r.cout;
            toast('✓ ' + r.reward + ' — présentez ce message au comptoir');
            ouvrirGaming();
          });
        };
      });
    });
  }

  function ouvrirClassement() {
    ouvrirVueSuper('vue-classement');
    var c = $('cl-corps');
    c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
    api('classement').then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur) + '</div>'; return; }
      if (!j.classement.length) {
        c.innerHTML = '<div class="vide"><span class="g">🏆</span>Pas encore de membre au classement.<br>' +
          'Activez « apparaître au classement » dans votre profil pour y figurer.</div>';
        return;
      }
      c.innerHTML = j.classement.map(function (x, i) {
        return '<div class="classe-row r' + (i + 1) + (x.moi ? ' moi' : '') + '">' +
          '<div class="rang">' + (i + 1) + '</div>' + avaHtml(x, 'ava-m') +
          '<div class="id"><div class="nm">' + esc(x.nom) + ' ' + chipType(x.type) + '</div>' +
          '<div style="font-size:12px;color:var(--gris2)">' + x.niveau + '</div></div>' +
          '<div class="pt">' + x.pts + ' pts</div></div>';
      }).join('');
    });
  }

  // ---------------- MESSAGES ----------------
  function ouvrirMessages() {
    var c = $('msg-corps');
    if (msgAvec) { chargerConv(); return; }
    c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
    api('membres').then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur) + '</div>'; return; }
      c.innerHTML = j.membres.length
        ? j.membres.map(function (m) {
          return '<div class="ligne-m" data-avec="' + m.id + '">' + avaHtml(m, 'ava-m') +
            '<div class="info"><div class="nm">' + esc(m.nom) + ' ' + chipType(m.type) + '</div>' +
            '<div class="sub">' +
            (m.type === 'partenaire' ? 'Partenaire' : (m.type === 'staff' ? '⭐ Staff — messagerie instantanée' : 'Membre')) +
            ' · ' + m.niveau + ' · ' + m.pts + ' pts</div></div></div>';
        }).join('')
        : '<div class="vide"><span class="g">✉️</span>Aucun autre membre pour l’instant.</div>';
    });
  }
  function chargerConv() {
    var c = $('msg-corps');
    c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
    api('messages/lire', { avec: msgAvec }, 'json').then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur) + '</div>'; return; }
      c.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0 10px">' +
        '<button class="btn btn-s" id="conv-retour" style="min-height:40px">←</button>' +
        '<span class="nm" style="font-weight:700" id="conv-nom"></span></div>' +
        '<div class="msgs" id="conv-msgs"></div>' +
        '<div class="msg-saisie"><input type="text" maxlength="500" placeholder="Écrire un message…" id="msg-inp">' +
        '<button class="btn btn-p btn-ico" id="msg-env">➤</button></div>';
      $('conv-retour').onclick = function () { msgAvec = null; ouvrirMessages(); };
      function envoyer() {
        if (!moi.verifie) { bloquerNonVerifie(); return; }
        var inp = $('msg-inp'), txt = inp.value.trim();
        if (!txt) return;
        inp.value = '';
        api('messages', { vers: msgAvec, texte: txt }, 'json').then(function (r) {
          if (!r.ok) { toast(r.erreur); return; }
          chargerConv();
        });
      }
      $('msg-env').onclick = envoyer;
      $('msg-inp').onkeydown = function (e) { if (e.key === 'Enter') envoyer(); };
      var box = $('conv-msgs');
      (j.messages || []).forEach(function (m) {
        var d = document.createElement('div');
        d.className = 'msg ' + (m.de === moi.id ? 'moi' : 'autrui');
        d.innerHTML = esc(m.texte) + '<span class="h">' + hmsFull(m.cree_le) + '</span>';
        box.appendChild(d);
      });
      box.scrollTop = box.scrollHeight;
      // nom
      api('membres').then(function (r) {
        var m = (r.membres || []).find(function (x) { return x.id === msgAvec; });
        $('conv-nom').textContent = m ? m.nom : '';
      });
    });
  }

  // ---------------- PROFIL ----------------
  function ouvrirProfil() {
    var c = $('prof-corps');
    var estStaff = moi.type === 'staff';
    var estPro = moi.type === 'partenaire';
    c.innerHTML =
      '<div class="cart cart-pad" style="display:flex;align-items:center;gap:14px">' +
      '<div style="position:relative">' +
      (moi.avatar ? '<div class="ava ava-l"><img src="' + mediaUrl(moi.avatar) + '" alt=""></div>' :
        '<div class="ava ava-l">' + esc(moi.nom.slice(0, 1).toUpperCase()) + '</div>') +
      '<label class="btn btn-s" style="position:absolute;bottom:-6px;right:-4px;font-size:12px;min-height:0;padding:6px 9px">📷' +
      '<input type="file" id="prof-ava-fich" accept="image/*" hidden></label></div>' +
      '<div style="flex:1;min-width:0"><div style="font-family:var(--font-serif);font-weight:700;font-size:19px">' +
      esc(moi.nom) + '</div>' +
      '<div style="margin-top:5px">' + chipType(moi.type) +
      ' <span class="chip chip-niv">' + moi.pts + ' pts</span></div>' +
      '<div style="font-size:12.5px;color:var(--gris2);margin-top:6px">📞 ' + esc(moi.tel) + '</div></div></div>' +
      (!moi.verifie && !estStaff ? '<div class="ban-verif" style="margin-top:14px">' +
      '<span style="font-size:20px">🪪</span><span><span class="b">En attente de validation.</span> ' +
      'Présentez cette page au comptoir.</span><button id="prof-verif-btn">Détails</button></div>' : '') +
      (estPro ? '<div class="cart cart-pad form" style="margin-top:16px">' +
      '<div class="section-titre" style="margin-top:0">Mon logo</div>' +
      '<div style="display:flex;gap:12px;align-items:center">' +
      (moi.logo ? '<img src="' + mediaUrl(moi.logo) + '" style="width:64px;height:64px;object-fit:contain;border:1px solid var(--trait);border-radius:10px">' : '') +
      '<label class="btn btn-s" style="min-height:42px">Changer le logo<input type="file" id="prof-logo-fich" accept="image/*" hidden></label></div></div>' : '') +
      '<div class="cart cart-pad form" style="margin-top:16px">' +
      '<div class="section-titre" style="margin-top:0">Ma présentation</div>' +
      '<textarea id="prof-bio" rows="2" maxlength="300" placeholder="Qui êtes-vous ?">' + esc(moi.bio || '') + '</textarea>' +
      '<button class="btn btn-s btn-bloc" id="prof-bio-ok" style="margin-top:12px">Enregistrer</button></div>' +
      '<div class="cart cart-pad" style="margin-top:16px">' +
      '<div class="section-titre" style="margin-top:0">⚙️ Consentements & notifications</div>' +
      '<div id="consent-zone"><div class="chargement" style="padding:10px"><div class="spinner"></div></div></div></div>' +
      '<div class="cart" style="margin-top:16px">' +
      '<button class="btn btn-bloc" id="prof-badges" style="border-radius:0">🏅 Mes badges</button>' +
      '<button class="btn btn-bloc" id="prof-classement" style="border-radius:0">🏆 Mon rang au classement</button>' +
      (estStaff ? '<button class="btn btn-bloc" id="prof-validation" style="border-radius:0;border-top:1px solid var(--trait)">🪪 Valider un membre (personnel)</button>' : '') +
      '<button class="btn btn-bloc" id="prof-out" style="border-radius:0;border-top:1px solid var(--trait);color:var(--danger)">Se déconnecter</button></div>';
    // handlers
    if (!moi.verifie && !estStaff) {
      var bv = $('prof-verif-btn');
      if (bv) bv.onclick = modaleValidation;
    }
    $('prof-ava-fich').onchange = function () {
      if (!this.files[0]) return;
      var fd = new FormData(); fd.append('avatar', this.files[0]);
      api('avatar', fd, 'form').then(function (r) {
        if (!r.ok) { toast(r.erreur); return; }
        moi.avatar = r.avatar; composerAva(); ouvrirProfil();
      });
    };
    if (estPro) {
      var lf = $('prof-logo-fich');
      if (lf) lf.onchange = function () {
        if (!this.files[0]) return;
        var fd = new FormData(); fd.append('logo', this.files[0]);
        api('logo', fd, 'form').then(function (r) {
          if (!r.ok) { toast(r.erreur); return; }
          moi.logo = r.logo; ouvrirProfil();
        });
      };
    }
    $('prof-bio-ok').onclick = function () {
      api('bio', { bio: $('prof-bio').value }, 'json').then(function (r) {
        if (!r.ok) { toast(r.erreur); return; }
        moi.bio = $('prof-bio').value; toast('Présentation enregistrée');
      });
    };
    $('prof-badges').onclick = function () {
      api('badges').then(function (bj) {
        if (!bj.ok) { toast(bj.erreur); return; }
        var s = bj.badges.filter(function (b) { return b.acquis; });
        modale({ icone: '🏅', titre: s.length + ' badge' + (s.length > 1 ? 's' : '') + ' débloqué' + (s.length > 1 ? 's' : ''),
          texte: s.length ? s.map(function (b) { return b.icone + ' ' + b.nom; }).join('<br>') : 'Aucun badge pour l’instant — complétez des missions !',
          actions: [{ label: 'Fermer', cls: 'btn-p' }] });
      });
    };
    $('prof-classement').onclick = ouvrirClassement;
    if (estStaff) $('prof-validation').onclick = ouvrirValidation;
    $('prof-out').onclick = function () { api('deconnexion').then(seDeconnecter); };
    // consentement
    api('consent').then(function (r) {
      var z = $('consent-zone');
      if (!z) return;
      var cons = r.consent || {};
      var def = cons.notifs_son !== false;
      z.innerHTML =
        switchHtml('classement', 'Apparaître au classement', 'Votre nom et vos points peuvent figurer au classement public (opt-in).',
          !!cons.classement) +
        switchHtml('offres_contact', 'Être contacté (offres & mentions)', 'Autoriser les partenaires et la Trattoria à vous mentionner / vous contacter.',
          !!cons.offres_contact) +
        switchHtml('notifs_son', 'Sons & vibrations', 'Retours sonores et vibrations pour les messages et demandes.',
          def);
      z.querySelectorAll('.switch').forEach(function (sw) {
        sw.onclick = function () {
          var on = !sw.classList.contains('on');
          sw.classList.toggle('on', on);
          api('consent', { [sw.dataset.cle]: on }, 'json').then(function (r) {
            if (r.ok) moi.consent = r.consent; else sw.classList.toggle('on', !on);
          });
        };
      });
    });
  }
  function switchHtml(cle, nm, ds, on) {
    return '<div class="switch-row"><div class="info"><div class="nm">' + esc(nm) + '</div>' +
      '<div class="ds">' + esc(ds) + '</div></div>' +
      '<button class="switch' + (on ? ' on' : '') + '" data-cle="' + cle + '" aria-label="' + esc(nm) + '"></button></div>';
  }

  // ---------------- VALIDATION (staff) ----------------
  function ouvrirValidation() {
    ouvrirVueSuper('vue-validation');
    var c = $('val-corps');
    c.innerHTML = '<div class="chargement"><div class="spinner"></div></div>';
    api('verification').then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur) + '</div>'; return; }
      var list = j.en_attente || [];
      c.innerHTML = list.length
        ? '<p class="aide" style="margin-bottom:14px">Validez les membres au comptoir (présentation de cette page ou du numéro). ' +
          'La validation débloque instantanément leurs services.</p>' +
          list.map(function (m) {
            return '<div class="cart cart-pad" style="display:flex;align-items:center;gap:12px;margin-top:12px">' +
              '<div class="ava ava-m">' + esc(m.nom.slice(0, 1).toUpperCase()) + '</div>' +
              '<div style="flex:1;min-width:0"><div style="font-weight:700">' + esc(m.nom) + '</div>' +
              '<div style="font-size:12.5px;color:var(--gris2)">' +
              (m.type === 'partenaire' ? 'Partenaire' : 'Client') + ' · 📞 ' + esc(m.tel) + '</div></div>' +
              '<button class="btn btn-ok" style="min-height:42px" data-valider="' + m.id + '">✓ Valider</button></div>';
          }).join('')
        : '<div class="vide"><span class="g">✅</span>Aucun membre en attente de validation.</div>';
      c.querySelectorAll('[data-valider]').forEach(function (b) {
        b.onclick = function () {
          api('verifier', { user_id: b.dataset.valider }, 'json').then(function (r) {
            if (!r.ok) { toast(r.erreur); return; }
            toast('Membre validé ✓');
            ouvrirValidation();
          });
        };
      });
    });
  }

  // ---------------- TEMPS RÉEL ----------------
  function traiterEvenement(ev) {
    var d = ev.data || {};
    var dNom = d.de || '';
    if (ev.type === 'reservation') {
      son('reservation');
      alerte('Nouvelle demande : ' + dNom + ' envoie le client « ' + (d.client || '') + ' » — ' +
        (d.detail || ''), 'reservation', '📨', function () { naviguer('fidelite'); }, 'Voir');
    } else if (ev.type === 'accepte') {
      son('accepte');
      alerte('« ' + (d.client || '') + ' » accepté par ' + (d.vers || ''), 'ok', '✅',
        function () { naviguer('fidelite'); }, 'Voir');
    } else if (ev.type === 'refuse') {
      son('refuse');
      alerte('Demande refusée par ' + (d.vers || ''), 'info', '❌',
        function () { naviguer('fidelite'); }, 'Voir');
    } else if (ev.type === 'envoi') {
      son('message');
      alerte((d.de || '') + ' → ' + (d.vers || '') + ' : client « ' + (d.client || '') + ' »',
        'info', 'ℹ️', function () { naviguer('fidelite'); }, 'Voir');
    } else if (ev.type === 'achat') {
      son('achat');
      alerte('+' + (d.points || 0) + ' points fidélité (' +
        (d.mode === 'sur_place' ? 'sur place' : 'à emporter') + ')', 'ok', '⭐',
        function () { naviguer('fidelite'); }, 'Voir');
    } else if (ev.type === 'badge') {
      son('badge');
      celebration('Badge débloqué !', d.nom || '', d.icone || '🏅');
    } else if (ev.type === 'mention') {
      son('message');
      alerte(dNom + ' ' + (d.texte || 'vous a mentionné'), 'message', '✉️',
        function () { naviguer('messages'); }, 'Voir');
    }
  }
  function pollRealtime() {
    clearTimeout(window._rt);
    window._rt = setTimeout(function () {
      if (!moi) return;
      api('realtime').then(function (j) {
        if (j.ok) {
          var evts = j.evenements || [];
          for (var i = evts.length - 1; i >= 0; i--) traiterEvenement(evts[i]);
          var nb = j.nb_messages || 0;
          var badge = $('nb-msg-badge');
          if (badge) {
            if (nb > 0 && $('vue-messages').hidden) { badge.textContent = nb; badge.hidden = false; }
            else badge.hidden = true;
          }
        }
        pollRealtime();
      });
    }, 5000);
  }

  // ---------------- démarrage ----------------
  document.querySelector('.nav').addEventListener('click', function (e) {
    var b = e.target.closest('.nav-b');
    if (b) naviguer(b.dataset.nav);
  });
  $('tabs-fil').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    FIL = b.dataset.fil;
    this.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('actif', x === b); });
    afficherFil();
  });
  $('contenu-feed').addEventListener('click', feedClick);
  $('fid-corps').addEventListener('click', function (e) {
    var acc = e.target.closest('[data-accepte]');
    var ref = e.target.closest('[data-refuse]');
    if (!acc && !ref) return;
    var id = acc ? acc.dataset.accepte : ref.dataset.refuse;
    api('envois/repondre', { id: id, statut: acc ? 'accepte' : 'refuse' }, 'json').then(function (j) {
      if (!j.ok) { toast(j.erreur); return; }
      toast(acc ? 'Demande acceptée ✅' : 'Demande refusée');
      chargerEnvois();
    });
  });
  $('cl-retour').onclick = function () { naviguer('accueil'); };
  $('val-retour').onclick = function () { naviguer('profil'); };
  $('btn-classement').onclick = ouvrirClassement;
  $('compo-poster').onclick = poster;
  choisirPhotos();
  document.body.addEventListener('click', function (e) {
    var l = e.target.closest('.lumiere');
    if (l) l.remove();
  });
  // composer
  composerAva();

  if (jeton) {
    charger();
  } else {
    $('ecran-auth').hidden = false;
  }

  // boutons auth
  var modeInsc = false;
  $('a-ok').onclick = function () {
    if (modeInsc) { modeInsc = false; $('a-insc-box').hidden = true; $('a-ok').textContent = 'Se connecter'; return; }
    api('connexion', { tel: $('a-tel').value, mdp: $('a-mdp').value }, 'json').then(function (j) {
      if (!j.ok) { $('a-err').textContent = j.erreur; return; }
      $('a-err').textContent = '';
      jeton = j.jeton;
      localStorage.setItem('communaute_jeton', jeton);
      charger();
    });
  };
  $('a-insc').onclick = function (e) {
    e.preventDefault();
    modeInsc = true;
    $('a-insc-box').hidden = false;
    $('a-ok').textContent = '← Connexion existante';
  };
  $('a-insc-ok').onclick = function () {
    api('inscription', { nom: $('a-nom').value, tel: $('a-tel').value,
      mdp: $('a-mdp').value, partenaire: $('a-part').checked }, 'json').then(function (j) {
      if (!j.ok) { $('a-err').textContent = j.erreur; return; }
      $('a-err').textContent = '';
      jeton = j.jeton;
      localStorage.setItem('communaute_jeton', jeton);
      charger();
    });
  };
})();
