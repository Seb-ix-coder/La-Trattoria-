import json
import sqlite3
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

import carte.serveur_carte as carte_server
import communaute.serveur_communaute as comm_server


class CommunitySecurityTests(unittest.TestCase):
    def test_password_hash_is_versioned_and_legacy_can_be_migrated(self):
        sel = "0123456789abcdef0123456789abcdef"
        stored = comm_server.hache("un-secret-de-test", sel)
        self.assertTrue(stored.startswith("pbkdf2_sha256$600000$"))
        self.assertTrue(comm_server.verifier_mdp("un-secret-de-test", stored, sel))
        self.assertFalse(comm_server.verifier_mdp("mauvais", stored, sel))

        legacy = comm_server.hashlib.sha256((sel + "ancien").encode()).hexdigest()
        self.assertTrue(comm_server.verifier_mdp("ancien", legacy, sel))

    def test_public_profile_does_not_contain_contact_data(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        con.execute(
            "CREATE TABLE users (id, type, nom, tel, email, mdp, sel, bio, "
            "avatar, logo, pts, verifie, consent, badges, cree_le)"
        )
        con.execute(
            "INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("u", "partenaire", "Maison", "0612345678", "secret@example.test",
             "x", "s", "bio", None, None, 3, 1, '{"classement": true}', "[]", 1.0),
        )
        public = comm_server.user_row(con.execute("SELECT * FROM users").fetchone(), public=True)
        self.assertNotIn("tel", public)
        self.assertNotIn("email", public)
        self.assertNotIn("consent", public)
        self.assertEqual(public["nom"], "Maison")


class CardServerSecurityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        root = Path(self.tmp.name)
        self.old_state = (carte_server.DOSSIER, carte_server.FICHIER_ETAT,
                          carte_server.API_TOKEN, carte_server.etat)
        carte_server.DOSSIER = str(root)
        carte_server.FICHIER_ETAT = str(root / "donnees-serveur.json")
        carte_server.API_TOKEN = "t" * 48
        carte_server.etat = {"version": 0, "maj": None, "carte": [],
                             "ardoises": {}, "config": {}}
        self.httpd = carte_server.ThreadingHTTPServer(("127.0.0.1", 0), carte_server.ServeurCarte)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:{}".format(self.httpd.server_port)

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        (carte_server.DOSSIER, carte_server.FICHIER_ETAT,
         carte_server.API_TOKEN, carte_server.etat) = self.old_state
        self.tmp.cleanup()

    def request(self, path, body=None, headers=None):
        request = urllib.request.Request(
            self.base + path,
            data=body,
            headers=headers or {},
            method="POST" if body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def test_write_requires_token_and_state_file_is_not_static(self):
        body = json.dumps({"carte": [{"id": "p1"}]}).encode()
        self.assertEqual(self.request("/api/carte", body)[0], 401)
        self.assertEqual(
            self.request("/api/carte", body, {"X-Carte-Token": carte_server.API_TOKEN,
                                               "Content-Type": "application/json"})[0],
            200,
        )
        self.assertEqual(self.request("/donnees-serveur.json")[0], 404)


class SourceRegressionTests(unittest.TestCase):
    ROOT = Path(__file__).resolve().parents[1]

    def test_native_order_page_uses_computed_total(self):
        source = (self.ROOT / "build/app-src/src/com/trattoria/cartes/ServeurSite.java").read_text()
        self.assertIn("total:total().toFixed(2)", source)
        self.assertNotIn("total:t.toFixed(2)", source)
        self.assertIn("validerCommande", source)

    def test_card_editor_has_no_undefined_family_fallback(self):
        source = (self.ROOT / "carte/carte.js").read_text()
        self.assertIn("var fam = card.getAttribute('data-fam') || 'Divers';", source)
        section = source[source.index("function enregistrerTitreFamille"):source.index("function deplacerLigneCF")]
        self.assertIn("slice(0, 60) || fam", section)


if __name__ == "__main__":
    unittest.main()
