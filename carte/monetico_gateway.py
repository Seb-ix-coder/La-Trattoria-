#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Relais serveur minimal et sécurisé pour Monetico Paiement.

Le navigateur ne reçoit jamais la clé commerçant. Le service prépare la
requête « Aller », vérifie la notification « Retour », puis conserve l'état
idempotent de la commande dans un fichier JSON. Il est volontairement basé
sur la bibliothèque standard Python afin de pouvoir être installé à côté du
serveur de carte sans dépendance supplémentaire.

Variables indispensables en production :
  MONETICO_TPE              numéro de TPE (7 caractères)
  MONETICO_SOCIETE          code société Monetico
  MONETICO_KEY_HEX          clé Monetico fournie par la banque (40 hex)
  MONETICO_PUBLIC_URL       URL HTTPS publique de ce relais
  MONETICO_CATALOGUE_FILE   catalogue JSON de référence {id: {pv: ...}}

Exemple :
  MONETICO_ENV=test MONETICO_TPE=1234567 MONETICO_SOCIETE=monSite \
  MONETICO_KEY_HEX=... MONETICO_PUBLIC_URL=https://paiement.example \
  MONETICO_CATALOGUE_FILE=/srv/la-trattoria/catalogue.json \
  python3 carte/monetico_gateway.py

La configuration Monetico doit également déclarer l'URL de notification :
  https://paiement.example/api/monetico/notify
Ne jamais mettre MONETICO_KEY_HEX dans l'APK, dans le JavaScript ou dans un
fichier servi au navigateur.
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = "3.0"
ACTION_TEST = "https://p.monetico-services.com/test/paiement.cgi"
ACTION_PRODUCTION = "https://p.monetico-services.com/paiement.cgi"
FORM_FIELDS = {
    "3dsdebrayable", "TPE", "ThreeDSecureChallenge", "aliascb",
    "contexte_commande", "date", "desactivemoyenpaiement", "forcesaisiecb",
    "lgue", "libelleMonetique", "libelleMonetiqueLocalite", "mail",
    "montant", "protocole", "reference", "societe", "texte-libre",
    "url_retour_err", "url_retour_ok", "version",
}
RETURN_ORDER = (
    "TPE", "date", "montant", "reference", "texte-libre", "version",
    "code-retour", "cvx", "vld", "brand", "status3ds", "numauto",
    "motifrefus", "originecb", "bincb", "hpancb", "ipclient", "originetr",
    "veres", "pares",
)
REFERENCE_RE = re.compile(r"^[A-Za-z0-9]{8,12}$")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def key_bytes(value: str) -> bytes:
    """Convertit la représentation externe de la clé Monetico en 20 octets."""
    value = value.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{40}", value):
        raise ValueError("MONETICO_KEY_HEX doit contenir exactement 40 caractères hexadécimaux")
    return bytes.fromhex(value)


def sign_form(secret: str, form: dict[str, str]) -> str:
    """MAC v3 de l'interface Aller : champs autorisés triés, séparés par *."""
    parts = []
    for name in sorted(form):
        if name in FORM_FIELDS:
            parts.append((name + "=" + str(form[name])).encode("utf-8"))
    return hmac.new(key_bytes(secret), b"*".join(parts), hashlib.sha1).hexdigest()


def sign_return(secret: str, form: dict[str, str]) -> str:
    """MAC v3 de l'interface Retour, dans l'ordre imposé par Monetico."""
    raw = "*".join(str(form.get(name, "")) for name in RETURN_ORDER) + "*"
    return hmac.new(key_bytes(secret), raw.encode("utf-8"), hashlib.sha1).hexdigest()


def money(value: object) -> Decimal:
    try:
        result = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("montant invalide")
    if result <= 0 or result > Decimal("100000.00"):
        raise ValueError("montant hors limites")
    return result


def load_catalogue(path: str) -> dict[str, Decimal]:
    if not path:
        raise RuntimeError("MONETICO_CATALOGUE_FILE n'est pas configuré")
    with open(path, "r", encoding="utf-8") as stream:
        raw = json.load(stream)
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict) and isinstance(raw.get("produits"), list):
        rows = raw["produits"]
    elif isinstance(raw, dict):
        rows = [{"id": key, **(value if isinstance(value, dict) else {"pv": value})}
                for key, value in raw.items()]
    else:
        raise RuntimeError("catalogue JSON invalide")
    catalogue = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("id") or not row.get("actif", True):
            continue
        catalogue[str(row["id"])] = money(row.get("pv", row.get("prix")))
    if not catalogue:
        raise RuntimeError("catalogue JSON vide")
    return catalogue


