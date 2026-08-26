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
            '<div class="mp">' + (m.type === 'partenaire' ? 'Partenaire' : 'Membre') +
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
      $('app').hidden = false;
      afficherFil();
    } else if (b.dataset.nav === 'messages') {
      ouvrirMessages();
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

  // ---------------- démarrage ----------------
  if (jeton) {
    apresConnexion();
  } else {
    $('ecran-auth').hidden = false;
  }
})();
