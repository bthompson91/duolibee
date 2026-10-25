import json, sqlite3, tempfile, time, unittest
from pathlib import Path
from chat_app import create_app, ProviderError
ROOT=Path(__file__).resolve().parents[1]
class ConfigurableQuotaTests(unittest.TestCase):
    def attempt(self, mission, account_day=10, shared_day=30, account_minute=3, shared_minute=5):
        calls=[]
        def evaluator(text,state):
            calls.append(text)
            raise ProviderError('connection_or_key_error')
        with tempfile.TemporaryDirectory() as tmp:
            app=create_app(Path(tmp),evaluator=evaluator,public_origin='https://bthompson91.github.io',google_client_id='test',identity_verifier=lambda raw:{'sub':'quota-test'},daily_limit=450,account_daily_limit=400,shared_minute_limit=12,account_minute_limit=10,catalog_loader=lambda:(json.loads((ROOT/'data/lessons.json').read_text()),json.loads((ROOT/'data/chat-missions.json').read_text())))
            client=app.test_client()
            headers={'Authorization':'Bearer test','Origin':'https://bthompson91.github.io'}
            r=client.post('/sessions',json={'missionId':mission,'numberingVersion':'display-v2'},headers=headers)
            self.assertEqual(r.status_code,201)
            sid=r.get_json()['id']
            day=time.strftime('%Y-%m-%d',time.gmtime());minute=int(time.time())//60
            with sqlite3.connect(Path(tmp)/'chat.sqlite3') as db:
                db.execute('INSERT INTO usage VALUES (?,?)',(day,shared_day))
                db.execute('INSERT INTO minutes VALUES (?,?)',(minute,shared_minute))
                db.execute('INSERT INTO account_usage_v026 VALUES (?,?,?)',('quota-test',day,account_day))
                db.execute('INSERT INTO account_minutes_v026 VALUES (?,?,?)',('quota-test',minute,account_minute))
            result=client.post('/sessions/'+sid+'/messages',json={'requestId':'quota-check','expectedRevision':0,'text':'Kumusta'},headers=headers)
            return result.status_code,len(calls)
    def test_old_caps_no_longer_block_production_profile(self):
        for mission in ('introductions-midpoint','lesson-001'):
            with self.subTest(mission=mission):
                self.assertEqual(self.attempt(mission),(502,1))
    def test_new_caps_still_enforced(self):
        for mission in ('introductions-midpoint','lesson-001'):
            for kwargs in ({'account_day':400},{'shared_day':450},{'account_minute':10},{'shared_minute':12}):
                with self.subTest(mission=mission,limit=kwargs):
                    self.assertEqual(self.attempt(mission,**kwargs),(429,0))
    def test_invalid_limits_rejected(self):
        for field in ('account_daily_limit','shared_minute_limit','account_minute_limit'):
            for value in (0,-1,True,'10'):
                with self.subTest(field=field,value=value),self.assertRaises(ValueError):
                    create_app(token='test',**{field:value})
