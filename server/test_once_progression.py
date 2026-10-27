import json
import unittest
import test_continuous_thread as base
from once_progression import OneAnswerStore,one_goal,prompt_key,next_unanswered

class OneAnswerProgressionTests(unittest.TestCase):
    def setUp(self):
        base.ContinuousThreadTests.setUp(self)
        for m in self.catalog.values():
            for g in m['goals']:g['description']='Answer the question.'
        self.store=OneAnswerStore(self.path,lambda:self.catalog,lambda ms,n:[])
    tearDown=base.ContinuousThreadTests.tearDown
    open=base.ContinuousThreadTests.open
    invoke=base.ContinuousThreadTests.invoke
    send=base.ContinuousThreadTests.send

    def test_one_required_answer_goal(self):
        self.open()
        with self.store.db() as c:
            s=self.store.state(c,self.store.row(c,'alice'))
        self.assertEqual([g['id'] for g in s['missionSnapshot']['goals']],['theme-response'])
    def test_duplicate_openings_are_skipped(self):
        for n in range(1,5):self.catalog[f'lesson-{n:03d}']['opening']='Kumusta?'
        s,_=self.send(self.open())
        self.assertEqual(s['lesson'],5)
        self.assertEqual(sum(m['text']=='Kumusta?' for m in s['messages']),1)
    def test_answered_question_never_returns_on_reopen(self):
        s,_=self.send(self.open())
        for _ in range(3):self.assertEqual(self.open()['lesson'],2)
    def test_old_active_session_with_answer_credit_moves_on(self):
        self.open()
        with self.store.db() as c:
            s=self.store.state(c,self.store.row(c,'alice'))
            s['missionSnapshot'].pop('onceAnswer')
            s['missionSnapshot']['goals'].append(dict(id='continue-conversation',description='More'))
            s['completed']['theme-response']=dict(mode='independent',quote='Kape')
            self.store.save(c,s)
        self.assertEqual(self.open()['lesson'],2)
    def test_unanswered_prompt_is_not_falsely_mastered(self):
        self.open()
        with self.store.db() as c:self.assertEqual(self.store.answered(c,'alice'),set())
    def test_end_of_available_prompts_does_not_loop(self):
        self.catalog={k:v for k,v in self.catalog.items() if k in ('lesson-001','lesson-002')}
        s,_=self.send(self.open(),rid='first')
        s,_=self.send(s,rid='second')
        self.assertEqual(s['status'],'practice_complete')
        self.assertEqual(self.open()['status'],'practice_complete')
        self.assertEqual(sum(m['text']=='Question 1?' for m in s['messages']),1)
    def test_new_prompt_can_resume_finished_thread(self):
        all_missions=self.catalog
        self.catalog={'lesson-001':all_missions['lesson-001'],'lesson-002':all_missions['lesson-002']}
        s,_=self.send(self.open(),rid='first');s,_=self.send(s,rid='second')
        self.catalog['lesson-003']=all_missions['lesson-003']
        self.assertEqual(self.open()['lesson'],3)
    def test_previous_cached_correct_answer_is_imported(self):
        self.open()
        with self.store.db() as c:
            c.execute('DELETE FROM bee_prompt_imported WHERE subject=?',('alice',))
            sid=self.store.row(c,'alice')['sid']
            c.execute('INSERT INTO replies VALUES (?,?,?,?)',(sid,'old','test',json.dumps(dict(session=dict(missionId='lesson-001',completed={'theme-response':{'quote':'Kape'}})))))
        self.assertEqual(self.open()['lesson'],2)
    def test_mastery_is_account_scoped(self):
        self.send(self.open())
        self.assertEqual(self.open('bob')['lesson'],1)
    def test_same_wording_normalized_for_spacing_and_case(self):
        self.assertEqual(prompt_key({'opening':'  KUMUSTA?  '}),prompt_key({'opening':'kumusta?'}))
    def test_catalog_not_mutated_by_one_goal(self):
        m=self.catalog['lesson-001'];one_goal(m)
        self.assertEqual(len(m['goals']),2)
    def test_skip_does_not_record_correct_answer(self):
        self.send(self.open(),kind='end')
        with self.store.db() as c:self.assertEqual(self.store.answered(c,'alice'),set())
