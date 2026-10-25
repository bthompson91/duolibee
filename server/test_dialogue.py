import tempfile
import unittest
from pathlib import Path
from chat_app import create_app, DIMS

class DialogueIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.calls=0
        def grade(text,state):
            self.calls+=1
            gid='origin' if 'australia' in text.casefold() else 'name'
            return {'status':'scored','ratings':dict.fromkeys(DIMS,4),'evidence':[{'goalId':gid,'quote':text}],'feedback':'Do not display model prose.'},{}
        self.c=create_app(Path(self.tmp.name),token='dialogue-test',evaluator=grade).test_client()
        self.h={'Authorization':'Bearer dialogue-test'}
        self.s=self.c.post('/sessions',json={'missionId':'introductions-midpoint'},headers=self.h).get_json()
    def tearDown(self):
        self.tmp.cleanup()
    def message(self,text,rid,rev):
        return self.c.post('/sessions/'+self.s['id']+'/messages',headers=self.h,json={'requestId':rid,'expectedRevision':rev,'text':text})
    def test_answers_before_advancing_and_closing(self):
        r=self.message('Ako si Brendan, at ikaw?','a',0)
        self.assertEqual(r.status_code,200)
        d=r.get_json()
        self.assertTrue(d['beeMessage'].startswith('Ako si Bee!'))
        self.assertTrue(d['beeMessage'].endswith('Taga-saan ka?'))
        self.assertEqual(d['assessment']['feedback'],'')
        self.assertEqual(d['session']['completed']['name']['mode'],'independent')
        r=self.message('Taga-Australia ako. At ikaw?','b',1)
        self.assertEqual(r.status_code,200)
        d=r.get_json()
        self.assertTrue(d['beeMessage'].startswith('Sa kuwento natin, taga-Pilipinas ako.'))
        self.assertEqual(d['session']['status'],'completed')
        self.assertEqual(d['session']['completed']['origin']['mode'],'independent')
        self.assertEqual(self.message('Taga-Australia ako. At ikaw?','b',1).get_json(),d)
        self.assertEqual(self.calls,2)
    def test_question_only_no_provider_call_or_goal_credit(self):
        r=self.message('At ikaw?','q',0)
        self.assertEqual(r.status_code,200)
        d=r.get_json()
        self.assertEqual(self.calls,0)
        self.assertIsNone(d['assessment']['score'])
        self.assertFalse(d['session']['completed'])
        self.assertEqual(d['session']['hintLevels']['name'],3)
        d=self.message('Ako si Alex.','a',1).get_json()
        self.assertEqual(d['session']['completed']['name']['mode'],'assisted')
    def test_no_unsolicited_name_or_origin(self):
        d=self.message('Ako si Alex.','a',0).get_json()
        self.assertEqual(d['beeMessage'],'Taga-saan ka?')
        self.assertNotIn('Bee',d['beeMessage'])
        self.assertEqual(d['session']['hintLevels'],{})

if __name__=='__main__':unittest.main()
