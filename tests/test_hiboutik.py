import unittest

from carte.hiboutik_client import HiboutikErreur, extraire_produits
from carte.serveur_carte import _hiboutik_payload


class HiboutikMappingTests(unittest.TestCase):
    def test_normalise_catalogue_and_stock(self):
        produits = extraire_produits({
            "products": [{
                "product_id": 42,
                "product_model": "Pizza du jour",
                "product_barcode": "12345678",
                "product_price": "14.90",
                "product_stock_management": "1",
                "stock": "3",
            }]
        })
        self.assertEqual(produits[0]["hiboutikId"], "42")
        self.assertEqual(produits[0]["stock"], 3.0)
        self.assertTrue(produits[0]["stockSuivi"])

    def test_payload_maps_local_product_without_secret(self):
        config = {
            "taxes": {"0.055": "3", "0.10": "2", "0.20": "1"},
            "categorie": "5", "marque": "0", "fournisseur": "0",
        }
        payload = _hiboutik_payload({
            "nom": "Pizza test", "pv": 12.5, "cout": 3.1,
            "tva": 0.1, "suiviStock": True, "hiboutikBarcode": "12345678",
        }, config)
        self.assertEqual(payload["product_model"], "Pizza test")
        self.assertEqual(payload["product_price"], "12.50")
        self.assertEqual(payload["product_vat"], "2")
        self.assertEqual(payload["product_stock_management"], "1")
        self.assertNotIn("HIBOUTIK_API_KEY", payload)

    def test_payload_rejects_missing_name(self):
        with self.assertRaises(HiboutikErreur):
            _hiboutik_payload({"pv": 10, "tva": 0.1}, {
                "taxes": {"0.10": "2"}, "categorie": "0",
                "marque": "0", "fournisseur": "0",
            })


if __name__ == "__main__":
    unittest.main()
