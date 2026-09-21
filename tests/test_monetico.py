import hashlib
import hmac
import json
import tempfile
import unittest
from pathlib import Path

from carte.monetico_gateway import (
    FORM_FIELDS,
    RETURN_ORDER,
    Config,
    load_catalogue,
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


if __name__ == "__main__":
    unittest.main()
