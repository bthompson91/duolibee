import json, sqlite3, tempfile, unittest
from pathlib import Path
from chat_app import create_app
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://bthompson91.github.io'
SCOPE='openid email https://www.googleapis.com/auth/drive.appdata'

class OAuthRefreshTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        lessons=json.loads((ROOT/'data/lessons.json').read_text());manifest=json.loads((ROOT/'data/chat-missions.json').read_text())
        self.secret_path=Path(self.tmp.name)/'google-oauth-client-secret'
        self.secret_path.write_text('fake-client-secret\n')
        self.calls=[]
        self.exchange_response={'access_token':'at-1','expires_in':3600,'refresh_token':'rt-1','scope':SCOPE,'token_type':'Bearer'}
        self.refresh_response={'access_token':'at-2','expires_in':3600,'scope':SCOPE,'token_type':'Bearer'}
        def exchanger(payload):
            self.calls.append(dict(payload))
            if payload.get('grant_type')=='authorization_code':return dict(self.exchange_response)
            if payload.get('grant_type')=='refresh_token':return dict(self.refresh_response)
            return {'error':'unsupported_grant_type'}
        self.exchanger=exchanger
        self.client=self.make_client()
        self.h={'Origin':ORIGIN,'Authorization':'Bearer alice','X-Requested-With':'XmlHttpRequest'}
    def make_client(self,secret_path=None,exchanger=None):
        return create_app(Path(self.tmp.name),public_origin=ORIGIN,google_client_id='test',identity_verifier=lambda raw:{'sub':raw},catalog_loader=lambda:(json.loads((ROOT/'data/lessons.json').read_text()),json.loads((ROOT/'data/chat-missions.json').read_text())),google_client_secret_path=secret_path if secret_path is not None else self.secret_path,token_exchanger=exchanger if exchanger is not None else self.exchanger).test_client()
    def stored_refresh(self,subject='alice'):
        db=sqlite3.connect(Path(self.tmp.name)/'chat.sqlite3');db.row_factory=sqlite3.Row
        row=db.execute('SELECT refresh_token FROM oauth_refresh_tokens WHERE subject=?',(subject,)).fetchone();db.close()
        return row[0] if row else None
    def test_exchange_stores_refresh_token_and_returns_access_token(self):
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200)
        body=r.get_json();self.assertEqual(body['access_token'],'at-1');self.assertEqual(body['expires_in'],3600)
        self.assertEqual(self.stored_refresh('alice'),'rt-1')
        self.assertEqual(self.calls[0]['grant_type'],'authorization_code')
        self.assertEqual(self.calls[0]['code'],'auth-code-123')
        self.assertEqual(self.calls[0]['client_secret'],'fake-client-secret')
        self.assertEqual(self.calls[0]['redirect_uri'],ORIGIN)
    def test_exchange_requires_csrf_header(self):
        h={'Origin':ORIGIN,'Authorization':'Bearer alice'}
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=h)
        self.assertEqual(r.status_code,403)
    def test_exchange_rejects_bad_code(self):
        self.assertEqual(self.client.post('/auth/exchange',json={},headers=self.h).status_code,400)
        self.assertEqual(self.client.post('/auth/exchange',json={'code':''},headers=self.h).status_code,400)
        self.assertEqual(self.client.post('/auth/exchange',json={'code':123},headers=self.h).status_code,400)
    def test_exchange_without_client_secret_is_503(self):
        c=self.make_client(secret_path=Path(self.tmp.name)/'no-such-secret')
        r=c.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,503)
    def test_exchange_without_drive_scope_is_403(self):
        self.exchange_response={'access_token':'at-1','expires_in':3600,'refresh_token':'rt-1','scope':'openid email','token_type':'Bearer'}
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,403)
        self.assertIsNone(self.stored_refresh('alice'))
    def test_exchange_keeps_old_refresh_token_when_google_omits_it(self):
        self.exchange_response={'access_token':'at-1','expires_in':3600,'scope':SCOPE,'token_type':'Bearer'}
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200);self.assertIsNone(self.stored_refresh('alice'))
        self.exchange_response={'access_token':'at-1','expires_in':3600,'refresh_token':'rt-9','scope':SCOPE,'token_type':'Bearer'}
        r=self.client.post('/auth/exchange',json={'code':'auth-code-456'},headers=self.h)
        self.assertEqual(r.status_code,200);self.assertEqual(self.stored_refresh('alice'),'rt-9')
        self.exchange_response={'access_token':'at-1','expires_in':3600,'scope':SCOPE,'token_type':'Bearer'}
        r=self.client.post('/auth/exchange',json={'code':'auth-code-789'},headers=self.h)
        self.assertEqual(r.status_code,200);self.assertEqual(self.stored_refresh('alice'),'rt-9')
    def test_refresh_mints_new_access_token(self):
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200)
        self.calls.clear()
        r=self.client.post('/auth/refresh',headers=self.h)
        self.assertEqual(r.status_code,200)
        body=r.get_json();self.assertEqual(body['access_token'],'at-2');self.assertEqual(body['expires_in'],3600)
        self.assertEqual(self.calls[0]['grant_type'],'refresh_token')
        self.assertEqual(self.calls[0]['refresh_token'],'rt-1')
        self.assertEqual(self.calls[0]['client_secret'],'fake-client-secret')
    def test_refresh_without_stored_token_is_401(self):
        r=self.client.post('/auth/refresh',headers=self.h)
        self.assertEqual(r.status_code,401)
    def test_refresh_is_per_user(self):
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200)
        bob={'Origin':ORIGIN,'Authorization':'Bearer bob','X-Requested-With':'XmlHttpRequest'}
        r=self.client.post('/auth/refresh',headers=bob)
        self.assertEqual(r.status_code,401)
    def test_refresh_invalid_grant_is_401_and_deletes_stored_token(self):
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200);self.assertEqual(self.stored_refresh('alice'),'rt-1')
        self.refresh_response={'error':'invalid_grant','error_description':'Token has been expired or revoked.'}
        r=self.client.post('/auth/refresh',headers=self.h)
        self.assertEqual(r.status_code,401)
        self.assertIsNone(self.stored_refresh('alice'))
        r=self.client.post('/auth/refresh',headers=self.h)
        self.assertEqual(r.status_code,401)
    def test_refresh_rotates_stored_token_when_google_returns_one(self):
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200)
        self.refresh_response={'access_token':'at-2','expires_in':3600,'refresh_token':'rt-2','scope':SCOPE,'token_type':'Bearer'}
        r=self.client.post('/auth/refresh',headers=self.h)
        self.assertEqual(r.status_code,200);self.assertEqual(self.stored_refresh('alice'),'rt-2')
    def test_refresh_without_client_secret_is_503(self):
        r=self.client.post('/auth/exchange',json={'code':'auth-code-123'},headers=self.h)
        self.assertEqual(r.status_code,200)
        c=self.make_client(secret_path=Path(self.tmp.name)/'no-such-secret')
        r=c.post('/auth/refresh',headers=self.h)
        self.assertEqual(r.status_code,503)
    def test_auth_endpoints_require_google_sign_in(self):
        h={'Origin':ORIGIN,'X-Requested-With':'XmlHttpRequest'}
        self.assertEqual(self.client.post('/auth/exchange',json={'code':'x'},headers=h).status_code,401)
        self.assertEqual(self.client.post('/auth/refresh',headers=h).status_code,401)
    def test_preflight_allows_x_requested_with(self):
        h={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,x-requested-with'}
        r=self.client.options('/auth/exchange',headers=h)
        self.assertEqual(r.status_code,204)
        self.assertIn('x-requested-with',r.headers.get('Access-Control-Allow-Headers',''))
    def test_preflight_still_rejects_unknown_headers(self):
        h={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-evil'}
        r=self.client.options('/auth/exchange',headers=h)
        self.assertEqual(r.status_code,403)

if __name__=='__main__':unittest.main()
