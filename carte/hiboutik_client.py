#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Relais minimal et sûr vers l'API Hiboutik.

Les identifiants restent dans l'environnement du serveur de carte : ils ne
sont jamais envoyés au navigateur ni écrits dans donnees-serveur.json.
L'API v2 Hiboutik utilise une authentification Basic et des formulaires
x-www-form-urlencoded pour les écritures.
"""
import base64
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


_COMPTE_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_MAX_REPONSE = 8 * 1024 * 1024


class HiboutikErreur(Exception):
    """Erreur API sans jamais inclure la clé ou le mot de passe."""

    def __init__(self, message, code=502, detail=None):
        super().__init__(message)
        self.code = code
        self.detail = detail


def configuration_hiboutik():
    """Lit la configuration côté serveur et refuse les comptes ambigus."""
    compte = os.environ.get('HIBOUTIK_ACCOUNT', '').strip().lower()
    utilisateur = os.environ.get('HIBOUTIK_API_USER', '').strip()
    cle = os.environ.get('HIBOUTIK_API_KEY', '').strip()
    if not compte and not utilisateur and not cle:
        return None
    if not _COMPTE_RE.fullmatch(compte):
        raise HiboutikErreur('HIBOUTIK_ACCOUNT invalide', 500)
    if not utilisateur or not cle:
        raise HiboutikErreur('Configuration Hiboutik incomplète', 500)
    return {
        'compte': compte,
        'utilisateur': utilisateur,
        'cle': cle,
        'taxes': {
            '0.055': os.environ.get('HIBOUTIK_TAX_ID_055', '0').strip(),
            '0.10': os.environ.get('HIBOUTIK_TAX_ID_10', '0').strip(),
            '0.20': os.environ.get('HIBOUTIK_TAX_ID_20', '0').strip(),
        },
        'categorie': os.environ.get('HIBOUTIK_DEFAULT_CATEGORY_ID', '0').strip(),
        'marque': os.environ.get('HIBOUTIK_DEFAULT_BRAND_ID', '0').strip(),
        'fournisseur': os.environ.get('HIBOUTIK_DEFAULT_SUPPLIER_ID', '0').strip(),
    }


def _nombre(obj, *cles):
    for cle in cles:
        if isinstance(obj, dict) and cle in obj:
            try:
                valeur = float(obj[cle])
                if valeur == valeur and valeur not in (float('inf'), float('-inf')):
                    return valeur
            except (TypeError, ValueError):
                pass
    return None


def _id(obj):
    if not isinstance(obj, dict):
        return ''
    for cle in ('product_id', 'id', 'productId'):
        if obj.get(cle) not in (None, ''):
            return str(obj[cle])
    return ''


def normaliser_produit_hiboutik(obj):
    """Réduit une réponse Hiboutik aux champs utiles à la carte.

    Les noms stock/prix varient selon les versions et les ressources API ; les
    alias connus sont acceptés, sans exposer la réponse brute au navigateur.
    """
    if not isinstance(obj, dict):
        return None
    identifiant = _id(obj)
    nom = str(obj.get('product_model', obj.get('model', obj.get('name', '')))).strip()
    if not identifiant or not nom:
        return None
    stock = _nombre(obj, 'stock_available', 'product_stock', 'stock', 'quantity', 'qte')
    prix = _nombre(obj, 'product_price', 'price', 'selling_price', 'pv')
    cout = _nombre(obj, 'product_supply_price', 'supply_price', 'cost', 'cout')
    barcode = str(obj.get('product_barcode', obj.get('barcode', '')) or '').strip()
    suivi = obj.get('product_stock_management', obj.get('stock_management', 0))
    suivi = str(suivi).strip().lower() in ('1', 'true', 'yes', 'oui')
    return {
        'hiboutikId': identifiant,
        'nom': nom[:120],
        'barcode': barcode[:80],
        'pv': round(prix, 2) if prix is not None else None,
        'cout': round(cout, 2) if cout is not None else None,
        'stock': round(stock, 3) if stock is not None else None,
        'stockSuivi': suivi,
        'categorie': obj.get('product_category', obj.get('category', '')),
    }


def extraire_produits(reponse):
    """Accepte les enveloppes courantes de l'API et les réponses tableau."""
    if isinstance(reponse, list):
        candidats = reponse
    elif isinstance(reponse, dict):
        candidats = None
        for cle in ('products', 'produits', 'data', 'results', 'items'):
            if isinstance(reponse.get(cle), list):
                candidats = reponse[cle]
                break
        if candidats is None:
            candidats = [reponse]
    else:
        candidats = []
    out = []
    vus = set()
    for obj in candidats:
        produit = normaliser_produit_hiboutik(obj)
        if produit and produit['hiboutikId'] not in vus:
            vus.add(produit['hiboutikId'])
            out.append(produit)
    return out


class HiboutikClient:
    def __init__(self, configuration=None, timeout=12):
        self.config = configuration or configuration_hiboutik()
        if not self.config:
            raise HiboutikErreur('Hiboutik n\'est pas configuré', 503)
        self.timeout = timeout
        self.base = 'https://{}.hiboutik.com/api'.format(self.config['compte'])
        identite = '{}:{}'.format(self.config['utilisateur'], self.config['cle']).encode('utf-8')
        self.authorization = 'Basic ' + base64.b64encode(identite).decode('ascii')

    def _requete(self, chemin, methode='GET', donnees=None):
        chemin = '/' + chemin.lstrip('/')
        corps = None
        headers = {
            'Accept': 'application/json',
            'Authorization': self.authorization,
            'User-Agent': 'LaTrattoriaCarte/1.0',
        }
        if donnees is not None:
            corps = urlencode(donnees).encode('utf-8')
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        request = Request(self.base + chemin, data=corps, headers=headers, method=methode)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                brut = response.read(_MAX_REPONSE + 1)
                if len(brut) > _MAX_REPONSE:
                    raise HiboutikErreur('Réponse Hiboutik trop volumineuse', 502)
                if not brut:
                    return {}
                try:
                    return json.loads(brut.decode('utf-8'))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    raise HiboutikErreur('Réponse Hiboutik invalide', 502)
        except HTTPError as exc:
            try:
                brut = exc.read(_MAX_REPONSE)
                detail = json.loads(brut.decode('utf-8')) if brut else None
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                detail = None
            raise HiboutikErreur('Hiboutik a refusé la requête (HTTP {})'.format(exc.code),
                                 502, detail)
        except (URLError, TimeoutError, OSError):
            raise HiboutikErreur('Hiboutik est momentanément inaccessible', 502)

    def produits(self):
        return extraire_produits(self._requete('/products/'))

    def creer_produit(self, donnees):
        """Crée un produit dans Hiboutik et renvoie la réponse normalisée."""
        reponse = self._requete('/products', 'POST', donnees)
        produits = extraire_produits(reponse)
        if produits:
            return produits[0]
        # Certaines installations renvoient uniquement {id: ...}.
        identifiant = _id(reponse) if isinstance(reponse, dict) else ''
        return {'hiboutikId': identifiant, 'reponse': reponse}
