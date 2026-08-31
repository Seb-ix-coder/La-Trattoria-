#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La Trattoria — serveur local de la carte.

Rôle :
  1. sert le module « Gestion de la carte » (fichiers statiques) ;
  2. fait office de relais de synchronisation entre tablettes :
     GET  /api/etat   -> {"version": n}
     GET  /api/carte  -> {"version": n, "maj": "...", "carte": [...], "ardoises": {...}}
     POST /api/carte  <- {"carte": [...], "ardoises": {...}}  (jeton requis ; dernière écriture fait foi)
  3. sert la page publique des clients (public.html) sur le Wi-Fi.

Lancement :  python3 serveur_carte.py [port]   (8080 par défaut)
L'état est conservé dans donnees-serveur.json, qui n'est pas servi comme fichier statique.
Le jeton est généré hors du dossier servi. Aucune dépendance externe : bibliothèque standard Python 3 uniquement.
"""
import json
import hmac
import os
import secrets
import sys
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

DOSSIER = os.path.dirname(os.path.abspath(__file__))
FICHIER_ETAT = os.path.join(DOSSIER, 'donnees-serveur.json')
TOKEN_FILE = os.environ.get(
    'CARTE_TOKEN_FILE',
    os.path.join(os.path.expanduser('~'), '.config', 'la-trattoria', 'carte-api-token')
)
MAX_BODY = 20 * 1024 * 1024

etat = {'version': 0, 'maj': None, 'carte': [], 'ardoises': {}, 'config': {}}
ETAT_LOCK = threading.RLock()
API_TOKEN = ''


def charger_token():
    """Charge un jeton hors du dossier servi, ou en génère un au premier démarrage."""
    global API_TOKEN
    fourni = os.environ.get('CARTE_API_TOKEN', '').strip()
    if fourni:
        if len(fourni) < 32:
            raise RuntimeError('CARTE_API_TOKEN doit contenir au moins 32 caractères')
        API_TOKEN = fourni
        return
    try:
        with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
            API_TOKEN = f.read().strip()
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        API_TOKEN = ''
    if len(API_TOKEN) < 32:
        API_TOKEN = secrets.token_urlsafe(32)
        dossier = os.path.dirname(TOKEN_FILE)
        os.makedirs(dossier, mode=0o700, exist_ok=True)
        fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, API_TOKEN.encode('ascii'))
        finally:
            os.close(fd)
        print('Jeton API créé dans : {}'.format(TOKEN_FILE))
    if len(API_TOKEN) < 32:
        raise RuntimeError('CARTE_API_TOKEN doit contenir au moins 32 caractères')


def charger_etat():
    global etat
    try:
        with open(FICHIER_ETAT, 'r', encoding='utf-8') as f:
            lu = json.load(f)
        if isinstance(lu.get('carte'), list):
            with ETAT_LOCK:
                etat['version'] = int(lu.get('version', 0))
                etat['maj'] = lu.get('maj')
                etat['carte'] = lu['carte']
                if isinstance(lu.get('ardoises'), dict):
                    etat['ardoises'] = lu['ardoises']
                if isinstance(lu.get('config'), dict):
                    etat['config'] = lu['config']
    except Exception:
        pass  # premier démarrage : état vide, la première tablette nourrira le serveur


def sauver_etat():
    # Un nom temporaire par processus évite que deux écritures se remplacent.
    tmp = '{}.{}.tmp'.format(FICHIER_ETAT, os.getpid())
    with ETAT_LOCK:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(etat, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, FICHIER_ETAT)


class ServeurCarte(SimpleHTTPRequestHandler):
    server_version = 'LaTrattoriaCarte/1.0'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DOSSIER, **kwargs)

    # ---------- utilitaires ----------
    def _securite_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy',
                         "default-src 'self'; img-src 'self' data:; "
                         "style-src 'self' 'unsafe-inline'; script-src 'self'; "
                         "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")

    def end_headers(self):
        self._securite_headers()
        super().end_headers()

    def _envoyer_json(self, objet, code=200):
        corps = json.dumps(objet, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corps)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(corps)

    def _chemin_api(self):
        chemin = urlparse(self.path).path.rstrip('/')
        return chemin if chemin in ('/api/etat', '/api/carte') else None

    def _origine_autorisee(self):
        origine = self.headers.get('Origin')
        if not origine:
            return True
        autorisees = {x.strip().rstrip('/') for x in
                      os.environ.get('CARTE_ALLOWED_ORIGINS', '').split(',') if x.strip()}
        origine = origine.rstrip('/')
        if origine in autorisees:
            return True
        try:
            parsed = urlparse(origine)
            return parsed.scheme in ('http', 'https') and parsed.netloc == (self.headers.get('Host') or '')
        except Exception:
            return False

    def _ecriture_autorisee(self):
        jeton = self.headers.get('X-Carte-Token', '')
        return bool(API_TOKEN) and hmac.compare_digest(jeton, API_TOKEN)

    # ---------- routes ----------
    def do_GET(self):
        api = self._chemin_api()
        if api == '/api/etat':
            with ETAT_LOCK:
                version = etat['version']
            self._envoyer_json({'version': version})
            return
        if api == '/api/carte':
            with ETAT_LOCK:
                contenu = dict(etat)
                contenu['carte'] = list(etat['carte'])
                contenu['ardoises'] = dict(etat['ardoises'])
                contenu['config'] = dict(etat['config'])
            self._envoyer_json(contenu)
            return
        chemin = unquote(urlparse(self.path).path).lstrip('/')
        # L'état métier contient coûts, marges et photos : il ne doit jamais
        # devenir un fichier statique téléchargeable. Les scripts Python et les
        # archives d'APK ne sont pas non plus des ressources de l'application.
        suffixe = Path(chemin).suffix.lower()
        autorise = (not chemin or chemin.rstrip('/') == 'impression' or suffixe in {
            '.html', '.js', '.css', '.webmanifest', '.woff2', '.png', '.jpg',
            '.jpeg', '.gif', '.svg', '.ico', '.b64'
        })
        if not autorise or chemin == 'donnees-serveur.json' or chemin.startswith('donnees-serveur.json.'):
            self._envoyer_json({'ok': False, 'erreur': 'introuvable'}, 404)
            return
        super().do_GET()

    def do_POST(self):
        api = self._chemin_api()
        if api != '/api/carte':
            self._envoyer_json({'ok': False, 'erreur': 'route inconnue'}, 404)
            return
        if not self._origine_autorisee():
            self._envoyer_json({'ok': False, 'erreur': 'origine refusée'}, 403)
            return
        if not self._ecriture_autorisee():
            self._envoyer_json({'ok': False, 'erreur': 'jeton de synchronisation requis'}, 401)
            return
        try:
            longueur = int(self.headers.get('Content-Length', '0'))
            if longueur <= 0 or longueur > MAX_BODY:
                raise ValueError('corps trop gros ou absent')
            brut = self.rfile.read(longueur)
            if len(brut) != longueur:
                raise ValueError('corps incomplet')
            recu = json.loads(brut.decode('utf-8'))
            if not isinstance(recu, dict):
                raise ValueError('objet JSON attendu')
            carte = recu.get('carte')
            if not isinstance(carte, list) or len(carte) > 500:
                raise ValueError('carte invalide (500 produits maximum)')
            if any(not isinstance(p, dict) for p in carte):
                raise ValueError('produit invalide')
            ardoises = recu.get('ardoises')
            config = recu.get('config')
            with ETAT_LOCK:
                etat['carte'] = carte
                if isinstance(ardoises, dict):
                    etat['ardoises'] = ardoises
                if isinstance(config, dict):
                    etat['config'] = config
                etat['version'] += 1
                etat['maj'] = datetime.now(timezone.utc).isoformat()
                sauver_etat()
                version = etat['version']
            self._envoyer_json({'ok': True, 'version': version})
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._envoyer_json({'ok': False, 'erreur': str(exc)}, 400)
        except OSError:
            self._envoyer_json({'ok': False, 'erreur': 'enregistrement impossible'}, 500)

    # ---------- discrétion dans les logs ----------
    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    charger_token()
    charger_etat()
    serveur = ThreadingHTTPServer(('0.0.0.0', port), ServeurCarte)
    print('Serveur de la carte La Trattoria')
    print('  Gestion      : http://<adresse-wifi>:{}/index.html'.format(port))
    print('  Page clients : http://<adresse-wifi>:{}/public.html'.format(port))
    print('  Token gestion: lire {}'.format(TOKEN_FILE))
    print('  (Ctrl+C pour arrêter)')
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
