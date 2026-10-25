"""Duolibee: versioned source; Google-authenticated, single-worker backend."""
from contextlib import contextmanager
from pathlib import Path
import hashlib, hmac, json, os, re, secrets, sqlite3, threading, time, uuid
import requests
from flask import Flask, jsonify, request, g
from conversation import DialogueError, apply_decision, response_schema, validate_decision
VERSION=Path(__file__).with_name('VERSION').read_text(encoding='utf-8').strip()
BEE_POLICY=Path(__file__).with_name('bee-policy.txt').read_text(encoding='utf-8')
CONVERSATION_POLICY=Path(__file__).with_name('conversation-policy.txt').read_text(encoding='utf-8')
DIMS=['communication','grammar','vocabulary','naturalness']
WEIGHTS=[.4,.25,.2,.15]
MODEL='gemini-3.5-flash-lite'
ORIGIN='https://bthompson91.github.io'
CLIENT='953505436719-p73hfncc6p39481s6jaedj975l2a9rul.apps.googleusercontent.com'
BASE='https://raw.githubusercontent.com/bthompson91/duolibee/main/data/'
MISSION={'id': 'introductions-midpoint', 'version': 1, 'title': 'Meet the bee', 'fictionalDetailsOnly': True, 'opening': 'Kumusta! Ano ang pangalan mo?', 'goals': [{'id': 'name', 'description': 'Introduce yourself using an invented name', 'prompt': 'Ano ang pangalan mo?', 'hints': ['Tell the bee your invented name in Tagalog.', 'Ako si...', 'Ako si Alex.']}, {'id': 'origin', 'description': 'State a fictional place of origin', 'prompt': 'Taga-saan ka?', 'hints': ['Say where your character is from in Tagalog.', 'Taga-... ako.', 'Taga-Australia ako.']}]}

class InvalidAssessment(ValueError):pass
class ProviderError(Exception):
    def __init__(self,kind):self.kind=kind

def vocab_for(missions,limit):
    return list(dict.fromkeys(w for n in range(1,limit+1) for w in missions.get(f'lesson-{n:03d}',{}).get('vocabulary',[])))

def validate_assessment(a,text,mission):
    if not isinstance(a,dict) or set(a)!={'status','ratings','evidence','feedback'} or a['status'] not in ('scored','english_only','needs_clarification','help_request'):raise InvalidAssessment('fields')
    if not isinstance(a['ratings'],dict) or set(a['ratings'])!=set(DIMS):raise InvalidAssessment('ratings')
    if a['status']=='scored':
        if not all(type(v) is int and 0<=v<=4 for v in a['ratings'].values()):raise InvalidAssessment('range')
    elif any(v is not None for v in a['ratings'].values()):raise InvalidAssessment('unscored ratings')
    if not isinstance(a['feedback'],str) or len(a['feedback'])>500 or not isinstance(a['evidence'],list) or len(a['evidence'])>2:raise InvalidAssessment('evidence')
    seen=set();goals={x['id'] for x in mission['goals']}
    for e in a['evidence']:
        if not isinstance(e,dict) or set(e)!={'goalId','quote'} or not isinstance(e['goalId'],str) or e['goalId'] not in goals or e['goalId'] in seen or not isinstance(e['quote'],str) or not e['quote'].strip() or e['quote'] not in text:raise InvalidAssessment('quote')
        seen.add(e['goalId'])
    if a['status']!='scored' and a['evidence']:raise InvalidAssessment('unscored evidence')
    return a

def assessment_schema(mission):
    return {'type':'object','additionalProperties':False,'required':['status','ratings','evidence','feedback'],'properties':{'status':{'type':'string','enum':['scored','english_only','needs_clarification','help_request']},'ratings':{'type':'object','additionalProperties':False,'required':DIMS,'properties':{d:{'type':['integer','null'],'minimum':0,'maximum':4} for d in DIMS}},'evidence':{'type':'array','maxItems':2,'items':{'type':'object','additionalProperties':False,'required':['goalId','quote'],'properties':{'goalId':{'type':'string','enum':[g['id'] for g in mission['goals']]},'quote':{'type':'string'}}}},'feedback':{'type':'string'}}}