def reference() -> str:
    # 2 lettres + date UTC sur 6 chiffres + 4 caractères : 12 alphanumériques.
    return "LT" + dt.datetime.now(dt.timezone.utc).strftime("%y%m%d") + secrets.token_hex(2).upper()


def json_bytes(obj: object) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class Store:
    def __init__(self, path: str):
        self.path = path
        self.lock = threading.RLock()
        self.data: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        try:
            with open(self.path, "r", encoding="utf-8") as stream:
                value = json.load(stream)
            if isinstance(value, dict):
                self.data = value
        except (OSError, ValueError):
            self.data = {}

    def put(self, ref: str, value: dict) -> None:
        with self.lock:
            self.data[ref] = value
            folder = os.path.dirname(os.path.abspath(self.path))
            os.makedirs(folder, mode=0o700, exist_ok=True)
            temporary = self.path + ".tmp"
            with open(temporary, "w", encoding="utf-8") as stream:
                json.dump(self.data, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)

    def get(self, ref: str) -> dict | None:
        with self.lock:
            value = self.data.get(ref)
            return dict(value) if isinstance(value, dict) else None


class Config:
    def __init__(self):
        self.env = env("MONETICO_ENV", "test").lower()
        self.tpe = env("MONETICO_TPE")
        self.company = env("MONETICO_SOCIETE")
        self.secret = env("MONETICO_KEY_HEX")
        self.public_url = env("MONETICO_PUBLIC_URL").rstrip("/")
        self.catalogue_file = env("MONETICO_CATALOGUE_FILE")
        # API de la tablette ou du serveur de commandes. Après confirmation
        # Monetico, le relais y transmet la commande avec le statut payé.
        self.order_target = env("MONETICO_ORDER_TARGET")
        self.store_file = env("MONETICO_ORDER_STORE", "./monetico-orders.json")
        self.allowed_origins = {x.rstrip("/") for x in env("MONETICO_ALLOWED_ORIGINS").split(",") if x.strip()}

    def ready(self) -> tuple[bool, list[str]]:
        missing = []
        if not re.fullmatch(r"[A-Za-z0-9]{7}", self.tpe): missing.append("MONETICO_TPE")
        if not re.fullmatch(r"[A-Za-z0-9]{1,64}", self.company): missing.append("MONETICO_SOCIETE")
        try: key_bytes(self.secret)
        except ValueError: missing.append("MONETICO_KEY_HEX")
        if not self.public_url: missing.append("MONETICO_PUBLIC_URL")
        if self.env == "production" and not self.public_url.startswith("https://"):
            missing.append("MONETICO_PUBLIC_URL_https")
        if not self.catalogue_file:
            missing.append("MONETICO_CATALOGUE_FILE")
        elif not os.path.isfile(self.catalogue_file):
            missing.append("MONETICO_CATALOGUE_FILE_readable")
        if self.env == "production" and not self.order_target:
            missing.append("MONETICO_ORDER_TARGET")
        return (not missing, missing)

    @property
    def action(self) -> str:
        return ACTION_PRODUCTION if self.env == "production" else ACTION_TEST


