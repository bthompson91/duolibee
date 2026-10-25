import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from continuous_thread import BeeThreadStore, ThreadConflict, session_feedback

class ContinuousThreadTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'chat.sqlite3'
        with sqlite3.connect(self.path) as c:
            c.executescript('CREATE TABLE sessions(id TEXT PRIMARY KEY,state TEXT,updated INTEGER); CREATE TABLE owners_v026(session_id TEXT PRIMARY KEY,subject TEXT); CREATE TABLE replies(session_id TEXT,request_id TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(session_id,request_id));')
        self.catalog={f'lesson-{n:03d}':dict(lesson=n,opening=f'Question {n}?',closing='Salamat!',goals=[dict(id='theme-response'),dict(id='continue-conversation')],vocabulary=['kape']) for n in range(1,101)}
        self.store=BeeThreadStore(self.path,lambda:self.catalog,lambda ms,n:['kape'] if n else [])
        self.calls=0

    def tearDown(self):self.tmp.cleanup()
    def open(self,owner='alice',lesson=1):return self.store.open(owner,lesson,0)
    def invoke(self,sid,kind,body):
        self.calls+=1
        with self.store.db() as c:
            old=c.execute('SELECT result FROM replies WHERE session_id=? AND request_id=?',(sid,body['requestId'])).fetchone()
            if old:return json.loads(old[0]),200
            state=json.loads(c.execute('SELECT state FROM sessions WHERE id=?',(sid,)).fetchone()[0])
            if state['revision']!=body['expectedRevision']:return {'error':'Reload'},409
            if kind=='hint':
                state['hints']['theme-response']=2
                data={'hint':{'text':'Try a short phrase.'}}
            else:
                if kind=='messages':
                    state['messages'] += [dict(role='learner',text=body['text']),dict(role='bee',text='Thanks for your answer.')]
                    state['attempts'].append(dict(score=8,taskRelevant=True,ratings=dict(communication=4,grammar=3,vocabulary=3,naturalness=3)))
                state['status']='completed' if kind=='messages' else 'ended_incomplete'
                data={}
            state['revision']+=1
            self.store.save(c,state)
            c.execute('INSERT INTO replies VALUES (?,?,?,?)',(sid,body['requestId'],'test',json.dumps(data)))
            return data,200
    def send(self,snapshot,rid='one',owner='alice',kind='messages',text='Kape'):
        body=dict(requestId=rid,expectedRevision=snapshot['revision'])
        if kind=='messages':body['text']=text
        data,status=self.store.perform(owner,kind,body,self.invoke)
        self.assertEqual(status,200)
        return data,body
    def test_bee_opens_automatically(self):
        s=self.open();self.assertEqual(s['messages'][0]['text'],'Question 1?')
    def test_open_is_idempotent(self):
        self.assertEqual(self.open(),self.open())
    def test_completion_sends_feedback_then_next_opening(self):
        s,_=self.send(self.open())
        self.assertEqual(s['lesson'],2)
        self.assertEqual(s['messages'][-2]['kind'],'feedback')
        self.assertEqual(s['messages'][-1]['text'],'Question 2?')
    def test_many_exchanges_use_one_session(self):
        s=self.open()
        for n in range(12):s,_=self.send(s,str(n))
        self.assertEqual(s['lesson'],13)
        with self.store.db() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],1)
    def test_owner_isolation(self):
        self.open('alice');bob=self.open('bob',4)
        self.assertTrue(all('Question 1?'!=m['text'] for m in bob['messages']))
        self.assertEqual(bob['lesson'],4)
    def test_restart_keeps_history_and_current_lesson(self):
        s,_=self.send(self.open())
        store=BeeThreadStore(self.path,lambda:self.catalog,lambda ms,n:[])
        self.assertEqual(store.open('alice',1,0),s)
    def test_retry_does_not_duplicate_summary_or_advance(self):
        s=self.open();done,body=self.send(s)
        again,status=self.store.perform('alice','messages',body,self.invoke)
        self.assertEqual(again,done);self.assertEqual(self.calls,1)
    def test_same_request_id_different_payload_rejected(self):
        s=self.open();_,body=self.send(s);body['text']='Different'
        with self.assertRaises(ThreadConflict):self.store.perform('alice','messages',body,self.invoke)
    def test_failed_provider_preserves_transcript(self):
        s=self.open()
        body=dict(requestId='fail',expectedRevision=0,text='Kape')
        result,status=self.store.perform('alice','messages',body,lambda *a:({'error':'quota_or_rate_limit'},502))
        self.assertEqual(status,502);self.assertEqual(self.open(),s)
    def test_failed_request_can_retry(self):
        s=self.open();body=dict(requestId='fail',expectedRevision=0,text='Kape')
        self.store.perform('alice','messages',body,lambda *a:({'error':'temporary'},502))
        done,status=self.store.perform('alice','messages',body,self.invoke)
        self.assertEqual(status,200);self.assertEqual(done['lesson'],2)
    def test_recover_after_base_action_committed_without_wrapper_completion(self):
        s=self.open();body=dict(requestId='recover',expectedRevision=0,text='Kape')
        def interrupted(sid,kind,body):
            self.invoke(sid,kind,body)
            raise RuntimeError('process interrupted')
        with self.assertRaises(RuntimeError):self.store.perform('alice','messages',body,interrupted)
        done,status=self.store.perform('alice','messages',body,self.invoke)
        self.assertEqual(status,200);self.assertEqual(done['lesson'],2)
        self.assertEqual(len([m for m in done['messages'] if m.get('kind')=='feedback']),1)
    def test_stale_revision_does_not_change_history(self):
        s=self.open();done,_=self.send(s)
        _,status=self.store.perform('alice','messages',dict(requestId='stale',expectedRevision=0,text='Hello'),self.invoke)
        self.assertEqual(status,409);self.assertEqual(self.open(),done)
    def test_hint_is_persistent_message(self):
        s,_=self.send(self.open(),kind='hint')
        self.assertEqual(s['messages'][-1]['kind'],'hint');self.assertEqual(self.open(),s)
    def test_assistance_mentioned_at_end(self):
        s,_=self.send(self.open(),rid='hint',kind='hint')
        s,_=self.send(s,rid='answer')
        summary=[m['text'] for m in s['messages'] if m.get('kind')=='feedback'][0]
        self.assertIn('starter or example',summary)
    def test_history_paginates_without_losing_messages(self):
        s=self.open()
        for n in range(30):s,_=self.send(s,str(n))
        self.assertTrue(s['hasOlder']);self.assertEqual(len(s['messages']),100)
        earlier=self.store.history('alice',s['messages'][0]['eventId'])
        self.assertTrue(earlier['messages']);self.assertFalse(earlier['hasOlder'])
        self.assertLess(earlier['messages'][-1]['eventId'],s['messages'][0]['eventId'])
    def test_history_cursor_does_not_leak_another_owner(self):
        a=self.open();self.open('bob',8)
        b=self.store.history('bob',100000)
        self.assertFalse(any(m['text']=='Question 1?' for m in b['messages']))
    def test_import_only_owned_legacy_messages_once(self):
        with self.store.db() as c:
            for owner in ('alice','bob'):
                c.execute('INSERT INTO sessions VALUES (?,?,?)',(owner,json.dumps(dict(messages=[dict(role='learner',text='secret-'+owner)],status='active')),1))
                c.execute('INSERT INTO owners_v026 VALUES (?,?)',(owner,owner))
        a=self.open();self.open()
        self.assertEqual(sum(m['text']=='secret-alice' for m in a['messages']),1)
        self.assertFalse(any(m['text']=='secret-bob' for m in a['messages']))
    def test_delete_does_not_reimport_legacy_or_delete_other_owner(self):
        self.open('bob',8)
        with self.store.db() as c:
            c.execute('INSERT INTO sessions VALUES (?,?,?)',('old',json.dumps(dict(messages=[dict(role='learner',text='old text')],status='active')),1))
            c.execute('INSERT INTO owners_v026 VALUES (?,?)',('old','alice'))
        self.open();self.store.delete('alice');new=self.open()
        self.assertFalse(any(m['text']=='old text' for m in new['messages']))
        self.assertEqual(self.open('bob')['lesson'],8)
    def test_wrap_after_last_lesson(self):
        s,_=self.send(self.open(lesson=100));self.assertEqual(s['lesson'],1)
    def test_incomplete_summary_does_not_claim_success(self):
        text=session_feedback(dict(status='ended_incomplete',attempts=[],completed={},hints={}))
        self.assertIn("don't have enough",text);self.assertNotIn('Nice work finishing',text)
    def test_off_topic_scores_excluded(self):
        text=session_feedback(dict(status='ended_incomplete',attempts=[dict(score=10,taskRelevant=False)],hints={}))
        self.assertIn("don't have enough",text)
    def test_no_numeric_scorecard_in_summary(self):
        text=session_feedback(dict(status='completed',attempts=[dict(score=8,ratings=dict(grammar=2))],hints={}))
        self.assertNotIn('/10',text);self.assertIn('word order',text)
    def test_context_carried_between_exchanges(self):
        self.send(self.open())
        with self.store.db() as c:state=self.store.state(c,self.store.row(c,'alice'))
        self.assertTrue(any(m.get('text')=='Kape' for m in state['threadRecent']))

if __name__=='__main__':unittest.main()
