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
SCHEMA_VERSION = 4
PHOTOS = HERE / 'photos'
AVATARS = HERE / 'avatars'
LOGOS = HERE / 'logos'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8721
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
def sauvegarder_avant_migration() -> None:
    """Conserve une copie avant la migration des achats/notes.

    Les bases existantes contiennent parfois uniquement le texte libre
    ``achats.produits``. La copie est créée une seule fois avant la première
    migration v4 et n'est jamais supprimée par le serveur.
    """
    if not DB_PATH.exists():
        return
    marqueur = DB_PATH.with_name(DB_PATH.name + '.pre-migration-v4.bak')
    if marqueur.exists():
        return
    try:
        con = sqlite3.connect(DB_PATH)
        tables = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        con.close()
        if 'lignes_achat' not in tables or 'notes_plats' not in tables:
            shutil.copy2(DB_PATH, marqueur)
    except Exception:
        # Une sauvegarde manquée ne doit pas empêcher le démarrage, mais la
        # migration reste documentée et les erreurs sont visibles au test.
        pass


def db() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, timeout=5)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    return c


def migrer_lignes_achat_legacy() -> None:
    """Crée les lignes d'achat sans détruire l'ancien texte libre.

    Les commandes récentes peuvent déjà fournir une liste JSON structurée.
    Une ancienne commande qui ne contient qu'un libellé est conservée comme
    ligne ``plat_id=''`` : elle reste visible dans la fidélité mais ne peut
    pas autoriser abusivement une notation.
    """
    with db() as c:
        achats = c.execute('SELECT * FROM achats').fetchall()
        for achat in achats:
            existe = c.execute('SELECT 1 FROM lignes_achat WHERE achat_id=? LIMIT 1',
                               (achat['id'],)).fetchone()
            if existe:
                continue
            brut = achat['produits'] or ''
            lignes = []
            try:
                valeur = json.loads(brut)
                if isinstance(valeur, list):
                    lignes = valeur
            except Exception:
                lignes = []
            if not lignes:
                lignes = [{'plat_id': '', 'nom': brut[:200], 'qte': 1,
                           'pv': float(achat['montant'] or 0)}]
            for ligne in lignes:
                if not isinstance(ligne, dict):
                    continue
                plat_id = str(ligne.get('plat_id') or ligne.get('id') or '').strip()[:100]
                nom = str(ligne.get('nom') or '').strip()[:200]
                try:
                    qte = max(1, min(100, int(ligne.get('qte', ligne.get('quantite', 1)))))
                except (TypeError, ValueError):
                    qte = 1
                try:
                    prix = round(float(ligne.get('pv', ligne.get('prix', 0)) or 0), 2)
                except (TypeError, ValueError):
                    prix = 0
                c.execute('''INSERT INTO lignes_achat
                             (id,achat_id,plat_id,nom,quantite,prix,cree_le)
                             VALUES (?,?,?,?,?,?,?)''',
                          (uuid.uuid4().hex, achat['id'], plat_id, nom, qte,
                           prix, achat['cree_le']))