class Gateway(BaseHTTPRequestHandler):
    server_version = "LaTrattoriaMonetico/1.0"

    @property
    def config(self) -> Config:
        return self.server.config  # type: ignore[attr-defined]

    @property
    def store(self) -> Store:
        return self.server.store  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: object) -> None:
        # Ne jamais écrire de clé, numéro de carte ou données sensibles dans les logs.
        super().log_message(fmt, *args)

    def cors_origin(self) -> str:
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and origin in self.config.allowed_origins:
            return origin
        return ""

    def send_json(self, value: object, status: int = 200) -> None:
        body = json_bytes(value)
        self.send_response(status)
        origin = self.cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 100_000:
                raise ValueError
            value = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError
            return value
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("JSON invalide")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        origin = self.cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/monetico/status":
            ready, missing = self.config.ready()
            self.send_json({"ok": True, "configured": ready, "environment": self.config.env,
                            "missing": missing, "action": self.config.action if ready else None})
            return
        if parsed.path == "/api/monetico/health":
            self.send_json({"ok": True})
            return
        if parsed.path == "/api/monetico/result":
            ref = parse_qs(parsed.query).get("ref", [""])[0]
            order = self.store.get(ref) if REFERENCE_RE.fullmatch(ref) else None
            self.result_page(ref, order)
            return
        self.send_json({"ok": False, "error": "not_found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/monetico/prepare":
            self.prepare()
            return
        if parsed.path == "/api/monetico/notify":
            self.notify()
            return
        self.send_json({"ok": False, "error": "not_found"}, HTTPStatus.NOT_FOUND)

    def prepare(self) -> None:
        ready, missing = self.config.ready()
        if not ready:
            self.send_json({"ok": False, "error": "payment_not_configured", "missing": missing}, 503)
            return
        try:
            payload = self.read_json()
            name = str(payload.get("nom", "")).strip()
            phone = str(payload.get("tel", "")).strip()
            email = str(payload.get("email", "")).strip()
            slot = str(payload.get("creneau", "")).strip()
            if not (2 <= len(name) <= 120 and 6 <= len(phone) <= 30):
                raise ValueError("coordonnées client invalides")
            if not re.fullmatch(r"[^@\s]{1,100}@[^@\s]{1,100}\.[^@\s]{2,30}", email):
                raise ValueError("adresse e-mail invalide")
            if not (1 <= len(slot) <= 30):
                raise ValueError("créneau invalide")
            lines = payload.get("lignes")
            if not isinstance(lines, list) or not lines or len(lines) > 40:
                raise ValueError("panier invalide")
            catalogue = load_catalogue(self.config.catalogue_file)
            clean_lines = []
            total = Decimal("0.00")
            for line in lines:
                if not isinstance(line, dict): raise ValueError("ligne invalide")
                product_id = str(line.get("id", ""))
                try: quantity = int(line.get("qte", 0))
                except (ValueError, TypeError): raise ValueError("quantité invalide")
                if product_id not in catalogue or not 1 <= quantity <= 30:
                    raise ValueError("produit ou quantité invalide")
                unit = catalogue[product_id]
                total += unit * quantity
                clean_lines.append({"id": product_id, "qte": quantity, "unit": str(unit)})
            total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if total <= 0: raise ValueError("panier vide")
            ref = reference()
            date = dt.datetime.now().strftime("%d/%m/%Y:%H:%M:%S")
            text = ("La Trattoria " + slot)[:3200]
            context = base64.b64encode(json_bytes({
                "client": {"name": name, "phone": phone},
                "shoppingCart": clean_lines,
                "pickup": slot,
            })).decode("ascii")
            form = {
                "version": VERSION, "TPE": self.config.tpe, "date": date,
                "montant": format(total, ".2f") + "EUR", "reference": ref,
                "texte-libre": text, "lgue": "FR", "societe": self.config.company,
                "contexte_commande": context, "mail": email,
                "url_retour_ok": self.config.public_url + "/api/monetico/result?ref=" + ref,
                "url_retour_err": self.config.public_url + "/api/monetico/result?ref=" + ref,
            }
            # url_notification est configurée côté contrat Monetico, de façon à
            # ne jamais signer ni exposer une URL de notification inventée ici.
            form["MAC"] = sign_form(self.config.secret, form)
            self.store.put(ref, {"status": "pending", "reference": ref, "amount": str(total),
                                 "email": email, "name": name, "phone": phone,
                                 "slot": slot, "note": str(payload.get("note", ""))[:400],
                                 "lines": clean_lines,
                                 "created": dt.datetime.now(dt.timezone.utc).isoformat()})
            self.send_json({"ok": True, "action": self.config.action, "form": form})
        except (ValueError, RuntimeError, OSError) as exc:
            self.send_json({"ok": False, "error": str(exc)}, 400)

    def forward_order(self, order: dict) -> tuple[bool, str]:
        """Transmet une commande payée au serveur de prise de commande."""
        target = self.config.order_target
        if not target:
            return False, "MONETICO_ORDER_TARGET non configuré"
        lines = []
        for line in order.get("lines", []):
            lines.append({
                "id": str(line.get("id", "")),
                "q": int(line.get("q", 0)),
                # Le serveur de la tablette recalcule encore le catalogue.
                "nom": "",
                "pv": float(line.get("unit", 0)),
            })
        note = str(order.get("note", "")).strip()
        payment_note = "Paiement Monetico confirmé — référence " + str(order.get("reference", ""))
        payload = {
            "client": str(order.get("name", "")),
            "tel": str(order.get("phone", "")),
            "email": str(order.get("email", "")),
            "creneau": str(order.get("slot", "")),
            "note": (note + " | " if note else "") + payment_note,
            "lignes": lines,
            "total": float(order.get("amount", 0)),
            "paiement": "monetico",
            "referencePaiement": str(order.get("reference", "")),
        }
        request = urllib.request.Request(
            target, data=json_bytes(payload),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                raw = response.read(50_000).decode("utf-8", "replace")
                result = json.loads(raw) if raw else {}
                if response.status < 200 or response.status >= 300 or not result.get("ok"):
                    return False, "serveur de commandes a refusé la commande"
                return True, "transmise"
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            return False, "serveur de commandes injoignable"

    def notify(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 100_000: raise ValueError("notification invalide")
            parsed = parse_qs(self.rfile.read(length).decode("utf-8"), keep_blank_values=True)
            form = {key: values[-1] for key, values in parsed.items()}
            received = form.get("MAC", "")
            expected = sign_return(self.config.secret, form)
            if not received or not hmac.compare_digest(received.lower(), expected.lower()):
                self.send_response(200); self.end_headers(); self.wfile.write(b"version=2\ncdr=0"); return
            ref = form.get("reference", "")
            if not REFERENCE_RE.fullmatch(ref): raise ValueError("référence invalide")
            order = self.store.get(ref)
            if order:
                accepted = form.get("code-retour", "").lower() in {"paiement", "payetest"}
                order.update({"status": "paid" if accepted else "refused",
                              "return_code": form.get("code-retour", ""),
                              "authorized": form.get("numauto", ""),
                              "updated": dt.datetime.now(dt.timezone.utc).isoformat()})
                if accepted and order.get("forward_status") != "sent":
                    sent, detail = self.forward_order(order)
                    order["forward_status"] = "sent" if sent else "error"
                    order["forward_detail"] = detail
                self.store.put(ref, order)
            self.send_response(200); self.end_headers(); self.wfile.write(b"version=2\ncdr=0")
        except (ValueError, UnicodeDecodeError, OSError):
            self.send_response(200); self.end_headers(); self.wfile.write(b"version=2\ncdr=0")

    def result_page(self, ref: str, order: dict | None) -> None:
        status = order.get("status") if order else "unknown"
        title = "Paiement confirmé" if status == "paid" else ("Paiement refusé" if status == "refused" else "Paiement en cours de confirmation")
        detail = "Votre commande est transmise au restaurant." if status == "paid" else "Vous pouvez fermer cette page et contacter le restaurant si nécessaire."
        safe_ref = ref.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        body = ("<!doctype html><html lang='fr'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<title>La Trattoria — résultat du paiement</title><style>body{margin:0;background:#faf7f0;color:#282522;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{max-width:440px;margin:24px;padding:32px;border-radius:24px;background:#fffdfa;box-shadow:0 18px 50px #43251a18;text-align:center}h1{font:700 32px Georgia;color:#8f252f}p{line-height:1.55;color:#756f68}.ref{font:12px monospace;color:#818354}</style>"
                "<main class='card'><div aria-hidden='true' style='font-size:38px'>%s</div><h1>%s</h1><p>%s</p><p class='ref'>Référence %s</p></main></html>" % ("✓" if status == "paid" else "•", title, detail, safe_ref))
        data = body.encode("utf-8")
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)


def make_server(host: str, port: int) -> ThreadingHTTPServer:
    config = Config()
    server = ThreadingHTTPServer((host, port), Gateway)
    server.config = config  # type: ignore[attr-defined]
    server.store = Store(config.store_file)  # type: ignore[attr-defined]
    return server


def main() -> None:
    host = env("MONETICO_BIND", "0.0.0.0")
    port = int(env("MONETICO_PORT", "8787"))
    server = make_server(host, port)
    ready, missing = server.config.ready()  # type: ignore[attr-defined]
    print("Monetico gateway : http://%s:%s (%s)" % (host, port, "prêt" if ready else "configuration incomplète"))
    if missing: print("Variables manquantes : " + ", ".join(missing))
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__ == "__main__":
    main()
