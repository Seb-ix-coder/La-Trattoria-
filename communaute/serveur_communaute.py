#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
serveur_communaute.py — Communauté La Trattoria (réseau social local)
======================================================================

Serveur HTTP local (stdlib uniquement) pour le réseau social du
restaurant : clients et partenaires créent un compte, postent des
photos, interagissent (j'aime, commentaires, messages privés) et les
partenaires gèrent leurs offres éphémères sur leur page.

Démarrage :
  python3 communaute/serveur_communaute.py            # port 8721
  python3 communaute/serveur_communaute.py 8800       # autre port

Accès :
  http://<machine>:8721/        → l'application (installable sur téléphone)

Données :
  communaute/communaute.db      (SQLite : comptes, posts, offres, messages)
  communaute/photos/            (photos de posts)
  communaute/avatars/           (photos de profil)
  communaute/logos/             (logos de partenaires)

Toute la donnée reste sur le réseau local du restaurant — aucun
hébergement externe, aucune dépendance hors stdlib Python.
"""

import base64
import hashlib
import html
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import struct
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / 'communaute.db'
PHOTOS = HERE / 'photos'
AVATARS = HERE / 'avatars'
LOGOS = HERE / 'logos'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8721
HOST = '0.0.0.0'

PHOTO_MAX = 4 * 1024 * 1024          # 4 Mo par photo
AVATAR_MAX = 1 * 1024 * 1024
LOGO_MAX = 1 * 1024 * 1024
SESSION_DAYS = 30
TEXTE_MAX = 1000

# Pillow est optionnel : s'il est présent, les photos sont recadrées
# (max 1000 px) pour rester légers ; sinon elles sont stockées telles quelles.
try:
    from PIL import Image  # type: ignore
    HAS_PIL = True
except Exception:
    HAS_PIL = False


# ---------------------------------------------------------------------------
#  Base de données
# ---------------------------------------------------------------------------
def db() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, timeout=5)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    return c


def init_db() -> None:
    for d in (PHOTOS, AVATARS, LOGOS):
        d.mkdir(parents=True, exist_ok=True)
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'client',   -- client | partenaire | admin
          nom TEXT NOT NULL,
          tel TEXT NOT NULL UNIQUE,
          email TEXT,
          mdp TEXT NOT NULL,
          sel TEXT NOT NULL,
          bio TEXT DEFAULT '',
          avatar TEXT,                            -- nom de fichier
          logo TEXT,                              -- nom de fichier (partenaires)
          pts INTEGER NOT NULL DEFAULT 0,
          cree_le REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          jeton TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expire REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY,
          auteur_id TEXT NOT NULL,
          texte TEXT NOT NULL,
          cree_le REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS post_photos (
          post_id TEXT NOT NULL,
          fichier TEXT NOT NULL,
          idx INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS likes (
          post_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          PRIMARY KEY (post_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS commentaires (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          texte TEXT NOT NULL,
          cree_le REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          de_id TEXT NOT NULL,
          vers_id TEXT NOT NULL,
          texte TEXT NOT NULL,
          cree_le REAL NOT NULL,
          lu INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS offres (
          id TEXT PRIMARY KEY,
          partenaire_id TEXT NOT NULL,
          titre TEXT NOT NULL,
          texte TEXT NOT NULL,
          photo TEXT,
          code TEXT,                               -- code promo éventuel
          deb REAL NOT NULL,                       -- epoch
          fin REAL NOT NULL,                       -- epoch (éphémère)
          active INTEGER NOT NULL DEFAULT 1
        );
        ''')


def hache(mdp: str, sel: str) -> str:
    return hashlib.sha256((sel + mdp).encode('utf-8')).hexdigest()


# ---------------------------------------------------------------------------
#  Requêtes métier
# ---------------------------------------------------------------------------
def user_row(u: sqlite3.Row) -> dict:
    return {
        'id': u['id'], 'type': u['type'], 'nom': u['nom'], 'tel': u['tel'],
        'email': u['email'] or '', 'bio': u['bio'] or '',
        'avatar': '/avatar/' + u['avatar'] if u['avatar'] else None,
        'logo': '/logo/' + u['logo'] if u['logo'] else None,
        'pts': u['pts'], 'cree_le': u['cree_le'],
    }


def niveau(pts: int) -> str:
    if pts >= 500:
        return 'Or'
    if pts >= 150:
        return 'Argent'
    return 'Bronze'


def post_json(p: sqlite3.Row, photos: list, nb_likes: int, nb_com: int,
              like_par_moi: bool, auteur: dict | None) -> dict:
    return {
        'id': p['id'],
        'auteur': auteur,
        'texte': p['texte'],
        'photos': ['/photo/' + f for f in photos],
        'nb_likes': nb_likes, 'nb_com': nb_com,
        'like_par_moi': like_par_moi,
        'cree_le': p['cree_le'],
    }


def feed(c: sqlite3.Connection, moi_id: str | None, filtre: str) -> list:
    q = '''SELECT p.*, u.nom AS a_nom, u.type AS a_type, u.avatar AS a_avatar,
                  u.logo AS a_logo, u.pts AS a_pts
           FROM posts p JOIN users u ON u.id = p.auteur_id'''
    args = []
    if filtre == 'partenaires':
        q += ' WHERE u.type = "partenaire"'
    q += ' ORDER BY p.cree_le DESC LIMIT 200'
    rows = c.execute(q, args).fetchall()
    out = []
    for p in rows:
        photos = [r['fichier'] for r in c.execute(
            'SELECT fichier FROM post_photos WHERE post_id=? ORDER BY idx',
            (p['id'],)).fetchall()]
        nb_l = c.execute('SELECT COUNT(*) n FROM likes WHERE post_id=?',
                         (p['id'],)).fetchone()['n']
        nb_c = c.execute('SELECT COUNT(*) n FROM commentaires WHERE post_id=?',
                         (p['id'],)).fetchone()['n']
        li = c.execute('SELECT 1 FROM likes WHERE post_id=? AND user_id=?',
                       (p['id'], moi_id or '')).fetchone()
        auteur = {'nom': p['a_nom'], 'type': p['a_type'],
                  'avatar': '/avatar/' + p['a_avatar'] if p['a_avatar'] else None,
                  'logo': '/logo/' + p['a_logo'] if p['a_logo'] else None,
                  'pts': p['a_pts'], 'niveau': niveau(p['a_pts'])}
        out.append(post_json(p, photos, nb_l, nb_c, bool(li), auteur))
    return out


def offres_publiques(c: sqlite3.Connection, maintenant: float) -> list:
    rows = c.execute('''SELECT o.*, u.nom AS p_nom, u.logo AS p_logo,
                               u.avatar AS p_avatar
                        FROM offres o JOIN users u ON u.id = o.partenaire_id
                        WHERE o.active = 1 AND o.fin > ?
                        ORDER BY o.fin ASC''', (maintenant,)).fetchall()
    out = []
    for o in rows:
        out.append({
            'id': o['id'], 'titre': o['titre'], 'texte': o['texte'],
            'photo': '/photo/' + o['photo'] if o['photo'] else None,
            'code': o['code'] or '',
            'deb': o['deb'], 'fin': o['fin'],
            'partenaire': {'nom': o['p_nom'],
                           'logo': '/logo/' + o['p_logo'] if o['p_logo'] else None,
                           'avatar': '/avatar/' + o['p_avatar'] if o['p_avatar'] else None},
        })
    return out


# ---------------------------------------------------------------------------
#  Images
# ---------------------------------------------------------------------------
def image_ok(data: bytes) -> bool:
    if data[:3] == b'\xff\xd8\xff':
        return True                      # JPEG
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return True                      # PNG
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return True                      # WebP
    return False


def stocker_image(data: bytes, dossier: Path, max_size: int) -> str | None:
    if len(data) > max_size:
        return None
    if not image_ok(data):
        return None
    nom = uuid.uuid4().hex + '.jpg'
    if HAS_PIL:
        try:
            im = Image.open(io.BytesIO(data))
            im.draft('RGB', (1000, 1000))
            im = im.convert('RGB')
            if max(im.size) > 1000:
                ratio = 1000 / max(im.size)
                im = im.resize((int(im.width * ratio), int(im.height * ratio)))
            im.save(dossier / nom, 'JPEG', quality=82)
            return nom
        except Exception:
            pass
    (dossier / nom).write_bytes(data)
    return nom


# ---------------------------------------------------------------------------
#  Serveur HTTP
# ---------------------------------------------------------------------------
class H(BaseHTTPRequestHandler):
    server_version = 'TrattoriaCommunaute/1.0'
    silence_log = True

    # -- utilitaires --------------------------------------------------------
    def _json(self, obj, code=200, cookie=None, expire_cookie=False):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie',
                             'communaute=%s; Path=/; Max-Age=%d; SameSite=Lax'
                             % (cookie, SESSION_DAYS * 86400))
        elif expire_cookie:
            self.send_header('Set-Cookie',
                             'communaute=; Path=/; Max-Age=0; SameSite=Lax')
        self.end_headers()
        self.wfile.write(data)

    def _fichier(self, data: bytes, ctype: str):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=86400')
        self.end_headers()
        self.wfile.write(data)

    def _page(self, nom: str, body: bytes):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _corps(self) -> bytes:
        n = int(self.headers.get('Content-Length') or 0)
        if n > 8 * 1024 * 1024:
            return b''
        return self.rfile.read(n)

    def _json_corps(self) -> dict:
        try:
            return json.loads(self._corps().decode('utf-8') or '{}')
        except Exception:
            return {}

    def _multipart(self) -> dict:
        """Renvoie {champ: valeur, '@' + champ: bytes}"""
        ctype = self.headers.get('Content-Type') or ''
        m = re.search(r'boundary=([^;]+)', ctype)
        out = {}
        if not m:
            return out
        raw = self._corps()
        sep = ('--' + m.group(1).strip('"')).encode()
        for part in raw.split(sep):
            part = part.strip(b'\r\n')
            if not part or part == b'--':
                continue
            head, _, content = part.partition(b'\r\n\r\n')
            content = content.rstrip(b'\r\n')
            htxt = head.decode('utf-8', 'replace')
            nm = re.search(r'name="([^"]+)"', htxt)
            if not nm:
                continue
            if 'filename=' in htxt:
                out['@' + nm.group(1)] = content
            else:
                out[nm.group(1)] = content.decode('utf-8', 'replace')
        return out

    def _user(self) -> dict | None:
        jeton = self.headers.get('X-Jeton') or ''
        if not re.fullmatch(r'[a-f0-9]{40,64}', jeton):
            m = re.search(r'communaute=([a-f0-9]{40,64})',
                          self.headers.get('Cookie') or '')
            jeton = m.group(1) if m else ''
        if not jeton:
            return None
        with db() as c:
            r = c.execute('''SELECT s.expire, u.* FROM sessions s
                              JOIN users u ON u.id = s.user_id
                              WHERE s.jeton=?''', (jeton,)).fetchone()
            if not r:
                return None
            if r['expire'] < time.time():
                c.execute('DELETE FROM sessions WHERE jeton=?', (jeton,))
                return None
            return user_row(r)

    def _nouv_session(self, c: sqlite3.Connection, user_id: str):
        jeton = secrets.token_hex(32)
        c.execute('INSERT INTO sessions VALUES (?,?,?)',
                  (jeton, user_id, time.time() + SESSION_DAYS * 86400))
        return jeton

    def _points(self, user_id: str, nb: int) -> None:
        with db() as c:
            c.execute('UPDATE users SET pts = pts + ? WHERE id=?', (nb, user_id))

    # -- routes GET ---------------------------------------------------------
    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        if p == '/' or p == '/index.html':
            self._page('/', (HERE / 'index.html').read_bytes())
        elif p == '/app.js':
            self._fichier((HERE / 'app.js').read_bytes(), 'text/javascript; charset=utf-8')
        elif p == '/app.css':
            self._fichier((HERE / 'app.css').read_bytes(), 'text/css; charset=utf-8')
        elif p == '/manifest.webmanifest':
            self._fichier((HERE / 'manifest.webmanifest').read_bytes(),
                          'application/manifest+json')
        elif p == '/icones/icone-192.png':
            self._fichier((HERE / 'icones' / 'icone-192.png').read_bytes(), 'image/png')
        elif p == '/icones/icone-512.png':
            self._fichier((HERE / 'icones' / 'icone-512.png').read_bytes(), 'image/png')
        elif p.startswith('/photo/'):
            nom = p[7:]
            f = PHOTOS / nom
            if re.fullmatch(r'[a-f0-9]{32}\.(jpg|png|webp)', nom or '') and f.exists():
                self._fichier(f.read_bytes(), self._ctype(nom))
            else:
                self._json({'ok': False, 'erreur': 'introuvable'}, 404)
        elif p.startswith('/avatar/'):
            nom = p[8:]
            f = AVATARS / nom
            if re.fullmatch(r'[a-f0-9]{32}\.jpg', nom or '') and f.exists():
                self._fichier(f.read_bytes(), 'image/jpeg')
            else:
                self._json({'ok': False, 'erreur': 'introuvable'}, 404)
        elif p.startswith('/logo/'):
            nom = p[6:]
            f = LOGOS / nom
            if re.fullmatch(r'[a-f0-9]{32}\.jpg', nom or '') and f.exists():
                self._fichier(f.read_bytes(), 'image/jpeg')
            else:
                self._json({'ok': False, 'erreur': 'introuvable'}, 404)
        elif p == '/api/moi':
            moi = self._user()
            self._json({'ok': True, 'moi': moi})
        elif p == '/api/feed':
            q = parse_qs(u.query)
            moi = self._user()
            with db() as c:
                posts = feed(c, moi['id'] if moi else None,
                             q.get('filtre', ['tous'])[0])
            self._json({'ok': True, 'posts': posts})
        elif p == '/api/offres':
            with db() as c:
                self._json({'ok': True, 'offres':
                            offres_publiques(c, time.time())})
        elif p == '/api/membres':
            moi = self._user()
            if not moi:
                self._json({'ok': False, 'erreur': 'non connecté'}, 401)
                return
            with db() as c:
                rows = c.execute('''SELECT id, nom, type, avatar, logo, pts
                                    FROM users WHERE id != ? ORDER BY nom''',
                                 (moi['id'],)).fetchall()
            self._json({'ok': True, 'membres': [
                {'id': r['id'], 'nom': r['nom'], 'type': r['type'],
                 'avatar': '/avatar/' + r['avatar'] if r['avatar'] else None,
                 'logo': '/logo/' + r['logo'] if r['logo'] else None,
                 'pts': r['pts'], 'niveau': niveau(r['pts'])}
                for r in rows]})
        elif p == '/api/partenaire':
            q = parse_qs(u.query)
            nom = q.get('nom', [''])[0]
            with db() as c:
                r = c.execute('SELECT * FROM users WHERE nom=? AND type="partenaire"',
                              (nom,)).fetchone()
                if not r:
                    self._json({'ok': False, 'erreur': 'partenaire introuvable'}, 404)
                    return
                u2 = user_row(r)
                u2['niveau'] = niveau(r['pts'])
                offres = [o for o in offres_publiques(c, time.time())
                          if o['partenaire']['nom'] == r['nom']]
                posts = feed(c, self._user()['id'] if self._user() else None, 'tous')
                posts = [p for p in posts
                         if p['auteur']['nom'] == r['nom']][:50]
                self._json({'ok': True, 'partenaire': u2, 'offres': offres,
                            'posts': posts})
        else:
            self._json({'ok': False, 'erreur': 'route inconnue'}, 404)

    def _ctype(self, nom: str) -> str:
        return {'jpg': 'image/jpeg', 'png': 'image/png',
                'webp': 'image/webp'}.get(nom.rsplit('.', 1)[-1], 'application/octet-stream')

    # -- routes POST --------------------------------------------------------
    def do_POST(self):
        p = urlparse(self.path).path
        try:
            if p == '/api/inscription':
                self.inscription()
            elif p == '/api/connexion':
                self.connexion()
            elif p == '/api/deconnexion':
                self.deconnexion()
            elif p == '/api/posts':
                self.nouveau_post()
            elif p == '/api/like':
                self.toggle_like()
            elif p == '/api/commentaires':
                self.nouveau_commentaire()
            elif p == '/api/messages':
                self.nouveau_message()
            elif p == '/api/messages/lire':
                self.lire_messages()
            elif p == '/api/avatar':
                self.changer_avatar()
            elif p == '/api/logo':
                self.changer_logo()
            elif p == '/api/bio':
                self.changer_bio()
            elif p == '/api/offres':
                self.nouvelle_offre()
            elif p == '/api/offres/fin':
                self.fin_offre()
            else:
                self._json({'ok': False, 'erreur': 'route inconnue'}, 404)
        except Exception as e:  # ne jamais faire planter le serveur
            self._json({'ok': False, 'erreur': 'erreur serveur'}, 500)
            sys.stderr.write('ERREUR %s : %s\n' % (p, e))

    def inscription(self):
        d = self._json_corps()
        nom = (d.get('nom') or '').strip()[:40]
        tel = re.sub(r'[\s.\-]', '', d.get('tel') or '')[:15]
        mdp = d.get('mdp') or ''
        type_compte = 'partenaire' if d.get('partenaire') else 'client'
        if len(nom) < 2 or len(tel) < 6 or len(mdp) < 4:
            self._json({'ok': False, 'erreur':
                        'Nom, téléphone (6 chiffres min) et code (4 caractères min) requis.'})
            return
        sel = secrets.token_hex(16)
        uid = uuid.uuid4().hex
        with db() as c:
            if c.execute('SELECT 1 FROM users WHERE tel=?', (tel,)).fetchone():
                self._json({'ok': False, 'erreur':
                            'Ce téléphone est déjà inscrit — connectez-vous.'})
                return
            jeton = None
            c.execute('''INSERT INTO users
                         (id,type,nom,tel,mdp,sel,pts,cree_le)
                         VALUES (?,?,?,?,?,?,0,?)''',
                      (uid, type_compte, nom, tel, hache(mdp, sel), sel,
                       time.time()))
            jeton = self._nouv_session(c, uid)
        self._json({'ok': True, 'jeton': jeton}, cookie=jeton)

    def connexion(self):
        d = self._json_corps()
        tel = re.sub(r'[\s.\-]', '', d.get('tel') or '')[:15]
        mdp = d.get('mdp') or ''
        with db() as c:
            r = c.execute('SELECT * FROM users WHERE tel=?', (tel,)).fetchone()
            if not r or r['mdp'] != hache(mdp, r['sel']):
                self._json({'ok': False, 'erreur': 'Téléphone ou code incorrect.'})
                return
            jeton = self._nouv_session(c, r['id'])
        self._json({'ok': True, 'jeton': jeton}, cookie=jeton)

    def deconnexion(self):
        jeton = self.headers.get('X-Jeton') or ''
        if not re.fullmatch(r'[a-f0-9]{40,64}', jeton):
            m = re.search(r'communaute=([a-f0-9]{40,64})',
                          self.headers.get('Cookie') or '')
            jeton = m.group(1) if m else ''
        if jeton:
            with db() as c:
                c.execute('DELETE FROM sessions WHERE jeton=?', (jeton,))
        self._json({'ok': True}, expire_cookie=True)

    def nouveau_post(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._multipart()
        texte = (d.get('texte') or '').strip()[:TEXTE_MAX]
        if not texte:
            self._json({'ok': False, 'erreur': 'Le texte du post est vide.'})
            return
        pid = uuid.uuid4().hex
        fichiers = []
        for i in range(4):
            data = d.get('@photo%d' % i)
            if data:
                nom = stocker_image(data, PHOTOS, PHOTO_MAX)
                if nom:
                    fichiers.append(nom)
        with db() as c:
            c.execute('INSERT INTO posts VALUES (?,?,?,?)',
                      (pid, moi['id'], texte, time.time()))
            for i, f in enumerate(fichiers):
                c.execute('INSERT INTO post_photos VALUES (?,?,?)', (pid, f, i))
        self._points(moi['id'], 10)
        self._json({'ok': True, 'id': pid, 'pts': 10})

    def toggle_like(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        pid = d.get('id') or ''
        with db() as c:
            if not c.execute('SELECT 1 FROM posts WHERE id=?', (pid,)).fetchone():
                self._json({'ok': False, 'erreur': 'post introuvable'}, 404)
                return
            deja = c.execute('SELECT 1 FROM likes WHERE post_id=? AND user_id=?',
                             (pid, moi['id'])).fetchone()
            if deja:
                c.execute('DELETE FROM likes WHERE post_id=? AND user_id=?',
                          (pid, moi['id']))
                self._json({'ok': True, 'like': False})
            else:
                c.execute('INSERT INTO likes VALUES (?,?)', (pid, moi['id']))
                self._json({'ok': True, 'like': True})

    def nouveau_commentaire(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        pid = d.get('id') or ''
        texte = (d.get('texte') or '').strip()[:300]
        if not texte:
            self._json({'ok': False, 'erreur': 'Commentaire vide.'})
            return
        with db() as c:
            if not c.execute('SELECT 1 FROM posts WHERE id=?', (pid,)).fetchone():
                self._json({'ok': False, 'erreur': 'post introuvable'}, 404)
                return
            c.execute('INSERT INTO commentaires VALUES (?,?,?,?,?)',
                      (uuid.uuid4().hex, pid, moi['id'], texte, time.time()))
        self._points(moi['id'], 5)
        self._json({'ok': True, 'pts': 5})

    def nouveau_message(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        vers = d.get('vers') or ''
        texte = (d.get('texte') or '').strip()[:500]
        if not texte:
            self._json({'ok': False, 'erreur': 'Message vide.'})
            return
        with db() as c:
            if not c.execute('SELECT 1 FROM users WHERE id=?', (vers,)).fetchone():
                self._json({'ok': False, 'erreur': 'destinataire introuvable'}, 404)
                return
            c.execute('INSERT INTO messages VALUES (?,?,?,?,?,0)',
                      (uuid.uuid4().hex, moi['id'], vers, texte, time.time()))
        self._json({'ok': True})

    def lire_messages(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        avec = d.get('avec') or ''
        with db() as c:
            c.execute('''UPDATE messages SET lu=1 WHERE vers_id=? AND de_id=?''',
                      (moi['id'], avec))
            rows = c.execute('''SELECT * FROM messages
                                WHERE (de_id=? AND vers_id=?)
                                   OR (de_id=? AND vers_id=?)
                                ORDER BY cree_le DESC LIMIT 200''',
                             (moi['id'], avec, avec, moi['id'])).fetchall()
        out = [{'id': r['id'], 'de': r['de_id'], 'vers': r['vers_id'],
                'texte': r['texte'], 'cree_le': r['cree_le'], 'lu': bool(r['lu'])}
               for r in reversed(rows)]
        self._json({'ok': True, 'messages': out})

    def changer_avatar(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._multipart()
        data = d.get('@avatar')
        if not data:
            self._json({'ok': False, 'erreur': 'photo absente'})
            return
        nom = stocker_image(data, AVATARS, AVATAR_MAX)
        if not nom:
            self._json({'ok': False, 'erreur':
                        'Image invalide (jpg/png/webp, 1 Mo max).'})
            return
        with db() as c:
            c.execute('UPDATE users SET avatar=? WHERE id=?', (nom, moi['id']))
        self._json({'ok': True, 'avatar': '/avatar/' + nom})

    def changer_logo(self):
        moi = self._user()
        if not moi or moi['type'] != 'partenaire':
            self._json({'ok': False, 'erreur': 'réservé aux partenaires'}, 403)
            return
        d = self._multipart()
        data = d.get('@logo')
        if not data:
            self._json({'ok': False, 'erreur': 'logo absent'})
            return
        nom = stocker_image(data, LOGOS, LOGO_MAX)
        if not nom:
            self._json({'ok': False, 'erreur': 'Image invalide (jpg/png/webp, 1 Mo max).'})
            return
        with db() as c:
            c.execute('UPDATE users SET logo=? WHERE id=?', (nom, moi['id']))
        self._json({'ok': True, 'logo': '/logo/' + nom})

    def changer_bio(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        bio = (d.get('bio') or '').strip()[:300]
        with db() as c:
            c.execute('UPDATE users SET bio=? WHERE id=?', (bio, moi['id']))
        self._json({'ok': True})

    def nouvelle_offre(self):
        moi = self._user()
        if not moi or moi['type'] != 'partenaire':
            self._json({'ok': False, 'erreur': 'réservé aux partenaires'}, 403)
            return
        d = self._multipart()
        titre = (d.get('titre') or '').strip()[:80]
        texte = (d.get('texte') or '').strip()[:300]
        code = (d.get('code') or '').strip()[:20]
        jours = int(d.get('jours') or 7)
        if not titre or not texte:
            self._json({'ok': False, 'erreur': 'Titre et description requis.'})
            return
        jours = max(1, min(jours, 90))
        photo = None
        if d.get('@photo'):
            photo = stocker_image(d['@photo'], PHOTOS, PHOTO_MAX)
        maintenant = time.time()
        oid = uuid.uuid4().hex
        with db() as c:
            c.execute('''INSERT INTO offres
                         (id,partenaire_id,titre,texte,photo,code,deb,fin,active)
                         VALUES (?,?,?,?,?,?,?,?,1)''',
                      (oid, moi['id'], titre, texte, photo, code, maintenant,
                       maintenant + jours * 86400))
        self._points(moi['id'], 20)
        self._json({'ok': True, 'id': oid, 'pts': 20})

    def fin_offre(self):
        moi = self._user()
        if not moi or moi['type'] != 'partenaire':
            self._json({'ok': False, 'erreur': 'réservé aux partenaires'}, 403)
            return
        d = self._json_corps()
        oid = d.get('id') or ''
        with db() as c:
            c.execute('''UPDATE offres SET active=0 WHERE id=?
                         AND partenaire_id=?''', (oid, moi['id']))
        self._json({'ok': True})

    def log_message(self, *a):
        pass


def main():
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), H)
    ip = 'votre machine'
    print('Communauté La Trattoria — http://%s:%d/' % (HOST, PORT))
    print('(sur le Wi-Fi : http://<ip-de-la-machine>:%d/)' % PORT)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\narrêté')


if __name__ == '__main__':
    main()