def schema(mission):
    assessment=assessment_schema(mission)
    return response_schema(assessment,mission) if mission.get('dialogueVersion')==2 else assessment

def evaluate(key_path,text,state,mission,missions):
    dialogue_v2=mission.get('dialogueVersion')==2
    instructions=CONVERSATION_POLICY if dialogue_v2 else BEE_POLICY
    prompt=dict(mission=mission['title'],goals=[dict(id=g['id'],description=g['description']) for g in mission['goals']],completedGoals=list(state.get('completed',{})),hintLevels=state.get('hints',{}),currentBeeMessage=state['messages'][-1]['text'],recentMessages=state['messages'][-8:],learnerReply=text,suggestedVocabulary=state.get('vocabularySnapshot',vocab_for(missions,state.get('vocabularyThroughLesson',0))))
    payload={'systemInstruction':{'parts':[{'text':instructions}]},'contents':[{'parts':[{'text':json.dumps(prompt,ensure_ascii=False)}]}],'generationConfig':{'maxOutputTokens':4096,'thinkingConfig':{'thinkingLevel':'low'},'responseFormat':{'text':{'mimeType':'APPLICATION_JSON','schema':schema(mission)}}}}
    try:
        key=key_path.read_text().strip()
        r=requests.post('https://generativelanguage.googleapis.com/v1beta/models/'+MODEL+':generateContent',headers={'x-goog-api-key':key},json=payload,timeout=(5,60))
        if r.status_code==429:raise ProviderError('quota_or_rate_limit')
        if not r.ok:raise ProviderError('provider_error')
        data=r.json();candidates=data.get('candidates',[])
        if len(candidates)!=1 or candidates[0].get('finishReason')!='STOP':raise InvalidAssessment('incomplete')
        raw=''.join(p.get('text','') for p in candidates[0].get('content',{}).get('parts',[]) if not p.get('thought'))
        decoded=json.loads(raw)
        assessed=validate_decision(decoded,text,mission) if dialogue_v2 else validate_assessment(decoded,text,mission)
        return assessed,data.get('usageMetadata',{})
    except (requests.RequestException,OSError):raise ProviderError('connection_or_key_error') from None
    except (ValueError,TypeError,KeyError,AttributeError):raise ProviderError('invalid_assessment') from None


def build_catalog(lessons, manifest):
    if not isinstance(lessons,dict) or not isinstance(manifest,dict):raise ValueError('Invalid catalog')
    ids=[c+1+k*25 for c in range(25) for k in range(4)]
    if lessons.get('total')!=100 or len(lessons.get('themes',[]))!=25 or manifest.get('schemaVersion')!=2 or manifest.get('numbering')!='display-v2' or manifest.get('legacyIds')!=ids or len(manifest.get('missions',[]))!=100:raise ValueError('Catalog numbering mismatch')
    questions=manifest.get('questions',[])
    if len(questions)!=25 or not all(isinstance(q,str) and 1<=len(q)<=500 for q in questions):raise ValueError('Invalid questions')
    dialogue=manifest.get('dialogue',{})
    if dialogue.get('version')!=2 or dialogue.get('lessons')!=list(range(1,101)):raise ValueError('Invalid dialogue profile')
    result={}
    for n,row in enumerate(manifest['missions'],1):
        old=ids[n-1];theme=lessons['themes'][(old-1)%25];items=theme['items']
        indices=[(old*3+k)%len(items) for k in range(4)]
        if row.get('lesson')!=n or row.get('items')!=indices or type(row.get('sentence')) is not int or not 0<=row['sentence']<len(theme['sentences']):raise ValueError('Invalid mission')
        words=[items[i]['t'] for i in indices]
        values=dict(words=', '.join(words),focus=words[0],theme=theme['name'],prompt=questions[(old-1)%25],example=theme['sentences'][row['sentence']]['t'])
        template=dialogue;goals=[]
        for goal in template['goals']:
            goals.append(dict(id=goal['id'],description=goal['description'].format(**values),prompt=goal['prompt'].format(**values),hints=[h.format(**values) for h in goal['hints']]))
        if len(goals)!=2 or len({x['id'] for x in goals})!=2 or any(len(x['hints'])!=3 for x in goals):raise ValueError('Invalid goals')
        result[f'lesson-{n:03d}']=dict(lesson=n,legacyId=old,title=f"{theme['name']} • Lesson {n}",numberingVersion='display-v2',dialogueVersion=2,goals=goals,vocabulary=words,opening=template['opening'].format(**values),closing=template['closing'])
    return result

