import json, tempfile, unittest
from pathlib import Path
from chat_app import create_app
ROOT=Path(__file__).resolve().parents[1]
GOOD={'assessment':{'status':'scored','ratings':{'communication':4,'grammar':4,'vocabulary':4,'naturalness':4},'evidence':[{'goalId':'theme-response','quote':'Okay lang'},{'goalId':'continue-conversation','quote':'at ikaw?'}],'feedback':''},'reply':'Okay din ako! Thanks for asking.','taskRelevant':True,'assistedGoalIds':[]}
OFF={'assessment':{'status':'scored','ratings':{'communication':4,'grammar':4,'vocabulary':4,'naturalness':4},'evidence':[{'goalId':'theme-response','quote':'Puwet'}],'feedback':''},'reply':'That is a Tagalog word! We are practising greetings. How are you?','taskRelevant':False,'assistedGoalIds':[]}
BAD={'assessment':{'status':'scored','ratings':{'communication':4,'grammar':4,'vocabulary':4,'naturalness':4},'evidence':[],'feedback':''},'reply':'x','taskRelevant':True,'assistedGoalIds':['xp']}
class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        lessons=json.loads((ROOT/'data/lessons.json').read_text());manifest=json.loads((ROOT/'data/chat-missions.json').read_text())
        self.calls=[]
        def evaluator(text,state):
            self.calls.append((text,state['id']))
            decision=GOOD if 'Okay lang' in text else OFF if text=='Puwet' else BAD
            return decision,{'usageMetadata':{}}
        self.client=create_app(Path(self.tmp.name),token='private',evaluator=evaluator,catalog_loader=lambda:(lessons,manifest)).test_client()
        self.h={'Authorization':'Bearer private'}
        r=self.client.post('/sessions',json={'missionId':'lesson-001','numberingVersion':'display-v2'},headers=self.h)
        self.assertEqual(r.status_code,201);self.session=r.get_json()
    def send(self,text,rid='r1'):
        return self.client.post('/sessions/'+self.session['id']+'/messages',json={'requestId':rid,'expectedRevision':self.session['revision'],'text':text},headers=self.h)
    def test_all_100_missions_are_v2(self):
        r=self.client.get('/missions',headers=self.h).get_json()['missions']
        self.assertEqual(len(r),100)
    def test_greeting_gets_reply_before_closing(self):
        r=self.send('Okay lang, at ikaw? Kamusta?').get_json()
        self.assertTrue(r['beeMessage'].startswith('Okay din ako!'))
        self.assertTrue(r['beeMessage'].endswith('Salamat! Nice work!'))
        self.assertNotIn('Try one',r['beeMessage'])
        self.assertEqual(r['session']['status'],'completed')
        self.assertEqual(set(r['session']['completed']),{'theme-response','continue-conversation'})
    def test_off_topic_reply_does_not_award_goal(self):
        r=self.send('Puwet').get_json()
        self.assertEqual(r['assessment']['status'],'off_topic')
        self.assertEqual(r['assessment']['languageStatus'],'scored')
        self.assertFalse(r['session']['completed'])
        self.assertNotIn('Try one',r['beeMessage'])
    def test_bad_model_decision_fails_without_state_change(self):
        before=self.client.get('/sessions/'+self.session['id'],headers=self.h).get_json()
        r=self.send('random')
        self.assertEqual(r.status_code,502);self.assertEqual(r.get_json()['error'],'invalid_assessment')
        after=self.client.get('/sessions/'+self.session['id'],headers=self.h).get_json()
        self.assertEqual(after['revision'],before['revision']);self.assertEqual(after['messages'],before['messages'])
    def test_replay_returns_cached_result_without_second_call(self):
        first=self.send('Okay lang, at ikaw? Kamusta?','same')
        second=self.client.post('/sessions/'+self.session['id']+'/messages',json={'requestId':'same','expectedRevision':self.session['revision'],'text':'Okay lang, at ikaw? Kamusta?'},headers=self.h)
        self.assertEqual(first.get_json(),second.get_json());self.assertEqual(len(self.calls),1)
if __name__=='__main__':unittest.main()
