#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La Trattoria — serveur local de la carte.

Rôle :
  1. sert le module « Gestion de la carte » (fichiers statiques) ;
  2. fait office de relais de synchronisation entre tablettes :
     GET  /api/etat   -> {"version": n}
     GET  /api/liens  -> URLs officielles de gestion, public, aperçu et API
     GET  /api/carte  -> {"version": n, "maj": "...", "carte": [...], "ardoises": {...}}
     POST /api/carte  <- {"carte": [...], "ardoises": {...}}  (jeton requis ; dernière écriture fait foi)
  3. sert la page publique des clients (public.html) sur le Wi-Fi ;
  4. relaie, avec un jeton de gestion, la lecture du catalogue et la création
     explicite de produits dans Hiboutik ; les identifiants restent côté serveur.

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

try:
    from .hiboutik_client import (HiboutikClient, HiboutikErreur,
                                  configuration_hiboutik)
except ImportError:  # lancement direct : python3 serveur_carte.py
    from hiboutik_client import (HiboutikClient, HiboutikErreur,
                                 configuration_hiboutik)

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


def _hiboutik_payload(produit, configuration):
    """Transforme une fiche locale en payload API sans transmettre les photos."""
    if not isinstance(produit, dict):
        raise HiboutikErreur('Produit invalide', 400)
    nom = str(produit.get('nom', '')).strip()
    if not nom or len(nom) > 120:
        raise HiboutikErreur('Le nom du produit est obligatoire', 400)
    try:
        pv = float(produit.get('pv', 0))
        cout = float(produit.get('cout', 0) or 0)
        tva = float(produit.get('tva', 0.1))
    except (TypeError, ValueError):
        raise HiboutikErreur('Prix ou TVA invalide', 400)
    if not (0 < pv <= 100000) or cout < 0 or tva not in (0.055, 0.1, 0.2):
        raise HiboutikErreur('Prix ou TVA hors limites', 400)
    barcode = str(produit.get('hiboutikBarcode', produit.get('barcode', '')) or '').strip()
    if len(barcode) > 80:
        raise HiboutikErreur('Code-barres trop long', 400)
    tax_key = '0.055' if tva == 0.055 else ('0.20' if tva == 0.2 else '0.10')
    tax_id = configuration['taxes'].get(tax_key, '0')
    category_id = str(produit.get('hiboutikCategoryId') or configuration['categorie'] or '0')
    if not tax_id or tax_id == '0':
        raise HiboutikErreur('Configurez l\'ID de taxe Hiboutik correspondant à la TVA.', 400)
    if not category_id or category_id == '0':
        raise HiboutikErreur('Configurez HIBOUTIK_DEFAULT_CATEGORY_ID avant une création.', 400)
    payload = {
        'product_model': nom,
        'product_barcode': barcode,
        'product_brand': configuration['marque'] or '0',
        'product_supplier': configuration['fournisseur'] or '0',
        'product_price': '{:.2f}'.format(pv),
        'product_discount_price': '{:.2f}'.format(pv),
        'product_category': category_id,
        'product_size_type': '0',
        'product_stock_management': '1' if produit.get('suiviStock') else '0',
        'product_supplier_reference': str(produit.get('referenceFournisseur', '') or '')[:80],
        'product_vat': tax_id or '0',
    }
    if cout > 0:
        payload['product_supply_price'] = '{:.2f}'.format(cout)
    return payload


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
                         "connect-src 'self' http: https:; frame-ancestors 'none'; base-uri 'self'")

    def end_headers(self):
        self._securite_headers()
        super().end_headers()

    def _envoyer_json(self, objet, code=200):
        corps = json.dumps(objet, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corps)))
        self.send_header('Cache-Control', 'no-store')
        origine = self.headers.get('Origin')
        if origine and self._origine_autorisee():
            self.send_header('Access-Control-Allow-Origin', origine)
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Carte-Token')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(corps)

    def _chemin_api(self):
        chemin = urlparse(self.path).path.rstrip('/')
        routes = {
            '/api/etat', '/api/carte', '/api/liens', '/api/hiboutik/statut',
            '/api/hiboutik/catalogue', '/api/hiboutik/produits'
        }
        return chemin if chemin in routes else None

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
    def do_OPTIONS(self):
        if not self._chemin_api() or not self._origine_autorisee():
            self._envoyer_json({'ok': False, 'erreur': 'origine refusée'}, 403)
            return
        self._envoyer_json({'ok': True})

    def do_GET(self):
        api = self._chemin_api()
        if api == '/api/liens':
            base = '{}://{}'.format('https' if self.headers.get('X-Forwarded-Proto') == 'https' else 'http',
                                     self.headers.get('Host') or '')
            self._envoyer_json({'base': base,
                                'gestion': base + '/index.html',
                                'public': base + '/public.html',
                                'apercu': base + '/apercu-carte.html',
                                'impression': base + '/impression/preview-modifiable.html',
                                'api': base + '/api/etat'})
            return
        if api == '/api/hiboutik/statut':
            try:
                configuration = configuration_hiboutik()
                configure = configuration is not None
                manquants = []
                if configure:
                    if not configuration['categorie'] or configuration['categorie'] == '0':
                        manquants.append('HIBOUTIK_DEFAULT_CATEGORY_ID')
                    if any(not configuration['taxes'].get(cle) or configuration['taxes'].get(cle) == '0'
                           for cle in ('0.055', '0.10', '0.20')):
                        manquants.append('HIBOUTIK_TAX_ID_055/10/20')
                pret = configure and not manquants
                self._envoyer_json({'configure': configure, 'creation': pret,
                                    'ecriture': configure,
                                    'manquants': manquants,
                                    'message': ('Connexion Hiboutik prête à créer des produits.'
                                                if pret else
                                                ('Connexion Hiboutik OK ; configuration manquante : ' +
                                                 ', '.join(manquants) if configure else
                                                 'Configurer HIBOUTIK_ACCOUNT, HIBOUTIK_API_USER et HIBOUTIK_API_KEY.'))})
            except HiboutikErreur as exc:
                self._envoyer_json({'configure': False, 'ecriture': False,
                                    'message': str(exc)}, exc.code)
            return
        if api == '/api/hiboutik/catalogue':
            if not self._origine_autorisee():
                self._envoyer_json({'ok': False, 'erreur': 'origine refusée'}, 403)
                return
            if not self._ecriture_autorisee():
                self._envoyer_json({'ok': False, 'erreur': 'jeton de gestion requis'}, 401)
                return
            try:
                produits = HiboutikClient().produits()
                self._envoyer_json({'ok': True, 'produits': produits,
                                    'maj': datetime.now(timezone.utc).isoformat()})
            except HiboutikErreur as exc:
                self._envoyer_json({'ok': False, 'erreur': str(exc)}, exc.code)
            return
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
        if api not in ('/api/carte', '/api/hiboutik/produits'):
            self._envoyer_json({'ok': False, 'erreur': 'route inconnue'}, 404)
            return
        if not self._origine_autorisee():
            self._envoyer_json({'ok': False, 'erreur': 'origine refusée'}, 403)
            return
        if not self._ecriture_autorisee():
            self._envoyer_json({'ok': False, 'erreur': 'jeton de gestion requis'}, 401)
            return
        if api == '/api/hiboutik/produits':
            try:
                longueur = int(self.headers.get('Content-Length', '0'))
                if longueur <= 0 or longueur > 256 * 1024:
                    raise ValueError('corps trop gros ou absent')
                brut = self.rfile.read(longueur)
                recu = json.loads(brut.decode('utf-8'))
                produit = recu.get('produit') if isinstance(recu, dict) else None
                configuration = configuration_hiboutik()
                payload = _hiboutik_payload(produit, configuration)
                client = HiboutikClient(configuration)
                # Une deuxième création avec le même code-barres ou le même
                # nom est refusée pour éviter les doublons en cas de double clic.
                existants = client.produits()
                nom = payload['product_model'].casefold()
                code = payload['product_barcode']
                for existant in existants:
                    if (code and existant.get('barcode') == code) or \
                            existant.get('nom', '').casefold() == nom:
                        self._envoyer_json({'ok': False, 'doublon': existant,
                                            'erreur': 'Produit déjà présent dans Hiboutik'}, 409)
                        return
                cree = client.creer_produit(payload)
                self._envoyer_json({'ok': True, 'produit': cree,
                                    'avertissements': []}, 201)
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                self._envoyer_json({'ok': False, 'erreur': str(exc)}, 400)
            except HiboutikErreur as exc:
                self._envoyer_json({'ok': False, 'erreur': str(exc)}, exc.code)
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
