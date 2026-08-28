import http.client
import importlib.util
import json
import pathlib
import tempfile
import threading
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class RatingServerTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('sc', ROOT / 'communaute' / 'serveur_communaute.py')
        self.mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.mod)
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix='trattoria-rating-'))
        self.mod.DB_PATH = self.tmp / 'communaute.db'; self.mod.PHOTOS = self.tmp/'photos'; self.mod.AVATARS=self.tmp/'avatars'; self.mod.LOGOS=self.tmp/'logos'
        self.mod.init_db(); self.httpd=self.mod.ThreadingHTTPServer(('127.0.0.1',0),self.mod.H); threading.Thread(target=self.httpd.serve_forever,daemon=True).start(); self.port=self.httpd.server_address[1]
    def tearDown(self): self.httpd.shutdown(); self.httpd.server_close()
    def req(self, method, path, body=None, cookie=None, headers=None):
        h={'Content-Type':'application/json',**(headers or {})};
        if cookie:h['Cookie']=cookie
        b=json.dumps(body,ensure_ascii=False).encode() if body is not None else None
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5);c.request(method,path,b,h);r=c.getresponse();raw=r.read();hs=dict(r.getheaders());c.close();return r.status,json.loads(raw or b'{}'),hs
    def test_stable_purchased_line_and_update(self):
        status,result,hs=self.req('POST','/api/inscription',{'nom':'Client test','tel':'0612345678','mdp':'secret'});self.assertEqual(status,200);cookie=hs['Set-Cookie'].split(';',1)[0]
        with self.mod.db() as c:
            staff=c.execute("SELECT id FROM users WHERE type='staff'").fetchone();token=self.mod.secrets.token_hex(32);c.execute('INSERT INTO sessions VALUES (?,?,?)',(token,staff['id'],self.mod.time.time()+3600))
        status,result,_=self.req('POST','/api/fidelite/achat',{'tel':'0612345678','nom':'Client test','montant':10,'mode':'sur_place','lignes':[{'plat_id':'p1','nom':'La Margherita','qte':1,'pv':10}]},headers={'X-Jeton':token});self.assertEqual(status,200,result)
        status,result,_=self.req('POST','/api/notes-plats',{'plat_id':'p404','note':5},cookie=cookie);self.assertEqual(status,403);self.assertEqual(result['code'],'achat_requis')
        status,result,_=self.req('POST','/api/notes-plats',{'plat_id':'p1','note':4,'commentaire':'Très bon'},cookie=cookie);self.assertEqual(status,200,result);self.assertFalse(result['modifie'])
        status,result,_=self.req('POST','/api/notes-plats',{'plat_id':'p1','note':5,'commentaire':'Encore meilleur'},cookie=cookie);self.assertEqual(status,200,result);self.assertTrue(result['modifie'])
        status,result,_=self.req('GET','/api/notes-plats');self.assertEqual(status,200);self.assertEqual(result['ratings'][0]['moyenne'],5.0);self.assertEqual(result['ratings'][0]['compteur'],1)

if __name__=='__main__': unittest.main()
