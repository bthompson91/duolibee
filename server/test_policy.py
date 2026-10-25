import json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from chat_app import BEE_POLICY, DIMS, VERSION, evaluate
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
class BeginnerPolicyTests(unittest.TestCase):
    def test_version_and_visible_mission_text(self):
        self.assertEqual(VERSION,(HERE/'VERSION').read_text().strip())
        data=json.loads((ROOT/'data/chat-missions.json').read_text())
        self.assertEqual(data['style'],'absolute-beginner-taglish')
        self.assertEqual(len(data['missions']),100)
        self.assertEqual(len(data['questions']),25)
        self.assertTrue(all(len(q.split())<=16 for q in data['questions']))
        self.assertEqual(data['templates']['goals'][0]['prompt'],'Your turn! Try one Tagalog word you know. English is okay too.')
        self.assertNotIn('pangungusap',json.dumps(data['templates']))
    def test_assessment_uses_policy_file(self):
        self.assertEqual(BEE_POLICY,(HERE/'bee-policy.txt').read_text(encoding='utf-8'))
        self.assertIn('Do not penalize natural English code-switching.',BEE_POLICY)
        a=dict(status='scored',ratings=dict.fromkeys(DIMS,4),evidence=[dict(goalId='vocabulary-use',quote='kape')],feedback='')
        mission=dict(title='Beginner drink chat',goals=[dict(id='vocabulary-use',description='Use a taught drink word.')])
        state=dict(messages=[dict(role='bee',text='What drink would you like?')],vocabularySnapshot=['kape'],vocabularyThroughLesson=1)
        with tempfile.TemporaryDirectory() as d,patch('chat_app.requests.post') as post:
            key=Path(d)/'test.key';key.write_text('not-a-real-key')
            post.return_value.status_code=200;post.return_value.ok=True
            post.return_value.json.return_value=dict(candidates=[dict(finishReason='STOP',content=dict(parts=[dict(text=json.dumps(a))]))])
            result,_=evaluate(key,'kape please',state,mission,{})
            self.assertEqual(result['status'],'scored')
            self.assertEqual(post.call_args.kwargs['json']['systemInstruction']['parts'][0]['text'],BEE_POLICY)
if __name__=='__main__':unittest.main()
