import json, sqlite3, tempfile, unittest
from pathlib import Path
from unittest import mock
import chat_app
from chat_app import ProviderError, create_app
ROOT=Path(__file__).resolve().parents[1]
AUDIO=b'\x00\x01\x02\x03'
ORIGIN='https://bthompson91.github.io'
class TranscribeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        lessons=json.loads((ROOT/'data/lessons.json').read_text());manifest=json.loads((ROOT/'data/chat-missions.json').read_text())
        self.calls=[]
        def transcriber(key_path,audio,mime):
            self.calls.append((audio,mime));return 'Kumusta'
        self.client=create_app(Path(self.tmp.name),token='<redacted>',public_origin=ORIGIN,google_client_id='test',identity_verifier=lambda raw:{'sub':raw},catalog_loader=lambda:(lessons,manifest),transcriber=transcriber).test_client()
        self.h={'Origin':ORIGIN}
    def post(self,data=AUDIO,ctype='audio/mp4',headers=None):
        return self.client.post('/transcribe',data=data,content_type=ctype,headers=self.h if headers is None else headers)
    def fresh_client(self,transcriber,**kw):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        lessons=json.loads((ROOT/'data/lessons.json').read_text());manifest=json.loads((ROOT/'data/chat-missions.json').read_text())
        return create_app(Path(tmp.name),token='<redacted>',public_origin=ORIGIN,google_client_id='test',identity_verifier=lambda raw:{'sub':raw},catalog_loader=lambda:(lessons,manifest),transcriber=transcriber,**kw).test_client()
    def test_happy_path_needs_no_authorization(self):
        r=self.post()
        self.assertEqual(r.status_code,200);self.assertEqual(r.get_json(),{'transcript':'Kumusta'})
        self.assertEqual(self.calls,[(AUDIO,'audio/mp4')])
    def test_wrong_origin_is_403(self):
        self.assertEqual(self.post(headers={'Origin':'https://evil.example'}).status_code,403)
    def test_empty_body_is_400(self):
        self.assertEqual(self.post(data=b'').status_code,400)
    def test_unsupported_mime_type_is_400(self):
        self.assertEqual(self.post(ctype='text/plain').status_code,400)
    def test_body_over_512kb_is_413(self):
        self.assertEqual(self.post(data=b'x'*(512*1024+1)).status_code,413)
    def test_second_call_within_minute_is_rate_limited(self):
        c=self.fresh_client(lambda kp,a,m:'Kumusta',shared_minute_limit=1)
        self.assertEqual(c.post('/transcribe',data=AUDIO,content_type='audio/mp4',headers=self.h).status_code,200)
        self.assertEqual(c.post('/transcribe',data=AUDIO,content_type='audio/mp4',headers=self.h).status_code,429)
    def test_provider_error_is_502(self):
        def boom(kp,a,m):raise ProviderError('provider_error')
        c=self.fresh_client(boom)
        r=c.post('/transcribe',data=AUDIO,content_type='audio/mp4',headers=self.h)
        self.assertEqual(r.status_code,502);self.assertEqual(r.get_json()['error'],'provider_error')
    def test_transcribe_request_uses_response_format(self):
        payloads=[]
        class Resp:
            status_code=200;ok=True
            def json(self):return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{"transcript": "Kumusta"}'}]}}]}
        def fake_post(url,headers=None,json=None,timeout=None):
            payloads.append(json);return Resp()
        key=Path(self.tmp.name)/'key.txt';key.write_text('dummy-key')
        with mock.patch.object(chat_app.requests,'post',fake_post):
            self.assertEqual(chat_app.transcribe_audio(key,b'\x00\x01','audio/mp4'),'Kumusta')
        self.assertEqual(len(payloads),1)
        gen=payloads[0]['generationConfig']
        self.assertNotIn('responseSchema',gen);self.assertNotIn('responseMimeType',gen)
        self.assertEqual(gen['responseFormat'],{'text':{'mimeType':'APPLICATION_JSON','schema':{'type':'object','additionalProperties':False,'required':['transcript'],'properties':{'transcript':{'type':'string'}}}}})
    def test_audio_is_not_persisted(self):
        self.assertEqual(self.post().status_code,200)
        with sqlite3.connect(Path(self.tmp.name)/'chat.sqlite3') as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],0)
        self.assertEqual({p.name for p in Path(self.tmp.name).iterdir()},{'chat.sqlite3'})
if __name__=='__main__':unittest.main()
