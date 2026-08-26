/* ============================================================
   La Trattoria — Communauté (app.js)
   Aucune dépendance : fonctionne sur le Wi-Fi du restaurant.
   ============================================================ */
(function () {
  'use strict';

  // ---------------- état ----------------
  var moi = null;                 // mon compte
  var jeton = localStorage.getItem('communaute_jeton') || '';
  var FIL = 'tous';
  var photosLocales = [];         // {file, dataurl}
  var msgAvec = null;             // conversation ouverte (id membre)

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
               '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hms(t) {
    var d = new Date(t * 1000), a = new Date();
    if (d.toDateString() === a.toDateString())
      return d.toTimeString().slice(0, 5);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  function avaHtml(a, cls) {
    cls = cls || 'ava';
    if (a && a.avatar)
      return '<img class="' + cls + '" src="' + a.avatar + '" alt="">';
    if (a && a.logo)
      return '<img class="' + cls + '" src="' + a.logo + '" alt="" style="border-radius:10px">';
    return '<span class="' + cls + '" style="display:flex;align-items:center;' +
      'justify-content:center;font-weight:bold;color:var(--gris)">' +
      esc((a && a.nom || '?').slice(0, 1).toUpperCase()) + '</span>';
  }
  function niveau(nom, pts) {
    var niv = pts >= 500 ? 'Or' : (pts >= 150 ? 'Argent' : 'Bronze');
    return '<span class="badge niv" title="Points : ' + pts + '">' +
      (pts >= 500 ? '🥇' : (pts >= 150 ? '🥈' : '🥉')) + ' ' + niv + '</span>';
  }

  // ---------------- API ----------------
  function api(path, data, ctype) {
    var opts = { method: data ? 'POST' : 'GET',
      headers: { 'X-Requested-With': 'communaute' } };
    if (jeton) opts.headers['X-Jeton'] = jeton;
    if (ctype === 'json' && data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    } else if (ctype === 'form' && data) {
      opts.body = data; // FormData
    }
    return fetch('/api/' + path, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (j) {
        if (j.ok === false && r.status === 401 && !path.match(/connexion|inscription/)) {
          seDeconnecter();
        }
        return j;
      });
    }).catch(function () {
      return { ok: false, erreur: 'Hors du réseau du restaurant ?' };
    });
  }

  // ---------------- auth ----------------
  function seDeconnecter() {
    jeton = '';
    localStorage.removeItem('communaute_jeton');
    moi = null;
    $('app').hidden = true;
    $('vue-messages').hidden = true;
    $('vue-profil').hidden = true;
    $('vue-partenaire').hidden = true;
    $('vue-fidelite').hidden = true;
    clearTimeout(window._rt);
    var b2 = $('nb-msg-badge'); if (b2) b2.hidden = true;
    $('ecran-auth').hidden = false;
  }
  function apresConnexion() {
    $('ecran-auth').hidden = true;
    $('app').hidden = false;
    $('a-err').textContent = '';
    charger();
  }
  function charger() {
    api('moi').then(function (j) {
      if (!j.ok || !j.moi) { seDeconnecter(); return; }
      moi = j.moi;
      var bp = $('btn-profil');
      bp.innerHTML = moi.avatar
        ? '<img src="' + moi.avatar + '" alt="">'
        : (moi.nom || '?').slice(0, 1).toUpperCase();
      $('compo-avatar').src = moi.avatar || '';
      $('compo-avatar').hidden = !moi.avatar;
      $('compo').hidden = false;
      $('compo-pts').textContent = '★ ' + moi.pts + ' pts';
      afficherFil();
      pollNouveaux();
      pollRealtime();
      if (moi.type === 'staff') {
        var bp = $('btn-profil');
        bp.innerHTML = '<span style="font-size:20px">🍕</span>';
      }
    });
  }
  function pollNouveaux() {
    if (!moi) return;
    api('messages/lire', { avec: '' }, 'json').catch(function () {});
    // comptage simple : on relance toutes les 45 s
    clearTimeout(window._poll);
    window._poll = setTimeout(function () {
      api('moi').then(function (j) {
        if (j.ok && j.moi) {
          if (j.moi.pts !== moi.pts) {
            moi = j.moi;
            $('compo-pts').textContent = '★ ' + moi.pts + ' pts';
          }
        }
        pollNouveaux();
      });
    }, 45000);
  }

  $('a-ok').addEventListener('click', function () {
    api('connexion', { tel: $('a-tel').value, mdp: $('a-mdp').value }, 'json')
      .then(function (j) {
        if (!j.ok) { $('a-err').textContent = j.erreur; return; }
        jeton = j.jeton;
        localStorage.setItem('communaute_jeton', jeton);
        apresConnexion();
      });
  });
  $('a-insc').addEventListener('click', function (e) {
    e.preventDefault();
    $('a-insc-box').hidden = false;
    $('a-ok').textContent = "J'ai un compte";
  });
  $('a-ok').addEventListener('click', function () {
    if (!$('a-insc-box').hidden) {
      $('a-insc-box').hidden = true;
      $('a-ok').textContent = 'Se connecter';
    }
  });
  $('a-insc-ok').addEventListener('click', function () {
    api('inscription', {
      nom: $('a-nom').value, tel: $('a-tel').value, mdp: $('a-mdp').value,
      partenaire: $('a-part').checked
    }, 'json').then(function (j) {
      if (!j.ok) { $('a-err').textContent = j.erreur; return; }
      jeton = j.jeton;
      localStorage.setItem('communaute_jeton', jeton);
      $('a-err').textContent = '';
      apresConnexion();
      if (moi && moi.type === 'partenaire')
        setTimeout(function () { ouvrirProfil(); }, 800);
    });
  });

  // ---------------- fil ----------------
  function posterCard(p) {
    var a = p.auteur || {};
    var photos = (p.photos || []).map(function (u, i) {
      return '<img src="' + u + '" loading="lazy" alt="" data-photo="' + i + '">';
    }).join('');
    var nbPh = (p.photos || []).length;
    return '<article class="post" data-post="' + p.id + '">' +
      '<div class="post-tete">' +
      avaHtml(a, 'post-ava') +
      '<div><div class="post-nom" data-nom="' + esc(a.nom) + '" data-type="' + (a.type || '') + '">' +
        esc(a.nom) + '</div>' +
      '<div class="post-meta">' +
        (a.type === 'partenaire' ? '<span class="badge part">Partenaire</span>' : '') +
        niveau(a.nom, a.pts || 0) +
        '<span>' + hms(p.cree_le) + '</span></div></div>' +
      '<span class="flex1"></span></div>' +
      '<div class="post-texte">' + esc(p.texte) + '</div>' +
      (photos ? '<div class="post-photos' + (nbPh === 1 ? ' one' : '') + '">' + photos + '</div>' : '') +
      '<div class="post-actions">' +
        '<button class="act like' + (p.like_par_moi ? ' liked' : '') + '" data-id="' + p.id + '">' +
          (p.like_par_moi ? '♥' : '♡') + ' <span class="n">' + (p.nb_likes || '') + '</span></button>' +
        '<button class="act com" data-id="' + p.id + '">💬 <span class="n">' + (p.nb_com || 0) + '</span></button>' +
      '</div><div class="post-coms"></div>' +
      '<div class="com-forme" hidden>' +
        '<input type="text" maxlength="300" placeholder="Répondre…" data-com-input="' + p.id + '">' +
        '<button class="btn btn-p" data-com-ok="' + p.id + '">OK</button>' +
      '</div></article>';
  }

  function offreCard(o) {
    var img = o.photo
      ? '<img class="offre-img" src="' + o.photo + '" alt="">' : '';
    var rest = o.fin - Date.now() / 1000;
    var jours = Math.max(0, Math.ceil(rest / 86400));
    return '<div class="offre">' + img +
      '<div class="offre-corps">' +
      '<div class="offre-p"><img src="' + (o.partenaire.logo || o.partenaire.avatar || 'icones/icone-192.png') +
        '" alt="" data-partenaire="' + esc(o.partenaire.nom) + '">' +
      '<span class="lien-part" data-partenaire="' + esc(o.partenaire.nom) + '">' +
        esc(o.partenaire.nom) + '</span></div>' +
      '<div class="offre-titre">' + esc(o.titre) + '</div>' +
      '<div class="offre-texte">' + esc(o.texte) + '</div>' +
      (o.code ? '<span class="offre-code">' + esc(o.code) + '</span>' : '') +
      '<div class="offre-fin">⏳ Plus que ' + jours + ' jour' + (jours > 1 ? 's' : '') + '</div>' +
      '</div></div>';
  }

  function afficherFil() {
    var c = $('contenu');
    if (FIL === 'offres') {
      c.innerHTML = '<div class="chargement">Chargement des offres…</div>';
      api('offres').then(function (j) {
        if (!j.ok) { c.innerHTML = '<div class="vide">Oups…</div>'; return; }
        c.innerHTML = j.offres.length
          ? j.offres.map(offreCard).join('')
          : '<div class="vide"><span class="g">🔥</span>Pas d’offres en ce moment.<br>' +
            'Nos partenaires préparent la suite !</div>';
      });
      return;
    }
    c.innerHTML = '<div class="chargement">Chargement…</div>';
    api('feed?filtre=' + FIL).then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">Oups…</div>'; return; }
      c.innerHTML = j.posts.length
        ? j.posts.map(posterCard).join('')
        : '<div class="vide"><span class="g">🍕</span>Aucun post pour l’instant.<br>' +
          (FIL === 'partenaires'
            ? 'Nos partenaires partageront leurs actualités ici.'
            : 'Soyez le premier à partager un moment !') + '</div>';
    });
  }

  $('onglets-fil').addEventListener('click', function (e) {
    var b = e.target.closest('.onglet');
    if (!b) return;
    FIL = b.dataset.fil;
    this.querySelectorAll('.onglet').forEach(function (x) {
      x.classList.toggle('actif', x === b);
    });
    afficherFil();
  });

  // interactions sur le fil
  $('contenu').addEventListener('click', function (e) {
    var t = e.target;
    var like = t.closest('.act.like');
    if (like) {
      api('like', { id: like.dataset.id }, 'json').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        like.classList.toggle('liked', j.like);
        like.firstChild ? null : null;
        var n = like.querySelector('.n');
        var cur = parseInt(n.textContent || '0', 10) || 0;
        n.textContent = cur + (j.like ? 1 : -1);
        like.innerHTML = (j.like ? '♥' : '♡') + ' <span class="n">' + n.textContent + '</span>';
      });
      return;
    }
    var com = t.closest('.act.com');
    if (com) {
      var f = com.closest('.post').querySelector('.com-forme');
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector('input').focus();
      chargerCommentaires(com.dataset.id);
      return;
    }
    var comOk = t.closest('[data-com-ok]');
    if (comOk) {
      var post = comOk.closest('.post');
      var inp = post.querySelector('[data-com-input]');
      var txt = inp.value.trim();
      if (!txt) return;
      api('commentaires', { id: comOk.dataset.comOk, texte: txt }, 'json').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        if (j.pts) { moi.pts += j.pts; $('compo-pts').textContent = '★ ' + moi.pts + ' pts'; }
        inp.value = '';
        chargerCommentaires(comOk.dataset.comOk);
        afficherFil();
      });
      return;
    }
    var ph = t.closest('img[data-photo]');
    if (ph) { lumiere(ph.src); return; }
    var pn = t.closest('.post-nom');
    if (pn) {
      if (pn.dataset.type === 'partenaire') ouvrirPartenaire(pn.dataset.nom);
      return;
    }
    var pa = t.closest('.post-ava');
    if (pa) return;
    var lp = t.closest('[data-partenaire]');
    if (lp && lp.dataset.partenaire) { ouvrirPartenaire(lp.dataset.partenaire); return; }
  });

  function chargerCommentaires(pid) {
    // les commentaires sont rechargés via le feed complet (simple et fiable)
    api('feed?filtre=' + FIL).then(function (j) {
      if (!j.ok) return;
      var p = (j.posts || []).find(function (x) { return x.id === pid; });
      if (p) {
        var art = document.querySelector('.post[data-post="' + pid + '"]');
        if (art) {
          var nb = art.querySelector('.act.com .n');
          if (nb) nb.textContent = p.nb_com;
        }
      }
    });
  }

  // ---------------- composer un post ----------------
  $('compo-fich').addEventListener('change', function () {
    photosLocales = [];
    var ap = $('compo-apercu');
    ap.innerHTML = '';
    var fichiers = Array.prototype.slice.call(this.files, 0, 4);
    fichiers.forEach(function (f) {
      var rd = new FileReader();
      rd.onload = function (ev) {
        photosLocales.push({ file: f, dataurl: ev.target.result });
        var im = document.createElement('img');
        im.src = ev.target.result;
        ap.appendChild(im);
      };
      rd.readAsDataURL(f);
    });
    this.value = '';
  });
  $('compo-poster').addEventListener('click', function () {
    var txt = $('compo-texte').value.trim();
    if (!txt) { toast('Écrivez quelque chose d’abord !'); return; }
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
      if (j.pts) {
        moi.pts += j.pts;
        $('compo-pts').textContent = '★ ' + moi.pts + ' pts';
        toast('Publié ! +' + j.pts + ' points');
      } else toast('Publié !');
      afficherFil();
    });
  });

  // ---------------- messages ----------------
  function ouvrirMessages() {
    $('app').hidden = true;
    $('vue-messages').hidden = false;
    api('membres').then(function (j) {
      var c = $('msg-corps');
      if (!j.ok) { c.innerHTML = '<div class="vide">Oups…</div>'; return; }
      c.innerHTML = j.membres.length
        ? j.membres.map(function (m) {
          return '<div class="msg-ligne" data-avec="' + m.id + '">' +
            avaHtml(m) +
            '<div style="flex:1;min-width:0"><div class="mn">' + esc(m.nom) + '</div>' +
            '<div class="mp">' +
            (m.type === 'partenaire' ? 'Partenaire'
             : (m.type === 'staff' ? '⭐ Staff — messagerie instantanée' : 'Membre')) +
            ' · ' + niveau(m.nom, m.pts || 0) + '</div></div></div>';
        }).join('')
        : '<div class="vide"><span class="g">✉</span>Aucun autre membre pour l’instant.</div>';
    });
  }
  $('msg-corps').addEventListener('click', function (e) {
    var l = e.target.closest('.msg-ligne');
    if (!l) return;
    msgAvec = l.dataset.avec;
    chargerConv();
  });
  function chargerConv() {
    var c = $('msg-corps');
    api('messages/lire', { avec: msgAvec }, 'json').then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">Oups…</div>'; return; }
      var noms = {};
      c.innerHTML = '<div class="conv"><div class="conv-tete">' +
        '<button class="btn btn-s" id="conv-retour">← Tous les membres</button>' +
        '<span class="n"></span></div><div class="msgs"></div>' +
        '<div class="msg-saisie"><input type="text" maxlength="500" ' +
        'placeholder="Écrire un message…" id="msg-inp">' +
        '<button class="btn btn-p" id="msg-env">Envoyer</button></div></div>';
      c.querySelector('.n').textContent = '';
      var msgs = c.querySelector('.msgs');
      (j.messages || []).forEach(function (m) {
        var d = document.createElement('div');
        d.className = 'msg ' + (m.de === moi.id ? 'moi' : 'autrui');
        d.innerHTML = esc(m.texte) +
          '<span class="h">' + hms(m.cree_le) + '</span>';
        msgs.appendChild(d);
      });
      msgs.scrollTop = msgs.scrollHeight;
      function envoyer() {
        var inp = $('msg-inp');
        var txt = inp.value.trim();
        if (!txt) return;
        inp.value = '';
        api('messages', { vers: msgAvec, texte: txt }, 'json').then(function (r) {
          if (!r.ok) { toast(r.erreur); return; }
          chargerConv();
        });
      }
      $('msg-env').addEventListener('click', envoyer);
      $('msg-inp').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') envoyer();
      });
      $('conv-retour').addEventListener('click', ouvrirMessages);
      // nom du destinataire
      api('membres').then(function (r2) {
        var m = (r2.membres || []).find(function (x) { return x.id === msgAvec; });
        c.querySelector('.conv-tete .n').textContent = m ? m.nom : '—';
      });
    });
  }
  $('btn-notifs').addEventListener('click', ouvrirMessages);
  $('msg-retour').addEventListener('click', function () {
    $('vue-messages').hidden = true;
    $('app').hidden = false;
  });

  // ---------------- profil ----------------
  function ouvrirProfil() {
    $('vue-profil').hidden = false;
    $('app').hidden = true;
    var estPart = moi.type === 'partenaire';
    $('prof-titre').textContent = estPart ? 'Mon espace partenaire' : 'Mon profil';
    var c = $('prof-corps');
    c.innerHTML =
      '<div class="prof-hero">' +
      '<div style="position:relative">' +
      '<img class="prof-ava" id="prof-ava-img" src="' + (moi.avatar || '') + '" alt="" ' +
        (moi.avatar ? '' : 'style="display:none"') + '>' +
      '<label class="btn btn-s btn-fich" style="position:absolute;bottom:-8px;right:-4px;' +
        'font-size:12px;padding:5px 8px;min-height:0">📷<input type="file" id="prof-ava-fich" ' +
        'accept="image/*" hidden></label></div>' +
      '<div><div class="prof-nom">' + esc(moi.nom) + '</div>' +
      '<div class="prof-meta post-meta">' +
      (estPart ? '<span class="badge part">Partenaire</span>' : '<span class="badge">Client</span>') +
      ' ' + niveau(moi.nom, moi.pts) + '</div>' +
      '<div class="prof-bio" id="prof-bio-txt">' + esc(moi.bio || 'Votre petite présentation…') +
      '</div></div></div>' +
      '<div class="prof-sect"><h3>Ma présentation</h3>' +
      '<textarea id="prof-bio" rows="2" maxlength="300" placeholder="Qui êtes-vous ?">' +
      esc(moi.bio || '') + '</textarea>' +
      '<button class="btn btn-s" id="prof-bio-ok" style="margin-top:8px">Enregistrer</button></div>' +
      (estPart
        ? '<div class="prof-sect"><h3>Mon logo</h3>' +
          '<div style="display:flex;gap:12px;align-items:center">' +
          (moi.logo ? '<img src="' + moi.logo + '" style="width:64px;height:64px;' +
            'object-fit:contain;border:1px solid var(--trait);border-radius:10px">' : '') +
          '<label class="btn btn-s btn-fich">Changer le logo' +
          '<input type="file" id="prof-logo-fich" accept="image/*" hidden></label>' +
          '</div></div>' +
          '<div class="prof-sect"><h3>Proposer une offre éphémère</h3>' +
          '<label>Titre</label><input type="text" id="of-titre" maxlength="80" ' +
            'placeholder="Ex. -20 % sur les tartes au vin"> ' +
          '<label>Description</label><input type="text" id="of-texte" maxlength="300" ' +
            'placeholder="Ex. Du mardi au dimanche, sur place et à emporter"> ' +
          '<label>Code promo (facultatif)</label><input type="text" id="of-code" ' +
            'maxlength="20" placeholder="Ex. VIN20">' +
          '<label>Photo (facultatif)</label>' +
          '<input type="file" id="of-photo" accept="image/*" style="font-size:14px">' +
          '<label>Validité</label><select id="of-jours" ' +
            'style="padding:10px;border:1.5px solid var(--trait);border-radius:10px;width:100%;background:#fff">' +
            '<option value="1">1 jour</option><option value="3">3 jours</option>' +
            '<option value="7" selected>7 jours</option><option value="14">14 jours</option>' +
            '<option value="30">30 jours</option></select>' +
          '<button class="btn btn-p btn-bloc" id="of-ok">Publier l’offre (+20 pts)</button></div>'
        : '') +
      '<div class="prof-sect" style="display:flex;justify-content:space-between;' +
        'align-items:center">' +
      '<span style="font-size:14px;color:var(--gris)">Se déconnecter</span>' +
      '<button class="btn-danger btn" id="prof-out">Déconnexion</button></div>';

    function upImage(fich, idFich, cb) {
      if (!fich.files || !fich.files[0]) return;
      var fd = new FormData();
      fd.append(idFich, fich.files[0]);
      api(idFich, fd, 'form').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        if (idFich === 'avatar') {
          moi.avatar = j.avatar;
          var im = $('prof-ava-img');
          im.src = j.avatar; im.style.display = '';
          $('compo-avatar').src = j.avatar; $('compo-avatar').hidden = false;
          $('btn-profil').innerHTML = '<img src="' + j.avatar + '" alt="">';
        } else {
          moi.logo = j.logo;
        }
        toast('Mis à jour !');
        ouvrirProfil();
      });
    }
    $('prof-ava-fich').addEventListener('change', function () { upImage(this, 'avatar', null); });
    if (estPart) {
      $('prof-logo-fich').addEventListener('change', function () { upImage(this, 'logo', null); });
      $('of-ok').addEventListener('click', function () {
        var fd = new FormData();
        fd.append('titre', $('of-titre').value);
        fd.append('texte', $('of-texte').value);
        fd.append('code', $('of-code').value);
        fd.append('jours', $('of-jours').value);
        if ($('of-photo').files[0]) fd.append('photo', $('of-photo').files[0]);
        api('offres', fd, 'form').then(function (j) {
          if (!j.ok) { toast(j.erreur); return; }
          if (j.pts) { moi.pts += j.pts; }
          toast('Offre publiée ! +' + (j.pts || 0) + ' pts');
          ouvrirProfil();
        });
      });
    }
    $('prof-bio-ok').addEventListener('click', function () {
      api('bio', { bio: $('prof-bio').value }, 'json').then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        moi.bio = $('prof-bio').value;
        toast('Présentation enregistrée');
        ouvrirProfil();
      });
    });
    $('prof-out').addEventListener('click', function () {
      api('deconnexion').then(seDeconnecter);
    });
  }
  $('btn-profil').addEventListener('click', ouvrirProfil);
  $('prof-retour').addEventListener('click', function () {
    $('vue-profil').hidden = true;
    $('app').hidden = false;
  });

  // ---------------- page partenaire ----------------
  function ouvrirPartenaire(nom) {
    $('vue-partenaire').hidden = false;
    $('part-titre').textContent = nom;
    var c = $('part-corps');
    c.innerHTML = '<div class="chargement">Chargement…</div>';
    api('partenaire?nom=' + encodeURIComponent(nom)).then(function (j) {
      if (!j.ok) { c.innerHTML = '<div class="vide">Partenaire introuvable.</div>'; return; }
      var p = j.partenaire;
      c.innerHTML =
        '<div class="prof-hero">' +
        (p.logo
          ? '<img class="prof-ava" src="' + p.logo + '" style="border-radius:14px;object-fit:contain;background:#fff">'
          : avaHtml(p, 'prof-ava')) +
        '<div><div class="prof-nom">' + esc(p.nom) + '</div>' +
        '<div class="post-meta"><span class="badge part">Partenaire</span> ' +
        niveau(p.nom, p.pts || 0) + '</div>' +
        (p.bio ? '<div class="prof-bio">' + esc(p.bio) + '</div>' : '') +
        '</div></div>' +
        (j.offres.length
          ? '<h3 style="margin-top:16px;font-size:16px">🔥 Offres en cours</h3>' +
            j.offres.map(offreCard).join('')
          : '<div class="vide" style="padding:22px">Aucune offre en cours.</div>') +
        '<h3 style="margin-top:16px;font-size:16px">Dernières actualités</h3>' +
        (j.posts.length ? j.posts.map(posterCard).join('')
          : '<div class="vide" style="padding:18px">Pas encore de posts.</div>');
    });
  }
  $('part-retour').addEventListener('click', function () {
    $('vue-partenaire').hidden = true;
    $('app').hidden = false;
  });

  // ---------------- navigation pied ----------------
  document.querySelector('.pied').addEventListener('click', function (e) {
    var b = e.target.closest('.pied-b');
    if (!b) return;
    this.querySelectorAll('.pied-b').forEach(function (x) {
      x.classList.toggle('actif', x === b);
    });
    if (b.dataset.nav === 'fil') {
      $('vue-messages').hidden = true;
      $('vue-profil').hidden = true;
      $('vue-partenaire').hidden = true;
      $('vue-fidelite').hidden = true;
      $('app').hidden = false;
      afficherFil();
    } else if (b.dataset.nav === 'messages') {
      ouvrirMessages();
    } else if (b.dataset.nav === 'fidelite') {
      ouvrirFidelite();
    } else {
      ouvrirProfil();
    }
  });

  // ---------------- lumière photo ----------------
  function lumiere(src) {
    var l = document.createElement('div');
    l.className = 'lumiere';
    l.innerHTML = '<img src="' + src + '" alt="">';
    l.addEventListener('click', function () { l.remove(); });
    document.body.appendChild(l);
  }
  document.body.addEventListener('click', function (e) {
    var l = e.target.closest('.lumiere');
    if (l) l.remove();
  });

  // ---------------- Fidélité & Partenaires (build 2) ----------------
  var AC = null;
  function audioCtx() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
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
      } else {
        note(880, 0, .07, 'sine', .14); note(1175, .07, .1, 'sine', .15);
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(type === 'reservation' ? [120, 60, 120] : 70); } catch (e) {}
  }

  function alerte(msg, type, icone, action) {
    var el = $('alerte');
    el.className = 'alerte alerte-' + (type || 'info');
    el.innerHTML = '<span class="ic-alerte">' + (icone || '🔔') + '</span><span></span>';
    el.querySelector('span:last-child').textContent = msg;
    el.hidden = false;
    el.onclick = function () { el.hidden = true; if (action) action(); };
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 9000);
  }

  function traiterEvenement(ev) {
    var d = ev.data || {};
    if (ev.type === 'reservation') {
      son('reservation');
      alerte('Nouvelle demande : ' + (d.de || '') + ' envoie le client « ' +
        (d.client || '') + ' » — ' + (d.detail || ''), 'reservation', '📨',
        function () { ouvrirFidelite(); });
    } else if (ev.type === 'accepte') {
      son('accepte');
      alerte('« ' + (d.client || '') + ' » accepté par ' + (d.vers || ''),
        'ok', '✅', function () { ouvrirFidelite(); });
    } else if (ev.type === 'refuse') {
      son('refuse');
      alerte('Demande refusée par ' + (d.vers || ''), 'info', '❌',
        function () { ouvrirFidelite(); });
    } else if (ev.type === 'envoi') {
      son('message');
      alerte((d.de || '') + ' → ' + (d.vers || '') + ' : client « ' +
        (d.client || '') + ' »', 'info', 'ℹ️', function () { ouvrirFidelite(); });
    } else if (ev.type === 'achat') {
      son('achat');
      alerte('+' + (d.points || 0) + ' points fidélité (' +
        (d.mode === 'sur_place' ? 'sur place' : 'à emporter') + ')',
        'ok', '⭐', function () { ouvrirFidelite(); });
    } else if (ev.type === 'message') {
      son('message');
      alerte('Nouveau message de ' + (d.de || ''), 'message', '✉️',
        ouvrirMessages);
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
            if (nb > 0 && $('vue-messages').hidden) {
              badge.textContent = nb; badge.hidden = false;
            } else badge.hidden = true;
          }
        }
        pollRealtime();
      });
    }, 5000);
  }

  // ---- carte visuelle ----
  function carteFidHtml(c, titre) {
    var emoji = c.niveau === 'Or' ? '🥇' : (c.niveau === 'Argent' ? '🥈' : '🥉');
    var telAff = esc((c.tel || '').replace(/(\d{2})(?=\d)/g, '$1 '));
    return '<div class="carte-fid">' +
      '<div class="tete"><span class="logo">LT</span>' +
      '<div><div class="tt">' + esc(titre || 'Carte fidélité') + '</div>' +
      '<div class="nom">' + esc(c.nom || '') + '</div></div></div>' +
      '<span class="niveau">' + emoji + ' ' + esc(c.niveau) + '</span>' +
      '<div class="pts">' + (c.points || 0) + ' <small>points</small></div>' +
      '<div class="progression"><div class="barre" style="width:' +
      (c.progression || 0) + '%"></div></div>' +
      '<div class="reste">' + (c.prochain_niveau
        ? 'Plus que ' + c.reste + ' pts pour ' + c.prochain_niveau
        : 'Niveau maximum atteint 🏆') + '</div>' +
      '<div class="tel">' + telAff + '</div>' +
      '</div>';
  }

  function achHtml(a) {
    return '<div class="achat-ligne"><span class="mode-badge">' +
      (a.mode === 'sur_place' ? '🍽 Sur place' : '🥡 À emporter') + '</span>' +
      '<span>' + esc(a.produits || '—') + ' · ' + hms(a.cree_le) + '</span>' +
      '<span class="m">+' + a.points + ' pts</span></div>';
  }

  function envoiHtml(e, peutRepondre) {
    var st = e.statut;
    return '<div class="envoi ' + st + '">' +
      '<div class="tete">' +
      (e.autre && (e.autre.logo || e.autre.avatar)
        ? '<img src="' + (e.autre.logo || e.autre.avatar) + '" alt="">' : '') +
      esc(e.de.nom) + ' → ' + esc(e.vers.nom) +
      '<span class="statut ' + st + '">' +
      (st === 'en_attente' ? 'En attente' : (st === 'accepte' ? 'Acceptée' : 'Refusée')) +
      '</span></div>' +
      '<div class="client">👤 ' + esc(e.client_nom) + '</div>' +
      '<div class="detail">' + esc(e.detail) + '</div>' +
      (e.quand ? '<div class="quand">🕐 ' + esc(e.quand) + '</div>' : '') +
      (peutRepondre && st === 'en_attente'
        ? '<div class="actions"><button class="btn btn-no" data-refuse="' + e.id + '">Refuser</button>' +
          '<button class="btn btn-ok" data-accepte="' + e.id + '">Accepter</button></div>' : '') +
      '</div>';
  }

  function ouvrirFidelite() {
    ['vue-messages', 'vue-profil', 'vue-partenaire'].forEach(function (id) {
      $(id).hidden = true;
    });
    $('app').hidden = true;
    $('vue-fidelite').hidden = false;
    var c = $('fid-corps');
    if (moi.type === 'client') {
      $('fid-titre').textContent = 'Ma carte fidélité';
      $('fid-sous').textContent = '';
      c.innerHTML = '<div class="chargement">Chargement…</div>';
      api('fidelite/moi').then(function (j) {
        if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur || 'Oups…') + '</div>'; return; }
        if (!j.carte) {
          c.innerHTML = '<div class="vide"><span class="g">⭐</span>' +
            'Votre carte est créée automatiquement au premier achat ' +
            'enregistré par le restaurant.<br>Vos points apparaîtront ici !</div>';
          return;
        }
        c.innerHTML = carteFidHtml(j.carte, 'Carte fidélité La Trattoria') +
          '<div class="stats-fid">' +
          '<div class="stat-fid"><div class="v">' + j.carte.nb_achats + '</div><div class="l">achats</div></div>' +
          '<div class="stat-fid"><div class="v">' + (j.carte.total || 0).toFixed(0) + ' €</div><div class="l">total</div></div>' +
          '<div class="stat-fid"><div class="v">' + j.carte.points + '</div><div class="l">points</div></div>' +
          '</div>' +
          (j.achats.length
            ? '<h3 class="sect-titre">Derniers achats</h3>' +
              '<div class="form-fid" style="margin-top:6px">' +
              j.achats.map(achHtml).join('') + '</div>' : '');
      });
    } else if (moi.type === 'partenaire') {
      $('fid-titre').textContent = 'Espace partenaire';
      $('fid-sous').textContent = 'Fidélité pros & renvois de clients';
      c.innerHTML = '<div class="chargement">Chargement…</div>';
      api('pro/moi').then(function (j) {
        if (!j.ok) { c.innerHTML = '<div class="vide">' + esc(j.erreur || 'Oups…') + '</div>'; return; }
        var pro = j.pro;
        var opts = (j.partenaires || []).map(function (p) {
          return '<option value="' + p.id + '">' + esc(p.nom) + '</option>';
        }).join('');
        c.innerHTML =
          carteFidHtml({ nom: moi.nom, points: pro.points, niveau: pro.niveau,
            progression: pro.niveau === 'Or' ? 100 :
              (pro.niveau === 'Argent' ? Math.min(100, Math.round(100 * (pro.points - 150) / 250))
                : Math.min(100, Math.round(100 * pro.points / 150))),
            prochain_niveau: pro.niveau === 'Or' ? null :
              (pro.niveau === 'Argent' ? 'Or' : 'Argent'),
            reste: pro.niveau === 'Or' ? 0 :
              (pro.niveau === 'Argent' ? 400 - pro.points : 150 - pro.points),
            tel: moi.tel }, 'Carte fidélité Pro') +
          '<div class="stats-fid">' +
          '<div class="stat-fid"><div class="v">' + pro.nb_envois + '</div><div class="l">clients envoyés</div></div>' +
          '<div class="stat-fid"><div class="v">' + pro.nb_acceptes + '</div><div class="l">demandes acceptées</div></div>' +
          '<div class="stat-fid"><div class="v">+25</div><div class="l">pts / envoi</div></div>' +
          '</div>' +
          '<div class="form-fid">' +
          '<h3>📨 Envoyer un client à un partenaire</h3>' +
          '<p class="aide">Un client veut ce que la Trattoria ne fait pas (cocktails, ' +
          'chocolaterie, hôtel…) ? Envoyez-le chez le partenaire concerné : ' +
          '<b>la demande de réservation part automatiquement dans son appli</b>, ' +
          'la Trattoria est prévenue, et vous gagnez <b>+25 pts</b> (et +5 si accepté).</p>' +
          '<label>Partenaire destinataire</label>' +
          '<select id="env-vers">' + (opts || '<option value="">(aucun autre partenaire)</option>') + '</select>' +
          '<label>Nom du client</label>' +
          '<input id="env-client" type="text" maxlength="60" placeholder="Ex. M. Dupont">' +
          '<label>Précisions (ce qu’il veut, nombre de personnes)</label>' +
          '<input id="env-detail" type="text" maxlength="300" placeholder="Ex. 2 cocktails, vers 21h">' +
          '<label>Quand (facultatif)</label>' +
          '<input id="env-quand" type="text" maxlength="60" placeholder="Ex. ce soir vers 21h">' +
          '<button class="btn btn-p" id="env-ok">Envoyer la demande (+25 pts)</button>' +
          '</div>' +
          '<h3 class="sect-titre">📥 Demandes reçues</h3>' +
          '<div id="fid-recus"><div class="chargement">…</div></div>' +
          '<h3 class="sect-titre">📤 Envoyés</h3>' +
          '<div id="fid-envoyes"><div class="chargement">…</div></div>';
        chargerEnvois(c);
        $('env-ok').addEventListener('click', function () {
          var vers = $('env-vers').value;
          var client = $('env-client').value.trim();
          var detail = $('env-detail').value.trim();
          if (!vers || !client || !detail) {
            toast('Complétez partenaire, client et précisions.'); return;
          }
          api('envoi', { vers_id: vers, client_nom: client, detail: detail,
            quand: $('env-quand').value.trim() }, 'json').then(function (r) {
            if (!r.ok) { toast(r.erreur); return; }
            toast('Demande envoyée ! +' + (r.points || 25) + ' pts');
            $('env-client').value = ''; $('env-detail').value = ''; $('env-quand').value = '';
            chargerEnvois(c);
          });
        });
      });
    } else {
      // staff / La Trattoria
      $('fid-titre').textContent = 'Fidélité clients';
      $('fid-sous').textContent = 'Personnel — enregistrement des achats';
      c.innerHTML =
        '<div class="form-fid">' +
        '<h3>🧾 Enregistrer un achat (carte fidélité)</h3>' +
        '<p class="aide">Sur place ou à emporter : <b>1 point par euro</b> ' +
        '(+20 pts au premier achat). La carte du client est mise à jour ' +
        'immédiatement.</p>' +
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
        '<button class="btn btn-p" id="ach-ok">Enregistrer l’achat</button>' +
        '</div>' +
        '<div id="ach-resultat"></div>' +
        '<div class="form-fid">' +
        '<h3>🔎 Rechercher une carte</h3>' +
        '<label>Téléphone</label>' +
        '<input id="carte-tel" type="tel" maxlength="15" placeholder="Ex. 06 12 34 56 78">' +
        '<button class="btn btn-s" id="carte-ok">Afficher la carte</button>' +
        '</div><div id="carte-resultat"></div>' +
        '<h3 class="sect-titre">📥 Demandes de réservation (tous partenaires)</h3>' +
        '<div id="fid-recus"><div class="chargement">…</div></div>';
      $('ach-ok').addEventListener('click', function () {
        api('fidelite/achat', {
          tel: $('ach-tel').value, nom: $('ach-nom').value,
          montant: parseFloat($('ach-montant').value) || 0,
          mode: $('ach-mode').value, produits: $('ach-produits').value
        }, 'json').then(function (r) {
          if (!r.ok) { toast(r.erreur); return; }
          $('ach-resultat').innerHTML = r.carte
            ? carteFidHtml(r.carte, 'Carte fidélité — mise à jour') : '';
          toast('Achat enregistré : +' + (r.points || 0) + ' pts');
          $('ach-montant').value = ''; $('ach-produits').value = '';
        });
      });
      $('carte-ok').addEventListener('click', function () {
        api('fidelite?tel=' + encodeURIComponent($('carte-tel').value)).then(function (r) {
          if (!r.ok) { $('carte-resultat').innerHTML = '<p class="aide">' + esc(r.erreur) + '</p>'; return; }
          $('carte-resultat').innerHTML =
            (r.carte ? carteFidHtml(r.carte, 'Carte fidélité') :
              '<div class="vide" style="padding:16px">Pas encore de carte pour ce numéro.</div>') +
            (r.achats && r.achats.length
              ? '<div class="form-fid" style="margin-top:10px">' +
                r.achats.map(achHtml).join('') + '</div>' : '');
        });
      });
      chargerEnvois(c);
    }
  }

  function chargerEnvois(conteneur) {
    var estStaff = moi.type === 'staff';
    api('envois/recus').then(function (j) {
      var z = $('fid-recus');
      if (!z) return;
      if (!j.ok) { z.innerHTML = '<div class="vide">' + esc(j.erreur || 'Oups…') + '</div>'; return; }
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

  // réponses aux demandes (délégation)
  document.addEventListener('click', function (e) {
    var acc = e.target.closest('[data-accepte]');
    var ref = e.target.closest('[data-refuse]');
    if (!acc && !ref) return;
    var id = acc ? acc.dataset.accepte : ref.dataset.refuse;
    api('envois/repondre', { id: id, statut: acc ? 'accepte' : 'refuse' }, 'json')
      .then(function (j) {
        if (!j.ok) { toast(j.erreur); return; }
        toast(acc ? 'Demande acceptée ✅' : 'Demande refusée');
        chargerEnvois($('fid-corps'));
      });
  });

  $('fid-retour').addEventListener('click', function () {
    $('vue-fidelite').hidden = true;
    $('app').hidden = false;
  });

  // ---------------- démarrage ----------------
  if (jeton) {
    apresConnexion();
  } else {
    $('ecran-auth').hidden = false;
  }
})();
