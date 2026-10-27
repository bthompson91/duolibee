import json
import tempfile
import unittest
from pathlib import Path
from chat_app import create_app,DIMS
ROOT=Path(__file__).resolve().parents[1]

class ContinuousThreadHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.calls=0
        def evaluator(text,state):
            self.calls+=1
            return dict(assessment=dict(status='scored',ratings=dict.fromkeys(DIMS,4),evidence=[dict(goalId=g['id'],quote=text) for g in state['missionSnapshot']['goals']],feedback=''),reply='Okay! Salamat.',taskRelevant=True,assistedGoalIds=[]),{}
        app=create_app(Path(self.tmp.name),evaluator=evaluator,daily_limit=450,shared_minute_limit=12,account_daily_limit=400,account_minute_limit=10,public_origin='https://bthompson91.github.io',google_client_id='test',identity_verifier=lambda raw:{'sub':raw},catalog_loader=lambda:(json.loads((ROOT/'data/lessons.json').read_text()),json.loads((ROOT/'data/chat-missions.json').read_text())))
        self.client=app.test_client()
        self.h={'Origin':'https://bthompson91.github.io','Authorization':'Bearer alice'}
    def tearDown(self):self.tmp.cleanup()
    def open(self):
        r=self.client.post('/thread/open',json=dict(lesson=1,vocabularyThroughLesson=0),headers=self.h)
        self.assertEqual(r.status_code,200)
        return r.get_json()
    def test_real_assessment_rolls_to_next_lesson_once(self):
        s=self.open();body=dict(requestId='once',expectedRevision=s['revision'],text='Okay lang')
        r=self.client.post('/thread/messages',json=body,headers=self.h)
        self.assertEqual(r.status_code,200)
        data=r.get_json();self.assertEqual(data['lesson'],5)
        self.assertEqual(data['messages'][-2]['kind'],'feedback')
        replay=self.client.post('/thread/messages',json=body,headers=self.h)
        self.assertEqual(replay.get_json(),data);self.assertEqual(self.calls,1)
    def test_authentication_and_origin_guard_apply(self):
        self.assertEqual(self.client.post('/thread/open',json=dict(lesson=1,vocabularyThroughLesson=0)).status_code,401)
        self.assertEqual(self.client.post('/thread/open',json=dict(lesson=1,vocabularyThroughLesson=0),headers=self.h|{'Origin':'https://evil.example'}).status_code,403)
    def test_bad_fields_and_boolean_scope_rejected(self):
        self.assertEqual(self.client.post('/thread/open',json=dict(lesson=True,vocabularyThroughLesson=0),headers=self.h).status_code,400)
        self.assertEqual(self.client.post('/thread/messages',json=[],headers=self.h).status_code,400)
    def test_other_account_cannot_read_history(self):
        self.open()
        r=self.client.get('/thread/history?before=999999',headers=self.h|{'Authorization':'Bearer bob'})
        self.assertEqual(r.status_code,409)
    def test_hint_and_end_are_messages(self):
        s=self.open()
        r=self.client.post('/thread/hint',json=dict(requestId='hint',expectedRevision=s['revision']),headers=self.h)
        self.assertEqual(r.status_code,200);data=r.get_json()
        self.assertEqual(data['messages'][-1]['kind'],'hint')
        r=self.client.post('/thread/end',json=dict(requestId='end',expectedRevision=data['revision']),headers=self.h)
        self.assertEqual(r.status_code,200);self.assertEqual(r.get_json()['lesson'],5)
        self.assertEqual(r.get_json()['messages'][-2]['kind'],'feedback')
    def test_delete_and_reopen(self):
        self.open();r=self.client.delete('/thread',headers=self.h)
        self.assertEqual(r.status_code,200);self.assertEqual(len(self.open()['messages']),1)