def init_db() -> None:
    sauvegarder_avant_migration()
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
          verifie INTEGER NOT NULL DEFAULT 0,    -- validé par le personnel
          consent TEXT NOT NULL DEFAULT '{}',    -- {classement, offres_contact, notifs_son}
          badges TEXT NOT NULL DEFAULT '[]',     -- liste d'ids de badges
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
        -- ===== Fidélité & Partenaires (build 2) =====
        CREATE TABLE IF NOT EXISTS fidelite (
          tel TEXT PRIMARY KEY,
          nom TEXT NOT NULL,
          points INTEGER NOT NULL DEFAULT 0,
          nb_achats INTEGER NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          cree_le REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS achats (
          id TEXT PRIMARY KEY,
          tel TEXT NOT NULL,
          montant REAL NOT NULL,
          mode TEXT NOT NULL,          -- sur_place | a_emporter
          produits TEXT NOT NULL,
          points INTEGER NOT NULL,
          cree_le REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lignes_achat (
          id TEXT PRIMARY KEY,
          achat_id TEXT NOT NULL,
          plat_id TEXT NOT NULL DEFAULT '',
          nom TEXT NOT NULL DEFAULT '',
          quantite INTEGER NOT NULL CHECK(quantite > 0),
          prix REAL NOT NULL DEFAULT 0,
          cree_le REAL NOT NULL,
          FOREIGN KEY(achat_id) REFERENCES achats(id)
        );
        CREATE INDEX IF NOT EXISTS idx_lignes_achat_plat
          ON lignes_achat(plat_id, achat_id);
        CREATE TABLE IF NOT EXISTS notes_plats (
          plat_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          achat_id TEXT NOT NULL,
          ligne_achat_id TEXT NOT NULL,
          note INTEGER NOT NULL CHECK(note BETWEEN 1 AND 5),
          commentaire TEXT NOT NULL DEFAULT '',
          cree_le REAL NOT NULL,
          modifie_le REAL NOT NULL,
          PRIMARY KEY (plat_id, user_id),
          FOREIGN KEY(achat_id) REFERENCES achats(id),
          FOREIGN KEY(ligne_achat_id) REFERENCES lignes_achat(id)
        );
        CREATE INDEX IF NOT EXISTS idx_notes_plats_plat
          ON notes_plats(plat_id);
        CREATE TABLE IF NOT EXISTS pro_loyaute (
          user_id TEXT PRIMARY KEY,
          points INTEGER NOT NULL DEFAULT 0,
          nb_envois INTEGER NOT NULL DEFAULT 0,
          nb_acceptes INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS envois (
          id TEXT PRIMARY KEY,
          de_id TEXT NOT NULL,         -- partenaire émetteur
          vers_id TEXT NOT NULL,       -- partenaire destinataire
          client_nom TEXT NOT NULL,
          detail TEXT NOT NULL,
          quand TEXT NOT NULL DEFAULT '',
          statut TEXT NOT NULL DEFAULT 'en_attente',  -- en_attente|accepte|refuse
          cree_le REAL NOT NULL,
          reponse_le REAL
        );
        CREATE TABLE IF NOT EXISTS evenements (
          id TEXT PRIMARY KEY,
          dest_id TEXT NOT NULL,       -- id user
          type TEXT NOT NULL,          -- message|reservation|envoi|accepte|refuse|achat|mention|badge
          data TEXT NOT NULL,
          lu INTEGER NOT NULL DEFAULT 0,
          cree_le REAL NOT NULL
        );
        -- ===== Gaming & consentement (build 3) =====
        CREATE TABLE IF NOT EXISTS reactions (
          post_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          emoji TEXT NOT NULL,
          PRIMARY KEY (post_id, user_id, emoji)
        );
        CREATE TABLE IF NOT EXISTS follows (
          follower_id TEXT NOT NULL,
          followee_id TEXT NOT NULL,
          cree_le REAL NOT NULL,
          PRIMARY KEY (follower_id, followee_id)
        );
        CREATE TABLE IF NOT EXISTS missions_faites (
          user_id TEXT NOT NULL,
          mission_id TEXT NOT NULL,
          cree_le REAL NOT NULL,
          PRIMARY KEY (user_id, mission_id)
        );
        CREATE TABLE IF NOT EXISTS recompenses (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          reward_id TEXT NOT NULL,
          points INTEGER NOT NULL,
          cree_le REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS offres_essayees (
          offre_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          cree_le REAL NOT NULL,
          PRIMARY KEY (offre_id, user_id)
        );
        ''')
    # migration : colonnes manquantes sur une base existante
    for col, typ in (('verifie', 'INTEGER NOT NULL DEFAULT 0'),
                     ('consent', "TEXT NOT NULL DEFAULT '{}'"),
                     ('badges', "TEXT NOT NULL DEFAULT '[]'")):
        try:
            with db() as c:
                c.execute('ALTER TABLE users ADD COLUMN %s %s' % (col, typ))
        except Exception:
            pass
    # Compatibilité avec la table notes_plats du build 3 : les anciennes
    # lignes sont conservées mais restent non vérifiées tant qu'aucun achat
    # identifié ne les relie à une ligne d'achat.
    for col, typ in (('achat_id', "TEXT NOT NULL DEFAULT ''"),
                     ('ligne_achat_id', "TEXT NOT NULL DEFAULT ''"),
                     ('modifie_le', 'REAL NOT NULL DEFAULT 0')):
        try:
            with db() as c:
                c.execute('ALTER TABLE notes_plats ADD COLUMN %s %s' % (col, typ))
        except Exception:
            pass
    migrer_lignes_achat_legacy()
    # compte staff « La Trattoria » (messagerie pro, enregistrement des achats)
    sel = secrets.token_hex(16)
    with db() as c:
        c.execute('''INSERT OR IGNORE INTO users
                     (id,type,nom,tel,mdp,sel,pts,verifie,cree_le)
                     VALUES ('trattoria','staff','La Trattoria','0000000000',
                             ?,?,0,1,?)''',
                  (hache('trattoria', sel), sel, time.time()))


def hache(mdp: str, sel: str) -> str:
    return hashlib.sha256((sel + mdp).encode('utf-8')).hexdigest()


# ---------------------------------------------------------------------------
#  Requêtes métier
# ---------------------------------------------------------------------------
def user_row(u: sqlite3.Row) -> dict:
    try:
        consent = json.loads(u['consent'] or '{}') if 'consent' in u.keys() else {}
    except Exception:
        consent = {}
    try:
        badges = json.loads(u['badges'] or '[]') if 'badges' in u.keys() else []
    except Exception:
        badges = []
    return {
        'id': u['id'], 'type': u['type'], 'nom': u['nom'], 'tel': u['tel'],
        'email': u['email'] or '', 'bio': u['bio'] or '',
        'avatar': '/avatar/' + u['avatar'] if u['avatar'] else None,
        'logo': '/logo/' + u['logo'] if u['logo'] else None,
        'pts': u['pts'], 'cree_le': u['cree_le'],
        'verifie': bool(u['verifie']) if 'verifie' in u.keys() else False,
        'consent': consent, 'badges': badges,
    }


# ---------------------------------------------------------------------------
#  Gaming : niveaux, badges, missions, récompenses
# ---------------------------------------------------------------------------
NIVEAUX = [
    {'id': 'platine', 'nom': 'Platine', 'seuil': 1000, 'icone': '💎'},
    {'id': 'or', 'nom': 'Or', 'seuil': 400, 'icone': '🥇'},
    {'id': 'argent', 'nom': 'Argent', 'seuil': 150, 'icone': '🥈'},
    {'id': 'bronze', 'nom': 'Bronze', 'seuil': 0, 'icone': '🥉'},
]


def niveau_info(pts: int) -> dict:
    for n in NIVEAUX:
        if pts >= n['seuil']:
            cur = n
            break
    else:
        cur = NIVEAUX[-1]
    suivant = next((x for x in NIVEAUX if x['seuil'] > pts), None)
    base = cur['seuil']
    cible = suivant['seuil'] if suivant else cur['seuil']
    prog = 100 if not suivant else round(100 * (pts - base) / (cible - base))
    return {'nom': cur['nom'], 'id': cur['id'], 'icone': cur['icone'],
            'seuil': base, 'prochain': suivant['nom'] if suivant else None,
            'reste': (suivant['seuil'] - pts) if suivant else 0,
            'progression': prog}


def niveau(pts: int) -> str:
    return niveau_info(pts)['nom']


# Badges (définitions). L'attribution se fait dans _badge().
BADGES = [
    {'id': 'premier_post', 'nom': 'Premier pas', 'icone': '✍️',
     'desc': 'Publier son premier post'},
    {'id': 'photographe', 'nom': 'Photographe', 'icone': '📷',
     'desc': 'Partager une photo'},
    {'id': 'converseur', 'nom': 'Causeur', 'icone': '💬',
     'desc': '5 commentaires'},
    {'id': 'vedette', 'nom': 'Vedette', 'icone': '❤️',
     'desc': 'Un post avec 5 réactions'},
    {'id': 'premier_envoi', 'nom': 'Ambassadeur', 'icone': '🤝',
     'desc': 'Envoyer un premier client'},
    {'id': 'maitre_jeu', 'nom': 'Maître du jeu', 'icone': '🎯',
     'desc': '3 demandes acceptées'},
    {'id': 'fidele', 'nom': 'Habitué', 'icone': '🍕',
     'desc': '5 achats enregistrés'},
    {'id': 'argent', 'nom': 'Argent', 'icone': '🥈', 'desc': 'Atteindre le niveau Argent'},
    {'id': 'or', 'nom': 'Or', 'icone': '🥇', 'desc': 'Atteindre le niveau Or'},
    {'id': 'platine', 'nom': 'Platine', 'icone': '💎', 'desc': 'Atteindre le niveau Platine'},
    {'id': 'generos', 'nom': 'Générosité', 'icone': '🎁',
     'desc': 'Échanger une récompense'},
]


def badge_def(bid):
    return next((b for b in BADGES if b['id'] == bid), None)


# Missions (quêtes en cours). progressif est calculé côté serveur.
MISSIONS = [
    {'id': 'm_post', 'nom': 'Partager un moment', 'icone': '✍️', 'pts': 10,
     'desc': 'Publier 1 post', 'cible': 1, 'type': 'posts'},
    {'id': 'm_photo', 'nom': 'Côté cuisine', 'icone': '📷', 'pts': 15,
     'desc': 'Partager 1 photo', 'cible': 1, 'type': 'photos'},
    {'id': 'm_com', 'nom': 'Rejoindre la conversation', 'icone': '💬', 'pts': 15,
     'desc': 'Écrire 3 commentaires', 'cible': 3, 'type': 'commentaires'},
    {'id': 'm_envoi', 'nom': 'Ambassadeur (pro)', 'icone': '🤝', 'pts': 30,
     'desc': 'Envoyer 2 clients à des partenaires', 'cible': 2, 'type': 'envois',
     'pro': True},
    {'id': 'm_achat', 'nom': 'Habitué', 'icone': '🍕', 'pts': 25,
     'desc': '5 achats enregistrés', 'cible': 5, 'type': 'achats'},
]


# Récompenses à échanger contre des points (conversion vers le restaurant).
RECOMPENSES = [
    {'id': 'boisson', 'nom': 'Une boisson offerte', 'icone': '🥤', 'cout': 100,
     'desc': 'À présenter au comptoir (1 boisson au choix du menu)'},
    {'id': 'cafe', 'nom': 'Café + petite pâtisserie', 'icone': '☕', 'cout': 150,
     'desc': 'Le combo digestif de la maison'},
    {'id': 'dessert', 'nom': 'Le dessert du jour offert', 'icone': '🍰', 'cout': 200,
     'desc': 'À présenter au comptoir'},
    {'id': 'reduc10', 'nom': '-10 % sur votre prochaine commande', 'icone': '🏷️', 'cout': 250,
     'desc': 'Valable 30 jours, à présenter au comptoir'},
]


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
        self.send_header('Access-Control-Allow-Origin', '*')
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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=86400')
        self.end_headers()
        self.wfile.write(data)

    def _page(self, nom: str, body: bytes):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
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

    def _pro_pts(self, c: sqlite3.Connection, user_id: str, nb: int,
                 compteur: str = 'nb_envois') -> dict:
        c.execute('INSERT OR IGNORE INTO pro_loyaute (user_id) VALUES (?)',
                  (user_id,))
        c.execute('''UPDATE pro_loyaute SET points = points + ?,
                     %s = %s + 1 WHERE user_id=?''' % (compteur, compteur),
                  (nb, user_id))
        r = c.execute('SELECT * FROM pro_loyaute WHERE user_id=?',
                      (user_id,)).fetchone()
        return {'points': r['points'], 'nb_envois': r['nb_envois'],
                'nb_acceptes': r['nb_acceptes']}

    def _evenement(self, c: sqlite3.Connection, dest_id: str, etype: str,
                   data: dict) -> None:
        c.execute('INSERT INTO evenements VALUES (?,?,?,?,0,?)',
                  (uuid.uuid4().hex, dest_id, etype,
                   json.dumps(data, ensure_ascii=False), time.time()))

    # ===== helpers gaming / consentement / validation (build 3) ==========
    def _consent(self, u_row: dict, cle: str, par_defaut: bool) -> bool:
        cons = u_row.get('consent') or {}
        return bool(cons.get(cle, par_defaut))

    def _bloque_non_verifie(self, moi: dict) -> bool:
        """Vrai si l'action doit être bloquée (compte non validé)."""
        return (not moi.get('verifie')) and moi.get('type') != 'staff'

    def _reponse_non_verifie(self):
        self._json({'ok': False, 'code': 'non_verifie',
                    'erreur': 'Compte en attente de validation — '
                              'demandez au personnel du restaurant (ou montrez '
                              'cette page au comptoir).'}, 403)

    def _badge(self, c: sqlite3.Connection, user_id: str, bid: str) -> bool:
        """Attribue un badge s'il n'est pas déjà acquis. Vrai si nouveau."""
        r = c.execute('SELECT badges FROM users WHERE id=?', (user_id,)).fetchone()
        if not r:
            return False
        try:
            cur = json.loads(r['badges'] or '[]')
        except Exception:
            cur = []
        if bid in cur:
            return False
        cur.append(bid)
        c.execute('UPDATE users SET badges=? WHERE id=?',
                  (json.dumps(cur), user_id))
        b = badge_def(bid)
        self._evenement(c, user_id, 'badge',
                        {'id': bid, 'nom': b['nom'] if b else bid,
                         'icone': b['icone'] if b else '🏅'})
        return True

    def _gagner(self, c: sqlite3.Connection, user_id: str, nb: int) -> int:
        """Ajoute des points et attribue les badges de niveau. Renvoie nb."""
        c.execute('UPDATE users SET pts = pts + ? WHERE id=?', (nb, user_id))
        r = c.execute('SELECT pts FROM users WHERE id=?', (user_id,)).fetchone()
        pts = r['pts'] if r else 0
        info = niveau_info(pts)
        for bid in ('argent', 'or', 'platine'):
            if info['id'] == bid:
                self._badge(c, user_id, bid)
                break
        return nb

    def _mentions(self, c: sqlite3.Connection, texte: str, auteur_id: str):
        """Détecte les @Mention sur les vrais noms de membres et notifie
        si le consentement le permet."""
        if not texte or '@' not in texte:
            return
        auteur = c.execute('SELECT nom FROM users WHERE id=?',
                           (auteur_id,)).fetchone()
        auteur_nom = (auteur['nom'] if auteur else '')
        noms = [r['nom'] for r in c.execute(
            'SELECT nom FROM users').fetchall() if r['nom']]
        # plus longs d'abord : « La Trattoria » avant « La »
        for nom in sorted(noms, key=len, reverse=True):
            if nom.lower() == auteur_nom.lower():
                continue
            if ('@' + nom) in texte or ('@' + nom.lower()) in texte.lower():
                cible = c.execute(
                    'SELECT * FROM users WHERE lower(nom)=lower(?)',
                    (nom,)).fetchone()
                if not cible or cible['id'] == auteur_id:
                    continue
                try:
                    consent = json.loads(cible['consent'] or '{}')
                except Exception:
                    consent = {}
                autorise = (cible['type'] in ('staff', 'partenaire')
                            or consent.get('offres_contact'))
                if not autorise or not cible['verifie']:
                    continue
                self._evenement(c, cible['id'], 'mention',
                                {'de': auteur_id, 'texte': texte[:120]})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers',
                         'Content-Type, X-Jeton, X-Requested-With')
        self.end_headers()

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
        elif p == '/api/notes-plats':
            self.notes_plats_get()
        elif p == '/api/fidelite/moi':
            self.fidelite_moi()
        elif p == '/api/fidelite':
            self.fidelite_tel(u.query)
        elif p == '/api/envois/recus':
            self.envois_recus()
        elif p == '/api/envois/envoyes':
            self.envois_envoyes()
        elif p == '/api/pro/moi':
            self.pro_moi()
        elif p == '/api/realtime':
            self.realtime()
        elif p == '/api/verification':
            self.verification_moi()
        elif p == '/api/classement':
            self.classement()
        elif p == '/api/missions':
            self.missions_moi()
        elif p == '/api/badges':
            self.badges_moi()
        elif p == '/api/recompenses':
            self.recompenses_liste()
        elif p == '/api/consent':
            self.consent_moi()
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
            elif p in ('/api/notes-plats', '/api/rating'):
                self.note_plat()
            elif p == '/api/fidelite/achat':
                self.fidelite_achat()
            elif p == '/api/envoi':
                self.envoi_client()
            elif p == '/api/envois/repondre':
                self.envoi_repondre()
            elif p == '/api/verifier':
                self.verifier_membre()
            elif p == '/api/mission':
                self.mission_faire()
            elif p == '/api/recompense':
                self.recompense_acheter()
            elif p == '/api/reaction':
                self.reaction_toggle()
            elif p == '/api/suivre':
                self.suivre_toggle()
            elif p == '/api/offres/essayer':
                self.offres_essayer()
            elif p == '/api/consent':
                self.consent_mettre()
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
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie(); return
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
            self._mentions(c, texte, moi['id'])
            self._badge(c, moi['id'], 'premier_post')
            if fichiers:
                self._badge(c, moi['id'], 'photographe')
            self._gagner(c, moi['id'], 10)
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
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie(); return
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
            self._mentions(c, texte, moi['id'])
            nb = c.execute('SELECT COUNT(*) n FROM commentaires WHERE user_id=?',
                           (moi['id'],)).fetchone()['n']
            if nb >= 5:
                self._badge(c, moi['id'], 'converseur')
            self._gagner(c, moi['id'], 5)
        self._json({'ok': True, 'pts': 5})

    def nouveau_message(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie(); return
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
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie(); return
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

    # ===== Fidélité & Partenaires (build 2) ==============================
    def _carte_fidelite(self, c, tel):
        r = c.execute('SELECT * FROM fidelite WHERE tel=?', (tel,)).fetchone()
        if not r:
            return None
        pts = r['points']
        niveau = 'Or' if pts >= 400 else ('Argent' if pts >= 150 else 'Bronze')
        if niveau == 'Bronze':
            prochain, base, cible = 'Argent', 0, 150
        elif niveau == 'Argent':
            prochain, base, cible = 'Or', 150, 400
        else:
            prochain, base, cible = None, 400, 400
        return {
            'tel': r['tel'], 'nom': r['nom'], 'points': pts,
            'niveau': niveau, 'nb_achats': r['nb_achats'],
            'total': r['total'], 'cree_le': r['cree_le'],
            'prochain_niveau': prochain,
            'reste': max(0, cible - pts) if prochain else 0,
            'progression': 100 if not prochain
                           else round(100 * (pts - base) / (cible - base)),
        }

    def fidelite_moi(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        if moi['type'] != 'client':
            self._json({'ok': False, 'erreur': 'carte réservée aux clients'}, 404)
            return
        with db() as c:
            carte = self._carte_fidelite(c, moi['tel'])
            achats = c.execute(
                'SELECT * FROM achats WHERE tel=? ORDER BY cree_le DESC LIMIT 10',
                (moi['tel'],)).fetchall()
        self._json({'ok': True, 'carte': carte, 'achats': [
            {'id': a['id'], 'montant': a['montant'], 'mode': a['mode'],
             'produits': a['produits'], 'points': a['points'],
             'cree_le': a['cree_le']} for a in achats]})

    def fidelite_tel(self, query):
        moi = self._user()
        if not moi or moi['type'] != 'staff':
            self._json({'ok': False, 'erreur': 'réservé au personnel'}, 403)
            return
        tel = re.sub(r'[\s.\-]', '', parse_qs(query).get('tel', [''])[0])[:15]
        if len(tel) < 6:
            self._json({'ok': False, 'erreur': 'téléphone invalide'})
            return
        with db() as c:
            carte = self._carte_fidelite(c, tel)
            achats = c.execute(
                'SELECT * FROM achats WHERE tel=? ORDER BY cree_le DESC LIMIT 20',
                (tel,)).fetchall()
        self._json({'ok': True, 'carte': carte, 'achats': [
            {'id': a['id'], 'montant': a['montant'], 'mode': a['mode'],
             'produits': a['produits'], 'points': a['points'],
             'cree_le': a['cree_le']} for a in achats]})

    def fidelite_achat(self):
        moi = self._user()
        if not moi or moi['type'] != 'staff':
            self._json({'ok': False, 'erreur': 'réservé au personnel'}, 403)
            return
        d = self._json_corps()
        tel = re.sub(r'[\s.\-]', '', d.get('tel') or '')[:15]
        nom = (d.get('nom') or '').strip()[:40]
        try:
            montant = round(float(d.get('montant') or 0), 2)
        except Exception:
            montant = 0
        mode = d.get('mode')
        produits = (d.get('produits') or '').strip()[:200]
        raw_lignes = d.get('lignes')
        if not isinstance(raw_lignes, list):
            raw_lignes = []
        lignes = []
        for raw in raw_lignes[:100]:
            if not isinstance(raw, dict):
                continue
            plat_id = str(raw.get('plat_id') or raw.get('id') or '').strip()[:100]
            # Un identifiant stable est nécessaire pour autoriser une note.
            # Une ligne legacy sans id est conservée mais ne sera jamais notable.
            if plat_id and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}', plat_id):
                continue
            nom_ligne = str(raw.get('nom') or '').strip()[:200]
            try:
                qte_ligne = max(1, min(100, int(raw.get('qte', raw.get('quantite', 1)))))
            except (TypeError, ValueError):
                qte_ligne = 1
            try:
                prix_ligne = round(float(raw.get('pv', raw.get('prix', 0)) or 0), 2)
            except (TypeError, ValueError):
                prix_ligne = 0
            lignes.append({'plat_id': plat_id, 'nom': nom_ligne,
                           'qte': qte_ligne, 'pv': prix_ligne})
        if not lignes:
            # Anciennes données : ne pas les supprimer ni leur attribuer un
            # identifiant deviné à partir d'un texte libre.
            lignes = [{'plat_id': '', 'nom': produits, 'qte': 1, 'pv': montant}]
        if not produits:
            produits = json.dumps(lignes, ensure_ascii=False)
        if len(tel) < 6 or montant <= 0 or mode not in ('sur_place', 'a_emporter'):
            self._json({'ok': False, 'erreur':
                        'Téléphone, montant > 0 et mode (sur_place/a_emporter) requis.'})
            return
        now = time.time()
        with db() as c:
            deja = c.execute('SELECT * FROM fidelite WHERE tel=?', (tel,)).fetchone()
            pts_achat = int(montant)
            bonus = 20 if not deja else 0
            if deja:
                c.execute(
                    '''UPDATE fidelite SET
                       nom = CASE WHEN ? = '' THEN nom ELSE ? END,
                       points = points + ?, nb_achats = nb_achats + 1,
                       total = total + ? WHERE tel=?''',
                    (nom, nom, pts_achat + bonus, montant, tel))
            else:
                c.execute('''INSERT INTO fidelite
                             (tel,nom,points,nb_achats,total,cree_le)
                             VALUES (?,?,?,?,?,?)''',
                          (tel, nom or 'Client', pts_achat + bonus, 1, montant, now))
            achat_id = uuid.uuid4().hex
            c.execute('INSERT INTO achats VALUES (?,?,?,?,?,?,?)',
                      (achat_id, tel, montant, mode, produits,
                       pts_achat + bonus, now))
            for ligne in lignes:
                c.execute('''INSERT INTO lignes_achat
                             (id,achat_id,plat_id,nom,quantite,prix,cree_le)
                             VALUES (?,?,?,?,?,?,?)''',
                          (uuid.uuid4().hex, achat_id, ligne['plat_id'],
                           ligne['nom'], ligne['qte'], ligne['pv'], now))
            carte = self._carte_fidelite(c, tel)
            u = c.execute('SELECT id FROM users WHERE tel=?', (tel,)).fetchone()
            if u:
                self._gagner(c, u['id'], 5)
                self._evenement(c, u['id'], 'achat',
                                {'montant': montant, 'mode': mode,
                                 'points': pts_achat + bonus})
            f2 = c.execute('SELECT nb_achats FROM fidelite WHERE tel=?',
                           (tel,)).fetchone()
            if f2 and f2['nb_achats'] >= 5:
                u3 = c.execute('SELECT id FROM users WHERE tel=?',
                               (tel,)).fetchone()
                if u3:
                    self._badge(c, u3['id'], 'fidele')
        self._json({'ok': True, 'carte': carte, 'points': pts_achat + bonus})

    # ===== Avis vérifiés sur les plats (build 4) =========================
    def notes_plats_get(self):
        """Retourne uniquement les notes reliées à une ligne d'achat.

        Les anciennes notes éventuellement importées sans achat_id restent
        dans la base pour archivage mais ne sont pas publiées.
        """
        with db() as c:
            rows = c.execute('''SELECT n.plat_id, MAX(l.nom) AS plat_nom,
                                       ROUND(AVG(n.note), 2) AS moyenne,
                                       COUNT(*) AS compteur
                                FROM notes_plats n
                                JOIN achats a ON a.id=n.achat_id
                                JOIN lignes_achat l ON l.id=n.ligne_achat_id
                                WHERE n.achat_id <> '' AND n.ligne_achat_id <> ''
                                  AND l.plat_id <> ''
                                GROUP BY n.plat_id ORDER BY plat_nom''').fetchall()
            sorties = []
            for r in rows:
                avis = c.execute('''SELECT note, commentaire, cree_le, modifie_le
                                    FROM notes_plats
                                    WHERE plat_id=? AND achat_id <> ''
                                    ORDER BY modifie_le DESC LIMIT 20''',
                                 (r['plat_id'],)).fetchall()
                sorties.append({
                    'plat_id': r['plat_id'], 'plat_nom': r['plat_nom'] or r['plat_id'],
                    'moyenne': float(r['moyenne'] or 0), 'compteur': r['compteur'],
                    'avis': [{'note': a['note'], 'commentaire': a['commentaire'],
                              'date': a['modifie_le'] or a['cree_le']}
                             for a in avis if a['commentaire']]
                })
        self._json({'ok': True, 'ratings': sorties})

    def note_plat(self):
        """Crée ou modifie une note après vérification SQL d'un achat.

        La preuve n'utilise jamais le nom libre du produit : elle exige un
        plat_id stable présent dans lignes_achat et rattaché à un achat du
        téléphone du compte connecté.
        """
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'code': 'connexion_requise',
                        'erreur': 'Connectez-vous pour noter un plat.'}, 401)
            return
        d = self._json_corps()
        plat_id = str(d.get('plat_id') or '').strip()[:100]
        commentaire = str(d.get('commentaire') or '').strip()[:500]
        try:
            note = int(d.get('note'))
        except (TypeError, ValueError):
            note = 0
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}', plat_id or ''):
            self._json({'ok': False, 'erreur': 'Identifiant de plat invalide.'}, 400)
            return
        if note not in range(1, 6):
            self._json({'ok': False, 'erreur': 'La note doit être comprise entre 1 et 5.'}, 400)
            return
        with db() as c:
            preuve = c.execute('''SELECT a.id AS achat_id, l.id AS ligne_id
                                  FROM achats a JOIN lignes_achat l ON l.achat_id=a.id
                                  WHERE a.tel=? AND l.plat_id=? AND l.quantite > 0
                                  ORDER BY a.cree_le DESC LIMIT 1''',
                               (moi['tel'], plat_id)).fetchone()
            if not preuve:
                self._json({'ok': False, 'code': 'achat_requis',
                            'erreur': 'Ce plat doit apparaître dans un achat enregistré.'}, 403)
                return
            maintenant = time.time()
            ancienne = c.execute('''SELECT 1 FROM notes_plats
                                    WHERE plat_id=? AND user_id=?''',
                                 (plat_id, moi['id'])).fetchone()
            if ancienne:
                c.execute('''UPDATE notes_plats SET note=?, commentaire=?,
                             modifie_le=?, achat_id=?, ligne_achat_id=?
                             WHERE plat_id=? AND user_id=?''',
                          (note, commentaire, maintenant, preuve['achat_id'],
                           preuve['ligne_id'], plat_id, moi['id']))
                modifiee = True
            else:
                c.execute('''INSERT INTO notes_plats
                             (plat_id,user_id,achat_id,ligne_achat_id,note,
                              commentaire,cree_le,modifie_le)
                             VALUES (?,?,?,?,?,?,?,?)''',
                          (plat_id, moi['id'], preuve['achat_id'], preuve['ligne_id'],
                           note, commentaire, maintenant, maintenant))
                modifiee = False
            stats = c.execute("""SELECT ROUND(AVG(note),2) moyenne, COUNT(*) compteur
                                 FROM notes_plats WHERE plat_id=? AND achat_id <> ''""",
                              (plat_id,)).fetchone()
        self._json({'ok': True, 'modifie': modifiee,
                    'moyenne': float(stats['moyenne'] or 0),
                    'compteur': stats['compteur'],
                    'message': 'Votre note a été modifiée.' if modifiee
                               else 'Merci, votre avis est enregistré après vérification de votre achat.'})

    def pro_moi(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        if moi['type'] != 'partenaire':
            self._json({'ok': False, 'erreur': 'réservé aux partenaires'}, 403)
            return
        with db() as c:
            r = c.execute('SELECT * FROM pro_loyaute WHERE user_id=?',
                          (moi['id'],)).fetchone()
            partenaires = c.execute(
                "SELECT id, nom FROM users WHERE type='partenaire' AND id != ?"
                ' ORDER BY nom', (moi['id'],)).fetchall()
        pts = r['points'] if r else 0
        self._json({'ok': True, 'pro': {
            'points': pts,
            'niveau': 'Or' if pts >= 400 else ('Argent' if pts >= 150 else 'Bronze'),
            'nb_envois': r['nb_envois'] if r else 0,
            'nb_acceptes': r['nb_acceptes'] if r else 0,
        }, 'partenaires': [{'id': p['id'], 'nom': p['nom']}
                           for p in partenaires]})

    def _envoi_json(self, c, e, sens):
        autre_id = e['de_id'] if sens == 'recu' else e['vers_id']
        autre = c.execute('SELECT id, nom, logo, avatar FROM users WHERE id=?',
                          (autre_id,)).fetchone()
        return {'id': e['id'], 'de': {'id': e['de_id'], 'nom': None},
                'vers': {'id': e['vers_id'], 'nom': None},
                'client_nom': e['client_nom'], 'detail': e['detail'],
                'quand': e['quand'], 'statut': e['statut'],
                'cree_le': e['cree_le'], 'reponse_le': e['reponse_le'],
                'autre': ({'id': autre['id'], 'nom': autre['nom'],
                           'logo': '/logo/' + autre['logo'] if autre['logo'] else None,
                           'avatar': '/avatar/' + autre['avatar'] if autre['avatar'] else None}
                          if autre else None)}

    def envois_recus(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        if moi['type'] not in ('partenaire', 'staff'):
            self._json({'ok': False, 'erreur': 'réservé'}, 403)
            return
        with db() as c:
            if moi['type'] == 'staff':
                rows = c.execute('SELECT * FROM envois ORDER BY cree_le DESC LIMIT 100').fetchall()
            else:
                rows = c.execute('SELECT * FROM envois WHERE vers_id=? ORDER BY cree_le DESC LIMIT 100',
                                 (moi['id'],)).fetchall()
            out = []
            for e in rows:
                j = self._envoi_json(c, e, 'recu')
                a = c.execute('SELECT nom FROM users WHERE id=?', (e['de_id'],)).fetchone()
                b = c.execute('SELECT nom FROM users WHERE id=?', (e['vers_id'],)).fetchone()
                j['de']['nom'] = a['nom'] if a else '?'
                j['vers']['nom'] = b['nom'] if b else '?'
                out.append(j)
        self._json({'ok': True, 'envois': out})

    def envois_envoyes(self):
        moi = self._user()
        if not moi or moi['type'] != 'partenaire':
            self._json({'ok': False, 'erreur': 'réservé aux partenaires'}, 403)
            return
        with db() as c:
            rows = c.execute('SELECT * FROM envois WHERE de_id=? ORDER BY cree_le DESC LIMIT 100',
                             (moi['id'],)).fetchall()
            out = []
            for e in rows:
                j = self._envoi_json(c, e, 'envoye')
                a = c.execute('SELECT nom FROM users WHERE id=?', (e['de_id'],)).fetchone()
                b = c.execute('SELECT nom FROM users WHERE id=?', (e['vers_id'],)).fetchone()
                j['de']['nom'] = a['nom'] if a else '?'
                j['vers']['nom'] = b['nom'] if b else '?'
                out.append(j)
        self._json({'ok': True, 'envois': out})

    def envoi_client(self):
        moi = self._user()
        if not moi or moi['type'] != 'partenaire':
            self._json({'ok': False, 'erreur': 'réservé aux partenaires'}, 403)
            return
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie(); return
        d = self._json_corps()
        vers = d.get('vers_id') or ''
        client = (d.get('client_nom') or '').strip()[:60]
        detail = (d.get('detail') or '').strip()[:300]
        quand = (d.get('quand') or '').strip()[:60]
        if not client or not detail:
            self._json({'ok': False, 'erreur': 'Nom du client et description requis.'})
            return
        with db() as c:
            dest = c.execute("SELECT * FROM users WHERE id=? AND type='partenaire'",
                             (vers,)).fetchone()
            if not dest or dest['id'] == moi['id']:
                self._json({'ok': False,
                            'erreur': 'Destinataire invalide (autre partenaire).'})
                return
            now = time.time()
            eid = uuid.uuid4().hex
            c.execute('''INSERT INTO envois
                         (id,de_id,vers_id,client_nom,detail,quand,statut,cree_le)
                         VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?)''',
                      (eid, moi['id'], vers, client, detail, quand, now))
            self._pro_pts(c, moi['id'], 25, 'nb_envois')
            self._badge(c, moi['id'], 'premier_envoi')
            self._gagner(c, moi['id'], 25)
            # demande de réservation automatique chez le partenaire concerné
            self._evenement(c, vers, 'reservation',
                            {'id': eid, 'de': moi['nom'], 'client': client,
                             'detail': detail, 'quand': quand})
            # la Trattoria (staff) est informée
            self._evenement(c, 'trattoria', 'envoi',
                            {'id': eid, 'de': moi['nom'], 'vers': dest['nom'],
                             'client': client, 'detail': detail})
            # message automatique dans la messagerie du destinataire
            c.execute('INSERT INTO messages VALUES (?,?,?,?,?,0)',
                      (uuid.uuid4().hex, 'trattoria', vers,
                       '📨 %s envoie un client : %s — %s'
                       % (moi['nom'], client, detail), now))
            self._evenement(c, vers, 'message', {'de': 'La Trattoria'})
        self._json({'ok': True, 'id': eid, 'points': 25})

    def envoi_repondre(self):
        moi = self._user()
        if not moi or moi['type'] not in ('partenaire', 'staff'):
            self._json({'ok': False, 'erreur': 'réservé'}, 403)
            return
        d = self._json_corps()
        eid = d.get('id') or ''
        statut = d.get('statut')
        if statut not in ('accepte', 'refuse'):
            self._json({'ok': False, 'erreur': 'statut invalide'})
            return
        with db() as c:
            e = c.execute('SELECT * FROM envois WHERE id=?', (eid,)).fetchone()
            if not e:
                self._json({'ok': False, 'erreur': 'envoi introuvable'}, 404)
                return
            if e['vers_id'] != moi['id'] and moi['type'] != 'staff':
                self._json({'ok': False, 'erreur': 'réservé au destinataire'}, 403)
                return
            if e['statut'] != 'en_attente':
                self._json({'ok': False, 'erreur': 'déjà répondu'})
                return
            now = time.time()
            c.execute('UPDATE envois SET statut=?, reponse_le=? WHERE id=?',
                      (statut, now, eid))
            emetteur = c.execute('SELECT id, nom FROM users WHERE id=?',
                                 (e['de_id'],)).fetchone()
            de_nom = emetteur['nom'] if emetteur else '?'
            if statut == 'accepte':
                c.execute('''UPDATE pro_loyaute SET points = points + 5,
                             nb_acceptes = nb_acceptes + 1 WHERE user_id=?''',
                          (e['de_id'],))
                r2 = c.execute('SELECT nb_acceptes FROM pro_loyaute WHERE user_id=?',
                               (e['de_id'],)).fetchone()
                if r2 and r2['nb_acceptes'] >= 3:
                    self._badge(c, e['de_id'], 'maitre_jeu')
                self._evenement(c, e['de_id'], 'accepte',
                                {'id': eid, 'vers': moi['nom'],
                                 'client': e['client_nom']})
                self._evenement(c, 'trattoria', 'accepte',
                                {'id': eid, 'de': de_nom, 'vers': moi['nom'],
                                 'client': e['client_nom']})
            else:
                self._evenement(c, e['de_id'], 'refuse',
                                {'id': eid, 'vers': moi['nom']})
                self._evenement(c, 'trattoria', 'refuse',
                                {'id': eid, 'de': de_nom, 'vers': moi['nom']})
        self._json({'ok': True})

    def realtime(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        with db() as c:
            rows = c.execute('''SELECT * FROM evenements
                                WHERE dest_id=? AND lu=0
                                ORDER BY cree_le DESC LIMIT 20''',
                             (moi['id'],)).fetchall()
            evenements = [{'id': r['id'], 'type': r['type'],
                           'data': json.loads(r['data']),
                           'cree_le': r['cree_le']} for r in rows]
            if evenements:
                c.execute('UPDATE evenements SET lu=1 WHERE dest_id=? AND lu=0',
                          (moi['id'],))
            nb_msg = c.execute('''SELECT COUNT(*) n FROM messages
                                  WHERE vers_id=? AND lu=0''',
                               (moi['id'],)).fetchone()['n']
        self._json({'ok': True, 'evenements': evenements,
                    'nb_messages': nb_msg})


    # ===== Validation, consentement, gaming (build 3) ====================
    def verification_moi(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        out = {'ok': True, 'verifie': moi.get('verifie', False),
               'type': moi['type']}
        if moi['type'] == 'staff':
            with db() as c:
                rows = c.execute(
                    "SELECT id, nom, tel, type, cree_le FROM users "
                    "WHERE verifie=0 AND type!='staff' ORDER BY cree_le").fetchall()
            out['en_attente'] = [{'id': r['id'], 'nom': r['nom'],
                                  'tel': r['tel'], 'type': r['type'],
                                  'cree_le': r['cree_le']} for r in rows]
        self._json(out)

    def verifier_membre(self):
        moi = self._user()
        if not moi or moi['type'] != 'staff':
            self._json({'ok': False, 'erreur': 'réservé au personnel'}, 403)
            return
        d = self._json_corps()
        uid = d.get('user_id') or ''
        tel = d.get('tel') or ''
        with db() as c:
            if uid:
                cible = c.execute('SELECT id FROM users WHERE id=?',
                                  (uid,)).fetchone()
            elif tel:
                cible = c.execute('SELECT id FROM users WHERE tel=?',
                                  (re.sub(r'[\s.\-]', '', tel)[:15],)).fetchone()
            else:
                self._json({'ok': False, 'erreur': 'user_id ou tel requis'})
                return
            if not cible:
                self._json({'ok': False, 'erreur': 'membre introuvable'}, 404)
                return
            c.execute('UPDATE users SET verifie=1 WHERE id=?', (cible['id'],))
        self._json({'ok': True})

    def consent_moi(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        self._json({'ok': True, 'consent': moi.get('consent', {})})

    def consent_mettre(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        cur = dict(moi.get('consent', {}) or {})
        for k in ('classement', 'offres_contact', 'notifs_son'):
            if k in d:
                cur[k] = bool(d[k])
        with db() as c:
            c.execute('UPDATE users SET consent=? WHERE id=?',
                      (json.dumps(cur), moi['id']))
        self._json({'ok': True, 'consent': cur})

    def classement(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        with db() as c:
            rows = c.execute(
                "SELECT id, nom, type, pts, avatar, logo, consent FROM users "
                "WHERE verifie=1 ORDER BY pts DESC LIMIT 30").fetchall()
        out = []
        for r in rows:
            try:
                cons = json.loads(r['consent'] or '{}')
            except Exception:
                cons = {}
            if not cons.get('classement'):
                continue   # consentement : opt-in pour figurer au classement
            out.append({'rang': len(out) + 1, 'id': r['id'], 'nom': r['nom'],
                        'type': r['type'], 'pts': r['pts'],
                        'niveau': niveau(r['pts']),
                        'avatar': '/avatar/' + r['avatar'] if r['avatar'] else None,
                        'logo': '/logo/' + r['logo'] if r['logo'] else None,
                        'moi': r['id'] == moi['id']})
        self._json({'ok': True, 'classement': out,
                    'mes_rang': next((x['rang'] for x in out if x['moi']), None)})

    def missions_moi(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        with db() as c:
            faits = {r['mission_id'] for r in c.execute(
                'SELECT mission_id FROM missions_faites WHERE user_id=?',
                (moi['id'],)).fetchall()}
            compteurs = {
                'posts': c.execute('SELECT COUNT(*) n FROM posts WHERE auteur_id=?',
                                   (moi['id'],)).fetchone()['n'],
                'photos': c.execute(
                    'SELECT COUNT(*) n FROM post_photos pp '
                    'JOIN posts p ON p.id=pp.post_id WHERE p.auteur_id=?',
                    (moi['id'],)).fetchone()['n'],
                'commentaires': c.execute(
                    'SELECT COUNT(*) n FROM commentaires WHERE user_id=?',
                    (moi['id'],)).fetchone()['n'],
                'envois': c.execute('SELECT COUNT(*) n FROM envois WHERE de_id=?',
                                    (moi['id'],)).fetchone()['n'],
                'achats': 0,
            }
            f = c.execute('SELECT nb_achats n FROM fidelite WHERE tel=?',
                          (moi['tel'],)).fetchone()
            if f:
                compteurs['achats'] = f['n']
        out = []
        for m in MISSIONS:
            if m.get('pro') and moi['type'] != 'partenaire':
                continue
            if m.get('type') == 'achats' and moi['type'] != 'client':
                continue
            prog = min(compteurs.get(m['type'], 0), m['cible'])
            fait = m['id'] in faits or prog >= m['cible']
            out.append({'id': m['id'], 'nom': m['nom'], 'icone': m['icone'],
                        'desc': m['desc'], 'pts': m['pts'], 'cible': m['cible'],
                        'progression': prog, 'fait': fait})
        self._json({'ok': True, 'missions': out})

    def mission_faire(self):
        """Encaisse les points d'une mission dont la condition est remplie."""
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        mid = d.get('id') or ''
        m = next((x for x in MISSIONS if x['id'] == mid), None)
        if not m:
            self._json({'ok': False, 'erreur': 'mission inconnue'})
            return
        with db() as c:
            if c.execute('SELECT 1 FROM missions_faites WHERE user_id=? AND mission_id=?',
                         (moi['id'], mid)).fetchone():
                self._json({'ok': False, 'erreur': 'déjà accomplie'})
                return
            t = m['type']
            if t == 'posts':
                compte = c.execute('SELECT COUNT(*) n FROM posts WHERE auteur_id=?',
                                   (moi['id'],)).fetchone()['n']
            elif t == 'photos':
                compte = c.execute(
                    'SELECT COUNT(*) n FROM post_photos pp '
                    'JOIN posts p ON p.id=pp.post_id WHERE p.auteur_id=?',
                    (moi['id'],)).fetchone()['n']
            elif t == 'commentaires':
                compte = c.execute(
                    'SELECT COUNT(*) n FROM commentaires WHERE user_id=?',
                    (moi['id'],)).fetchone()['n']
            elif t == 'envois':
                compte = c.execute('SELECT COUNT(*) n FROM envois WHERE de_id=?',
                                   (moi['id'],)).fetchone()['n']
            else:  # achats
                f = c.execute('SELECT nb_achats n FROM fidelite WHERE tel=?',
                              (moi['tel'],)).fetchone()
                compte = f['n'] if f else 0
            if compte < m['cible']:
                self._json({'ok': False, 'erreur': 'condition non remplie'})
                return
            c.execute('INSERT INTO missions_faites VALUES (?,?,?)',
                      (moi['id'], mid, time.time()))
            self._gagner(c, moi['id'], m['pts'])
        self._json({'ok': True, 'pts': m['pts']})

    def badges_moi(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        acquis = moi.get('badges', []) or []
        out = [{'id': b['id'], 'nom': b['nom'], 'icone': b['icone'],
                'desc': b['desc'], 'acquis': b['id'] in acquis} for b in BADGES]
        self._json({'ok': True, 'badges': out,
                    'nb_acquis': sum(1 for x in out if x['acquis'])})

    def recompenses_liste(self):
        self._json({'ok': True, 'recompenses': RECOMPENSES})

    def recompense_acheter(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie()
            return
        d = self._json_corps()
        rid = d.get('reward_id') or ''
        r = next((x for x in RECOMPENSES if x['id'] == rid), None)
        if not r:
            self._json({'ok': False, 'erreur': 'récompense inconnue'})
            return
        with db() as c:
            u = c.execute('SELECT pts FROM users WHERE id=?',
                          (moi['id'],)).fetchone()
            if not u or u['pts'] < r['cout']:
                self._json({'ok': False, 'erreur':
                            'Points insuffisants (' + str(r['cout']) + ' nécessaires).'})
                return
            c.execute('UPDATE users SET pts = pts - ? WHERE id=?',
                      (r['cout'], moi['id']))
            c.execute('INSERT INTO recompenses VALUES (?,?,?,?,?)',
                      (uuid.uuid4().hex, moi['id'], rid, r['cout'], time.time()))
            self._badge(c, moi['id'], 'generos')
        self._json({'ok': True, 'reward': r['nom'], 'cout': r['cout']})

    def reaction_toggle(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        if self._bloque_non_verifie(moi):
            self._reponse_non_verifie()
            return
        d = self._json_corps()
        pid = d.get('id') or ''
        emoji = d.get('emoji') or ''
        if emoji not in ('❤️', '😍', '👏', '🤝'):
            self._json({'ok': False, 'erreur': 'réaction inconnue'})
            return
        with db() as c:
            if not c.execute('SELECT 1 FROM posts WHERE id=?', (pid,)).fetchone():
                self._json({'ok': False, 'erreur': 'post introuvable'}, 404)
                return
            deja = c.execute(
                'SELECT 1 FROM reactions WHERE post_id=? AND user_id=? AND emoji=?',
                (pid, moi['id'], emoji)).fetchone()
            if deja:
                c.execute('DELETE FROM reactions WHERE post_id=? AND user_id=? AND emoji=?',
                          (pid, moi['id'], emoji))
                act = False
            else:
                c.execute('INSERT INTO reactions VALUES (?,?,?)',
                          (pid, moi['id'], emoji))
                act = True
                a = c.execute('SELECT auteur_id FROM posts WHERE id=?',
                              (pid,)).fetchone()
                if a and a['auteur_id'] != moi['id']:
                    au = c.execute('SELECT * FROM users WHERE id=?',
                                   (a['auteur_id'],)).fetchone()
                    if au and au['verifie']:
                        try:
                            cons = json.loads(au['consent'] or '{}')
                        except Exception:
                            cons = {}
                        if au['type'] in ('staff', 'partenaire') or cons.get('offres_contact'):
                            self._evenement(c, a['auteur_id'], 'mention',
                                            {'de': moi['id'],
                                             'texte': 'réagit ' + emoji + ' à votre post'})
            nb = c.execute('SELECT COUNT(*) n FROM reactions WHERE post_id=?',
                           (pid,)).fetchone()['n']
            if nb >= 5:
                a = c.execute('SELECT auteur_id FROM posts WHERE id=?',
                              (pid,)).fetchone()
                if a:
                    self._badge(c, a['auteur_id'], 'vedette')
        self._json({'ok': True, 'active': act})

    def suivre_toggle(self):
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        target = d.get('id') or ''
        if target == moi['id']:
            self._json({'ok': False, 'erreur': 'vous ne pouvez pas vous suivre'})
            return
        with db() as c:
            tgt = c.execute('SELECT * FROM users WHERE id=?', (target,)).fetchone()
            if not tgt:
                self._json({'ok': False, 'erreur': 'membre introuvable'}, 404)
                return
            deja = c.execute(
                'SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?',
                (moi['id'], target)).fetchone()
            if deja:
                c.execute('DELETE FROM follows WHERE follower_id=? AND followee_id=?',
                          (moi['id'], target))
                act = False
            else:
                c.execute('INSERT INTO follows VALUES (?,?,?)',
                          (moi['id'], target, time.time()))
                act = True
                if tgt['verifie']:
                    try:
                        cons = json.loads(tgt['consent'] or '{}')
                    except Exception:
                        cons = {}
                    if tgt['type'] in ('staff', 'partenaire') or cons.get('offres_contact'):
                        self._evenement(c, target, 'mention',
                                        {'de': moi['id'],
                                         'texte': 'vous suit maintenant'})
        self._json({'ok': True, 'suivi': act})

    def offres_essayer(self):
        """Un client « essaie » une offre : conversion croisée (points part + client)."""
        moi = self._user()
        if not moi:
            self._json({'ok': False, 'erreur': 'non connecté'}, 401)
            return
        d = self._json_corps()
        oid = d.get('id') or ''
        with db() as c:
            o = c.execute('SELECT * FROM offres WHERE id=? AND active=1',
                          (oid,)).fetchone()
            if not o or o['fin'] < time.time():
                self._json({'ok': False, 'erreur': 'offre expirée'}, 404)
                return
            deja = c.execute(
                'SELECT 1 FROM offres_essayees WHERE offre_id=? AND user_id=?',
                (oid, moi['id'])).fetchone()
            if deja:
                self._json({'ok': False, 'erreur': 'déjà essayé'})
                return
            c.execute('INSERT INTO offres_essayees VALUES (?,?,?)',
                      (oid, moi['id'], time.time()))
            self._gagner(c, moi['id'], 15)
            self._gagner(c, o['partenaire_id'], 10)
            self._evenement(c, o['partenaire_id'], 'mention',
                            {'de': moi['id'],
                             'texte': 'a essayé votre offre « ' + o['titre'] + ' »'})
        self._json({'ok': True, 'pts': 15})

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
