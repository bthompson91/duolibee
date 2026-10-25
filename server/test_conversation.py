import unittest
from copy import deepcopy
from conversation import DIMS, DialogueError, apply_decision, response_schema, validate_decision
TEXT='Okay lang, at ikaw? Kamusta?'
def state():
    return dict(id='test',revision=0,status='active',turns=0,completed={},hints={},attempts=[],messages=[dict(role='bee',text='Kumusta? How are you?')],missionSnapshot=dict(dialogueVersion=2,opening='Kumusta? How are you?',closing='Salamat! Nice work!',vocabulary=['Salamat'],goals=[dict(id='vocabulary-use',description='Respond to the question using appropriate Tagalog or Taglish.'),dict(id='theme-response',description='Ask a relevant question back.')] ))
def decision(relevant=True,text=TEXT,evidence=None,reply='Okay din ako! Thanks for asking.',rating=4,status='scored',assisted=None):
    return dict(assessment=dict(status=status,ratings=dict.fromkeys(DIMS,rating if status=='scored' else None),evidence=[] if evidence is None else evidence,feedback='Do not display this as dialogue.'),reply=reply,taskRelevant=relevant,assistedGoalIds=assisted or [])
class NumberedDialogueTests(unittest.TestCase):
    def test_actual_greeting_answers_before_closing(self):
        old=state();e=[dict(goalId='vocabulary-use',quote='Okay lang'),dict(goalId='theme-response',quote='at ikaw?')]
        new,a,bee=apply_decision(old,TEXT,'a',decision(evidence=e))
        self.assertTrue(bee.startswith('Okay din ako!'))
        self.assertTrue(bee.endswith('Salamat! Nice work!'))
        self.assertNotIn('Try one',bee)
        self.assertEqual(new['status'],'completed')
        self.assertEqual(new['completed']['vocabulary-use']['mode'],'independent')
        self.assertEqual(new['completed']['theme-response']['mode'],'independent')
        self.assertEqual(a['languageScore'],10)
        self.assertEqual(a['reaction'],'positive')
        self.assertEqual(old,state())
    def test_valid_reply_need_not_be_in_vocabulary_pool(self):
        text='Ayos lang ako.';new,a,_=apply_decision(state(),text,'a',decision(evidence=[dict(goalId='vocabulary-use',quote=text)]))
        self.assertIn('vocabulary-use',new['completed']);self.assertEqual(a['status'],'scored')
    def test_real_word_off_topic_is_not_bad_language(self):
        new,a,bee=apply_decision(state(),'Puwet','b',decision(relevant=False,text='Puwet',reply='That is a Tagalog word! We are practising greetings. How are you?'))
        self.assertEqual(a['languageStatus'],'scored');self.assertEqual(a['languageScore'],10)
        self.assertEqual(a['status'],'off_topic');self.assertEqual(a['reaction'],'neutral')
        self.assertFalse(new['completed']);self.assertIn('greetings',bee)
        self.assertNotIn('Try one',bee)
    def test_off_topic_cannot_award_even_contradictory_model_evidence(self):
        d=decision(relevant=False,evidence=[dict(goalId='vocabulary-use',quote='Puwet')]);new,a,_=apply_decision(state(),'Puwet','b',d)
        self.assertEqual(a['evidence'],[]);self.assertFalse(new['completed']);self.assertTrue(d['assessment']['evidence'])
    def test_low_quality_relevant_reply_is_support_not_failure_sticker(self):
        _,a,_=apply_decision(state(),TEXT,'a',decision(rating=2))
        self.assertEqual(a['status'],'needs_practice');self.assertEqual(a['reaction'],'support')
    def test_english_only_does_not_award_goals(self):
        new,a,_=apply_decision(state(),'I am fine','e',decision(status='english_only'))
        self.assertIsNone(a['score']);self.assertFalse(new['completed'])
    def test_assistance_does_not_retroactively_change_earned_completion(self):
        e=[dict(goalId='vocabulary-use',quote='Okay lang')]
        new,_,_=apply_decision(state(),TEXT,'a',decision(evidence=e,assisted=['vocabulary-use','theme-response']))
        self.assertEqual(new['completed']['vocabulary-use']['mode'],'independent')
        self.assertNotIn('vocabulary-use',new['hints']);self.assertEqual(new['hints']['theme-response'],3)
    def test_previous_hint_keeps_completion_assisted(self):
        s=state();s['hints']['vocabulary-use']=2
        new,_,_=apply_decision(s,TEXT,'a',decision(evidence=[dict(goalId='vocabulary-use',quote='Okay lang')]))
        self.assertEqual(new['completed']['vocabulary-use']['mode'],'assisted')
    def test_evidence_must_quote_latest_learner(self):
        with self.assertRaises(DialogueError):validate_decision(decision(evidence=[dict(goalId='vocabulary-use',quote='Bee history')]),TEXT,state()['missionSnapshot'])
    def test_unknown_goal_cannot_be_credited(self):
        with self.assertRaises(DialogueError):validate_decision(decision(evidence=[dict(goalId='xp',quote='Okay lang')]),TEXT,state()['missionSnapshot'])
    def test_extra_fields_are_rejected(self):
        with self.assertRaises(DialogueError):validate_decision(decision()|dict(xp=100),TEXT,state()['missionSnapshot'])
    def test_rating_bool_is_not_integer_credit(self):
        with self.assertRaises(DialogueError):validate_decision(decision(rating=True),TEXT,state()['missionSnapshot'])
    def test_unscored_ratings_and_evidence_fail_closed(self):
        d=decision(status='help_request');d['assessment']['ratings']['grammar']=4
        with self.assertRaises(DialogueError):validate_decision(d,TEXT,state()['missionSnapshot'])
        d=decision(status='help_request',evidence=[dict(goalId='vocabulary-use',quote='Okay lang')])
        with self.assertRaises(DialogueError):validate_decision(d,TEXT,state()['missionSnapshot'])
    def test_empty_or_long_reply_is_rejected(self):
        for reply in (' ','x'*321):
            with self.assertRaises(DialogueError):validate_decision(decision(reply=reply),TEXT,state()['missionSnapshot'])
    def test_relevance_is_boolean(self):
        with self.assertRaises(DialogueError):validate_decision(decision()|dict(taskRelevant='yes'),TEXT,state()['missionSnapshot'])
    def test_schema_keeps_assessment_separate(self):
        raw={'type':'object'};copy=deepcopy(raw);schema=response_schema(raw,state()['missionSnapshot'])
        self.assertEqual(set(schema['required']),{'assessment','reply','taskRelevant','assistedGoalIds'})
        schema['properties']['assessment']['type']='array';self.assertEqual(raw,copy)
    def test_legacy_session_is_not_silently_reinterpreted(self):
        s=state();del s['missionSnapshot']['dialogueVersion']
        with self.assertRaises(DialogueError):apply_decision(s,TEXT,'a',decision())
    def test_existing_turn_limit_is_preserved(self):
        s=state();s['turns']=9
        new,_,_=apply_decision(s,TEXT,'a',decision())
        self.assertEqual(new['status'],'ended_incomplete')
if __name__=='__main__':unittest.main()