def google_verifier(audience):
    from google.oauth2 import id_token
    from google.auth.transport.requests import Request
    transport=Request()
    return lambda raw:id_token.verify_oauth2_token(raw,transport,audience)

def introduction_answer(text, goal):
    q=text.lower().strip()
    name=bool(re.search(r'(?:ano ang|anong) pangalan mo|sino ka',q))
    origin=bool(re.search(r'taga[- ]saan ka',q))
    reciprocal=bool(re.search(r'(?:at )?ikaw(?: naman)?[?.! ]*$',q))
    if not(name or origin or reciprocal):return '',None,False
    gid='origin' if origin or (reciprocal and goal and goal['id']=='origin') else 'name'
    pure=bool(re.fullmatch(r'(?:ano ang pangalan mo|anong pangalan mo|sino ka|taga[- ]saan ka|(?:at )?ikaw(?: naman)?)[?.! ]*',q))
    return ('Sa kuwento natin, taga-Pilipinas ako.' if gid=='origin' else 'Ako si Bee!'),gid,pure


def create_app(state_dir=None,key_path=None,token=None,evaluator=None,daily_limit=30,public_origin=None,google_client_id=None,identity_verifier=None,catalog_loader=None):
    if token is None and public_origin is None and google_client_id is None:public_origin,google_client_id=ORIGIN,CLIENT
    if bool(public_origin)!=bool(google_client_id):raise ValueError('Incomplete public configuration')
    if type(daily_limit) is not int or daily_limit<1:raise ValueError('Invalid quota')
    public=bool(public_origin);verify=identity_verifier or (google_verifier(google_client_id) if public else None)
    state_dir=Path(state_dir or Path.home()/'.local/state/duolibee-chat');state_dir.mkdir(parents=True,exist_ok=True,mode=0o700);state_dir.chmod(0o700)
    db_path=state_dir/'chat.sqlite3';db_path.touch(mode=0o600,exist_ok=True);db_path.chmod(0o600)
    key_path=Path(key_path or Path.home()/'.config/duolibee-chat/gemini.key')
    if not public and not token:raise ValueError('Private test token required')
    app=Flask(__name__);app.config['MAX_CONTENT_LENGTH']=4096;lock=threading.Lock();cache_lock=threading.Lock();cache={'loaded':0,'missions':None}
    @contextmanager
    def db():
        c=sqlite3.connect(db_path,timeout=5);c.row_factory=sqlite3.Row
        try:
            with c:yield c
        finally:c.close()
    with db() as c:
        c.executescript('CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,state TEXT NOT NULL,updated INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS replies(session_id TEXT,request_id TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(session_id,request_id));\nCREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY,total INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS minutes(minute INTEGER PRIMARY KEY,total INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS owners_v026(session_id TEXT PRIMARY KEY,subject TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS account_usage_v026(subject TEXT,day TEXT,total INTEGER NOT NULL,PRIMARY KEY(subject,day));\nCREATE TABLE IF NOT EXISTS account_minutes_v026(subject TEXT,minute INTEGER,total INTEGER NOT NULL,PRIMARY KEY(subject,minute));')
    def catalog():
        with cache_lock:
            now=time.time()
            if cache['missions'] is not None and now-cache['loaded']<600:return cache['missions']
            path=state_dir/'catalog-display-v2.json'
            try:
                if catalog_loader:lessons,manifest=catalog_loader()
                else:
                    def fetch(name):
                        r=requests.get(BASE+name,timeout=(5,20));r.raise_for_status()
                        if len(r.content)>2000000:raise ValueError('Catalog too large')
                        return r.json()
                    lessons,manifest=fetch('lessons.json'),fetch('chat-missions.json')
                missions=build_catalog(lessons,manifest)
                if not catalog_loader:
                    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(dict(lessons=lessons,manifest=manifest)));temp.chmod(0o600);os.replace(temp,path)
                cache['missions']=missions
            except (requests.RequestException,ValueError,KeyError,IndexError,TypeError,OSError):
                if cache['missions'] is None and path.exists():
                    data=json.loads(path.read_text());cache['missions']=build_catalog(data['lessons'],data['manifest'])
                if cache['missions'] is None:raise
            cache['loaded']=now;return cache['missions']
    def fail(message,status):return jsonify(error=message),status
    def pending(s):return next((x for x in s['missionSnapshot']['goals'] if x['id'] not in s['completed']),None)
    def view(s):
        goal=pending(s)
        return {k:v for k,v in s.items() if k not in ('hints','missionSnapshot','vocabularySnapshot')}|dict(hintLevels=s['hints'],pendingGoalId=goal['id'] if goal else None)
    def load(c,sid):
        row=c.execute('SELECT state FROM sessions WHERE id=?',(sid,)).fetchone()
        if not row:return None
        if public:
            owner=c.execute('SELECT subject FROM owners_v026 WHERE session_id=?',(sid,)).fetchone()
            if not owner or owner[0]!=g.subject:return None
        s=json.loads(row[0])
        if 'missionSnapshot' not in s:return None
        return s
    @app.before_request
    def guard():
        if request.remote_addr not in ('127.0.0.1','::1'):return fail('Proxy access only.',403)
        origin=request.headers.get('Origin')
        if public:
            if origin and origin!=public_origin:return fail('Origin rejected.',403)
            if request.method=='OPTIONS':
                hs={x.strip().lower() for x in request.headers.get('Access-Control-Request-Headers','').split(',') if x.strip()}
                if origin!=public_origin or request.headers.get('Access-Control-Request-Method') not in ('GET','POST','DELETE','OPTIONS') or hs-{'authorization','content-type'}:return fail('Preflight rejected.',403)
                return '',204
            raw=request.headers.get('Authorization','')
            if not raw.startswith('Bearer '):return fail('Google sign-in required.',401)
            try:
                subject=verify(raw[7:]).get('sub')
                if not isinstance(subject,str) or not 1<=len(subject)<=255:raise ValueError()
                g.subject=subject
            except Exception:return fail('Google sign-in could not be verified.',401)
        else:
            if origin or any(h in request.headers for h in ('Forwarded','X-Forwarded-For','X-Real-IP')):return fail('Public/browser access is disabled.',403)
            if not hmac.compare_digest(request.headers.get('Authorization','').encode(),('Bearer '+token).encode()):return fail('Local access token required.',401)
    @app.after_request
    def headers(response):
        response.headers['Cache-Control']='no-store';response.headers['X-Content-Type-Options']='nosniff'
        if public and request.headers.get('Origin')==public_origin:
            response.headers['Access-Control-Allow-Origin']=public_origin;response.headers['Vary']='Origin';response.headers['Access-Control-Allow-Methods']='GET,POST,DELETE,OPTIONS';response.headers['Access-Control-Allow-Headers']='authorization,content-type'
        return response
    @app.errorhandler(413)
    def too_large(_):return fail('Request too large.',413)
    @app.get('/health')
    def health():
        try:return jsonify(status='ok',version=VERSION,mode='google-authenticated' if public else 'private-local-only',model=MODEL,enabledMissions=len(catalog()))
        except Exception:return fail('Mission catalog unavailable.',503)
    @app.get('/missions')
    def missions():
        try:return jsonify(missions=[dict(id=k,title=v['title'],lesson=v['lesson'],goals=[dict(id=g['id'],description=g['description']) for g in v['goals']]) for k,v in catalog().items()])
        except Exception:return fail('Mission catalog unavailable.',503)
    @app.post('/sessions')
    def start():
        body=request.get_json(silent=True)
        if not isinstance(body,dict) or set(body)-{'missionId','vocabularyThroughLesson','numberingVersion'} or not isinstance(body.get('missionId'),str):return fail('Invalid session fields.',400)
        mid=body['missionId'];limit=body.get('vocabularyThroughLesson',0)
        if type(limit) is not int or not 0<=limit<=100:return fail('Invalid vocabularyThroughLesson.',400)
        if mid!='introductions-midpoint' and body.get('numberingVersion')!='display-v2':return fail('Reload DUOLIBEE v0.25.0 or newer.',409)
        try:ms={'introductions-midpoint':MISSION} if mid=='introductions-midpoint' else catalog()
        except Exception:return fail('Mission catalog unavailable.',503)
        if mid not in ms:return fail('Unknown mission.',400)
        if not lock.acquire(False):return fail('Busy; try later.',429)
        try:
            with db() as c:
                now=int(time.time())
                expired=[r[0] for r in c.execute('SELECT id FROM sessions WHERE updated<?',(now-7*86400,))]
                for sid in expired:
                    for table,column in (('replies','session_id'),('owners_v026','session_id'),('sessions','id')):c.execute('DELETE FROM '+table+' WHERE '+column+'=?',(sid,))
                if c.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]>=20:return fail('Delete an old conversation first.',429)
                if public and c.execute('SELECT COUNT(*) FROM owners_v026 WHERE subject=?',(g.subject,)).fetchone()[0]>=5:return fail('Delete an old conversation first.',429)
                s=dict(id=str(uuid.uuid4()),revision=0,status='active',turns=0,missionId=mid,numberingVersion='display-v2',missionSnapshot=ms[mid],vocabularySnapshot=vocab_for(ms,limit),vocabularyThroughLesson=limit,completed={},hints={},messages=[dict(role='bee',text=ms[mid]['opening'])],attempts=[])
                c.execute('INSERT INTO sessions VALUES (?,?,?)',(s['id'],json.dumps(s),now))
                if public:c.execute('INSERT INTO owners_v026 VALUES (?,?)',(s['id'],g.subject))
            return jsonify(view(s)),201
        finally:lock.release()
    @app.get('/sessions/<sid>')
    def get_session(sid):
        with db() as c:s=load(c,sid)
        return jsonify(view(s)) if s else fail('Not found.',404)
    @app.delete('/sessions/<sid>')
    def delete(sid):
        if not lock.acquire(False):return fail('Busy; try later.',429)
        try:
            with db() as c:
                if not load(c,sid):return fail('Not found.',404)
                c.execute('DELETE FROM replies WHERE session_id=?',(sid,));c.execute('DELETE FROM sessions WHERE id=?',(sid,));c.execute('DELETE FROM owners_v026 WHERE session_id=?',(sid,))
            return jsonify(deleted=True)
        finally:lock.release()
    @app.post('/sessions/<sid>/<kind>')
    def action(sid,kind):
        if kind not in ('messages','hint','end'):return fail('Not found.',404)
        body=request.get_json(silent=True);expected={'requestId','expectedRevision'}|({'text'} if kind=='messages' else set())
        if not isinstance(body,dict) or set(body)!=expected:return fail('Unexpected fields.',400)
        rid,rev=body['requestId'],body['expectedRevision']
        if not isinstance(rid,str) or not 1<=len(rid)<=80 or type(rev) is not int or rev<0:return fail('Invalid request ID or revision.',400)
        if kind=='messages' and (not isinstance(body['text'],str) or not 1<=len(body['text'].strip())<=500):return fail('Use 1-500 characters.',400)
        fingerprint=hashlib.sha256((kind+json.dumps(body,sort_keys=True)).encode()).hexdigest()
        if not lock.acquire(False):return fail('Busy; try later.',429)
        try:
            with db() as c:
                s=load(c,sid)
                if not s:return fail('Not found.',404)
                cached=c.execute('SELECT fingerprint,result FROM replies WHERE session_id=? AND request_id=?',(sid,rid)).fetchone()
                if cached:return jsonify(json.loads(cached['result'])) if cached['fingerprint']==fingerprint else fail('Request ID reused.',409)
                if s['revision']!=rev or s['status']!='active':return fail('Reload the conversation.',409)
            mission=s['missionSnapshot'];goal=pending(s)
            if kind=='hint':
                if not goal:return fail('No pending goal.',409)
                level=min(s['hints'].get(goal['id'],0)+1,3);s['hints'][goal['id']]=level
                result=dict(hint=dict(goalId=goal['id'],level=level,text=goal['hints'][level-1]))
            elif kind=='end':s['status']='ended_incomplete';result=dict(ended=True)
            elif mission.get('dialogueVersion')==2:
                text=body['text'].strip()
                with db() as c:
                    day=time.strftime('%Y-%m-%d',time.gmtime());minute=int(time.time())//60
                    def count(table,where,args):
                        row=c.execute('SELECT total FROM '+table+' WHERE '+where,args).fetchone();return row[0] if row else 0
                    if count('usage','day=?',(day,))>=daily_limit or count('minutes','minute=?',(minute,))>=5:return fail('Shared usage limit reached.',429)
                    if public and (count('account_usage_v026','subject=? AND day=?',(g.subject,day))>=10 or count('account_minutes_v026','subject=? AND minute=?',(g.subject,minute))>=3):return fail('Account usage limit reached.',429)
                    c.execute('INSERT INTO usage VALUES (?,1) ON CONFLICT(day) DO UPDATE SET total=total+1',(day,));c.execute('INSERT INTO minutes VALUES (?,1) ON CONFLICT(minute) DO UPDATE SET total=total+1',(minute,));c.execute('DELETE FROM minutes WHERE minute<?',(minute-10,))
                    if public:
                        c.execute('INSERT INTO account_usage_v026 VALUES (?,?,1) ON CONFLICT(subject,day) DO UPDATE SET total=total+1',(g.subject,day));c.execute('INSERT INTO account_minutes_v026 VALUES (?,?,1) ON CONFLICT(subject,minute) DO UPDATE SET total=total+1',(g.subject,minute));c.execute('DELETE FROM account_minutes_v026 WHERE minute<?',(minute-10,))
                try:
                    decision,usage=evaluator(text,s) if evaluator else evaluate(key_path,text,s,mission,{s['missionId']:mission})
                    s,attempt,bee=apply_decision(s,text,rid,decision)
                except (ProviderError,DialogueError) as error:return fail(error.kind if isinstance(error,ProviderError) else 'invalid_assessment',502)
                result=dict(assessment=attempt,beeMessage=bee,usage=usage)
            else:
                text=body['text'].strip();answer,answer_goal,pure=introduction_answer(text,goal) if s['missionId']=='introductions-midpoint' else ('',None,False)
                if not pure:
                    with db() as c:
                        day=time.strftime('%Y-%m-%d',time.gmtime());minute=int(time.time())//60
                        def count(table,where,args):
                            row=c.execute('SELECT total FROM '+table+' WHERE '+where,args).fetchone();return row[0] if row else 0
                        if count('usage','day=?',(day,))>=daily_limit or count('minutes','minute=?',(minute,))>=5:return fail('Shared usage limit reached.',429)
                        if public and (count('account_usage_v026','subject=? AND day=?',(g.subject,day))>=10 or count('account_minutes_v026','subject=? AND minute=?',(g.subject,minute))>=3):return fail('Account usage limit reached.',429)
                        c.execute('INSERT INTO usage VALUES (?,1) ON CONFLICT(day) DO UPDATE SET total=total+1',(day,));c.execute('INSERT INTO minutes VALUES (?,1) ON CONFLICT(minute) DO UPDATE SET total=total+1',(minute,));c.execute('DELETE FROM minutes WHERE minute<?',(minute-10,))
                        if public:
                            c.execute('INSERT INTO account_usage_v026 VALUES (?,?,1) ON CONFLICT(subject,day) DO UPDATE SET total=total+1',(g.subject,day));c.execute('INSERT INTO account_minutes_v026 VALUES (?,?,1) ON CONFLICT(subject,minute) DO UPDATE SET total=total+1',(g.subject,minute));c.execute('DELETE FROM account_minutes_v026 WHERE minute<?',(minute-10,))
                try:
                    if pure:a,usage=dict(status='help_request',ratings=dict.fromkeys(DIMS),evidence=[],feedback=''),{}
                    else:a,usage=evaluator(text,s) if evaluator else evaluate(key_path,text,s,mission,{s['missionId']:mission})
                    a=validate_assessment(a,text,mission)
                except (ProviderError,InvalidAssessment) as error:return fail(error.kind if isinstance(error,ProviderError) else 'invalid_assessment',502)
                score=round(10*sum(w*a['ratings'][d]/4 for d,w in zip(DIMS,WEIGHTS)),1) if a['status']=='scored' else None
                for evidence in a['evidence']:
                    gid=evidence['goalId']
                    if gid not in s['completed']:s['completed'][gid]=dict(mode='assisted' if s['hints'].get(gid,0)>=2 else 'independent',quote=evidence['quote'],messageId=rid)
                if answer_goal and answer_goal not in s['completed']:s['hints'][answer_goal]=3
                feedback='' if pure or a['status']=='scored' else dict(english_only='Try again in Tagalog. Need a hint?',help_request='Use the hint action when you want help; it starts with an explanation.',needs_clarification='I could not assess that confidently. Try again or request a hint.')[a['status']]
                attempt=dict(messageId=rid,status=a['status'],score=score,ratings=a['ratings'],feedback=feedback,assistance=dict(s['hints']),evidence=a['evidence']);s['attempts'].append(attempt);s['messages'].append(dict(role='learner',text=text,id=rid))
                if a['status'] in ('scored','english_only'):s['turns']+=1
                nxt=pending(s)
                if not nxt:s['status']='completed';bee=mission.get('closing','Salamat sa pagpapakilala! Tapos na ang usapan natin.')
                elif s['turns']>=10 or len(s['attempts'])>=20:s['status']='ended_incomplete';bee='Salamat sa pag-uusap! Maaari kang magsanay muli.'
                else:bee=nxt['prompt']
                if answer:bee=answer+' '+bee
                s['messages'].append(dict(role='bee',text=bee));result=dict(assessment=attempt,beeMessage=bee,usage=usage)
            s['revision']+=1;result['session']=view(s)
            with db() as c:
                c.execute('UPDATE sessions SET state=?,updated=? WHERE id=?',(json.dumps(s),int(time.time()),sid));c.execute('INSERT INTO replies VALUES (?,?,?,?)',(sid,rid,fingerprint,json.dumps(result)))
            return jsonify(result)
        finally:lock.release()
    return app
