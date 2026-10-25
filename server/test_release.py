import json, tempfile, unittest
from pathlib import Path
from chat_app import create_app, build_catalog, vocab_for, introduction_answer
ROOT=Path(__file__).resolve().parents[1]
class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.lessons=json.loads((ROOT/'data/lessons.json').read_text())
        self.manifest=json.loads((ROOT/'data/chat-missions.json').read_text())
    def test_numbering_and_vocabulary(self):
        ms=build_catalog(self.lessons,self.manifest)
        self.assertEqual(len(ms),100)
        self.assertEqual(ms['lesson-002']['legacyId'],26)
        self.assertEqual(ms['lesson-005']['legacyId'],2)
        self.assertEqual(set(vocab_for(ms,4)),{w for i in range(1,5) for w in ms[f'lesson-{i:03d}']['vocabulary']})
    def test_public_catalog_and_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=create_app(Path(tmp),token='private',public_origin='https://bthompson91.github.io',google_client_id='test',identity_verifier=lambda raw:{'sub':raw},catalog_loader=lambda:(self.lessons,self.manifest)).test_client()
            h={'Origin':'https://bthompson91.github.io','Authorization':'Bearer alice'}
            self.assertEqual(c.get('/health',headers=h).get_json()['enabledMissions'],100)
            body={'missionId':'lesson-002','numberingVersion':'display-v2','vocabularyThroughLesson':1}
            r=c.post('/sessions',json=body,headers=h);self.assertEqual(r.status_code,201)
            s=r.get_json();self.assertIn('pendingGoalId',s);self.assertNotIn('missionSnapshot',s)
            self.assertEqual(c.get('/sessions/'+s['id'],headers=h|{'Authorization':'Bearer bob'}).status_code,404)
            self.assertEqual(c.post('/sessions',json=body|{'vocabularyThroughLesson':True},headers=h).status_code,400)
            self.assertEqual(c.post('/sessions',json={'missionId':[]},headers=h).status_code,400)
    def test_intro_questions(self):
        self.assertEqual(introduction_answer('At ikaw?',{'id':'origin'}),('Taga-Pilipinas ako.','origin',True))
        self.assertFalse(introduction_answer('Ako si Alex, at ikaw?',{'id':'name'})[2])
if __name__=='__main__':unittest.main()
