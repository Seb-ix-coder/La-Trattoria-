import base64
import hashlib
import hmac
import json
import os
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

from carte.monetico_gateway import (
    FORM_FIELDS,
    RETURN_ORDER,
    Config,
    delivery_rates,
    load_catalogue,
    make_server,
    sign_form,
    sign_return,
)


class MoneticoSignatureTests(unittest.TestCase):
    KEY = "0123456789abcdef0123456789abcdef01234567"

    def test_outgoing_signature_uses_allowed_sorted_fields_only(self):
        form = {
            "version": "3.0",
            "TPE": "1234567",
            "date": "24/05/2019:10:00:25",
            "montant": "12.50EUR",
            "reference": "LT240501ABCD",
            "texte-libre": "La Trattoria",
            "lgue": "FR",
            "societe": "monSite",
            "mail": "client@example.test",
            "MAC": "must-not-be-signed",
            "unknown": "must-not-be-signed",
        }
        parts = [
            (key + "=" + form[key]).encode("utf-8")
            for key in sorted(form) if key in FORM_FIELDS
        ]
        expected = hmac.new(bytes.fromhex(self.KEY), b"*".join(parts), hashlib.sha1).hexdigest()
        self.assertEqual(sign_form(self.KEY, form), expected)

    def test_return_signature_has_fixed_order_and_empty_optional_fields(self):
        form = {
            "TPE": "1234567", "date": "24/05/2019_a_10:00:25",
            "montant": "12.50EUR", "reference": "LT240501ABCD",
            "texte-libre": "", "version": "3.0", "code-retour": "payetest",
            "cvx": "oui", "vld": "1227", "brand": "VI", "status3ds": "1",
            "numauto": "000000",
        }
        raw = "*".join(form.get(key, "") for key in RETURN_ORDER) + "*"
        expected = hmac.new(bytes.fromhex(self.KEY), raw.encode(), hashlib.sha1).hexdigest()
        self.assertEqual(sign_return(self.KEY, form), expected)


class MoneticoCatalogueTests(unittest.TestCase):
    def test_catalogue_is_loaded_without_client_prices(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "catalogue.json"
            path.write_text(json.dumps([
                {"id": "p1", "pv": 10, "actif": True},
                {"id": "p2", "pv": 12.50, "actif": False},
            ]), encoding="utf-8")
            catalogue = load_catalogue(str(path))
        self.assertEqual(str(catalogue["p1"]), "10.00")
        self.assertNotIn("p2", catalogue)

    def test_delivery_fees_are_server_configured_and_nonnegative(self):
        import os
        old = dict(os.environ)
        try:
            os.environ.update({
                "MONETICO_FRAIS_SUR_PLACE": "0",
                "MONETICO_FRAIS_UBER": "5.50",
                "MONETICO_FRAIS_LIVRAISON_URBAINE": "3.25",
            })
            config = Config()
            self.assertEqual(str(config.delivery["sur_place"]), "0.00")
            self.assertEqual(str(config.delivery["uber"]), "5.50")
            self.assertEqual(str(config.delivery["livraison_urbaine"]), "3.25")
        finally:
            os.environ.clear()
            os.environ.update(old)

    def test_published_delivery_file_overrides_environment_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "donnees-serveur.json"
            path.write_text(json.dumps({"livraison": {
                "sur_place": 0, "uber": 6.25, "livraison_urbaine": 2.75,
            }}), encoding="utf-8")
            rates = delivery_rates(path.as_posix(), {
                "sur_place": Config().delivery["sur_place"],
                "uber": Config().delivery["uber"],
                "livraison_urbaine": Config().delivery["livraison_urbaine"],
            })
        self.assertEqual(str(rates["uber"]), "6.25")
        self.assertEqual(str(rates["livraison_urbaine"]), "2.75")

    def test_production_needs_https(self):
        old = dict(__import__("os").environ)
        try:
            import os
            os.environ.update({
                "MONETICO_ENV": "production", "MONETICO_TPE": "1234567",
                "MONETICO_SOCIETE": "monSite", "MONETICO_KEY_HEX": "0" * 40,
                "MONETICO_PUBLIC_URL": "http://insecure.example",
                "MONETICO_CATALOGUE_FILE": "/tmp/catalogue.json",
            })
            ready, missing = Config().ready()
            self.assertFalse(ready)
            self.assertIn("MONETICO_PUBLIC_URL_https", missing)
        finally:
            import os
            os.environ.clear()
            os.environ.update(old)


class MoneticoPrepareTests(unittest.TestCase):
    def test_prepare_recalculates_products_and_adds_published_delivery_fee(self):
        old = dict(os.environ)
        server = None
        try:
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                (root / "catalogue.json").write_text(json.dumps([
                    {"id": "pizza", "pv": 10, "actif": True},
                ]), encoding="utf-8")
                (root / "donnees-serveur.json").write_text(json.dumps({
                    "livraison": {"sur_place": 0, "uber": 6.25, "livraison_urbaine": 2.75},
                }), encoding="utf-8")
                os.environ.update({
                    "MONETICO_ENV": "test", "MONETICO_TPE": "1234567",
                    "MONETICO_SOCIETE": "monSite", "MONETICO_KEY_HEX": "0" * 40,
                    "MONETICO_PUBLIC_URL": "http://payment.example",
                    "MONETICO_CATALOGUE_FILE": str(root / "catalogue.json"),
                    "MONETICO_DELIVERY_FILE": str(root / "donnees-serveur.json"),
                    "MONETICO_ORDER_STORE": str(root / "orders.json"),
                })
                server = make_server("127.0.0.1", 0)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                body = json.dumps({
                    "nom": "Anaïs", "tel": "0612345678", "email": "ana@example.test",
                    "creneau": "19h00", "modeReception": "uber",
                    "lignes": [{"id": "pizza", "qte": 1}], "total": 1,
                }).encode("utf-8")
                request = urllib.request.Request(
                    "http://127.0.0.1:{}/api/monetico/prepare".format(server.server_port),
                    data=body, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
                self.assertTrue(result["ok"])
                self.assertEqual(result["form"]["montant"], "16.25EUR")
                context = json.loads(base64.b64decode(
                    result["form"]["contexte_commande"]).decode("utf-8"))
                self.assertEqual(context["reception"], "uber")
                self.assertEqual(context["deliveryFee"], "6.25")
        finally:
            if server is not None:
                server.shutdown()
                server.server_close()
            os.environ.clear()
            os.environ.update(old)


if __name__ == "__main__":
    unittest.main()
