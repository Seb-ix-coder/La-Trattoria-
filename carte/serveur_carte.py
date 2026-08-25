#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La Trattoria — serveur local de la carte.

Rôle :
  1. sert le module « Gestion de la carte » (fichiers statiques) ;
  2. fait office de relais de synchronisation entre tablettes :
     GET  /api/etat   -> {"version": n}
     GET  /api/carte  -> {"version": n, "maj": "...", "carte": [...], "ardoises": {...}}
     POST /api/carte  <- {"carte": [...], "ardoises": {...}}  (la dernière écriture fait foi)
  3. sert la page publique des clients (public.html) sur le Wi-Fi.

Lancement :  python3 serveur_carte.py [port]   (8080 par défaut)
L'état est conservé dans donnees-serveur.json, à côté de ce fichier.
Aucune dépendance externe : bibliothèque standard Python 3 uniquement.
"""
import json
import os
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DOSSIER = os.path.dirname(os.path.abspath(__file__))
FICHIER_ETAT = os.path.join(DOSSIER, 'donnees-serveur.json')

etat = {'version': 0, 'maj': None, 'carte': [], 'ardoises': {}}


def charger_etat():
    global etat
    try:
        with open(FICHIER_ETAT, 'r', encoding='utf-8') as f:
            lu = json.load(f)
        if isinstance(lu.get('carte'), list):
            etat['version'] = int(lu.get('version', 0))
            etat['maj'] = lu.get('maj')
            etat['carte'] = lu['carte']
            if isinstance(lu.get('ardoises'), dict):
                etat['ardoises'] = lu['ardoises']
    except Exception:
        pass  # premier démarrage : état vide, la première tablette nourrira le serveur


def sauver_etat():
    tmp = FICHIER_ETAT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(etat, f, ensure_ascii=False)
    os.replace(tmp, FICHIER_ETAT)


class ServeurCarte(SimpleHTTPRequestHandler):
    server_version = 'LaTrattoriaCarte/1.0'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DOSSIER, **kwargs)

    # ---------- utilitaires ----------
    def _envoyer_json(self, objet, code=200):
        corps = json.dumps(objet, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corps)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(corps)

    def _chemin_api(self):
        chemin = self.path.split('?', 1)[0].rstrip('/')
        return chemin if chemin.endswith(('/api/etat', '/api/carte')) else None

    # ---------- routes ----------
    def do_GET(self):
        api = self._chemin_api()
        if api and api.endswith('/api/etat'):
            self._envoyer_json({'version': etat['version']})
            return
        if api and api.endswith('/api/carte'):
            self._envoyer_json(etat)
            return
        super().do_GET()

    def do_POST(self):
        api = self._chemin_api()
        if not (api and api.endswith('/api/carte')):
            self._envoyer_json({'ok': False, 'erreur': 'route inconnue'}, 404)
            return
        try:
            longueur = int(self.headers.get('Content-Length', '0'))
            if longueur > 20 * 1024 * 1024:          # garde-fou : 20 Mo
                raise ValueError('trop gros')
            recu = json.loads(self.rfile.read(longueur).decode('utf-8'))
            carte = recu.get('carte')
            if not isinstance(carte, list) or not carte:
                raise ValueError('carte invalide')
            ardoises = recu.get('ardoises')
            etat['carte'] = carte
            if isinstance(ardoises, dict):
                etat['ardoises'] = ardoises
            etat['version'] += 1
            etat['maj'] = datetime.now(timezone.utc).isoformat()
            sauver_etat()
            self._envoyer_json({'ok': True, 'version': etat['version']})
        except Exception as exc:
            self._envoyer_json({'ok': False, 'erreur': str(exc)}, 400)

    # ---------- discrétion dans les logs ----------
    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    charger_etat()
    serveur = ThreadingHTTPServer(('', port), ServeurCarte)
    print('Serveur de la carte La Trattoria')
    print('  Gestion      : http://<adresse-wifi>:{}/index.html'.format(port))
    print('  Page clients : http://<adresse-wifi>:{}/public.html'.format(port))
    print('  (Ctrl+C pour arrêter)')
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
