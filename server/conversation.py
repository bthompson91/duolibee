"""v0.30.0 staged dialogue engine. Pure decision validation/state transitions; not yet activated."""
from copy import deepcopy
VERSION='0.30.0'
DIMS=('communication','grammar','vocabulary','naturalness')
WEIGHTS=(.4,.25,.2,.15)
class DialogueError(ValueError):pass

def response_schema(assessment_schema,mission):
    ids=[g['id'] for g in mission['goals']]
    return {'type':'object','additionalProperties':False,'required':['assessment','reply','taskRelevant','assistedGoalIds'],'properties':{'assessment':deepcopy(assessment_schema),'reply':{'type':'string','minLength':1,'maxLength':320},'taskRelevant':{'type':'boolean'},'assistedGoalIds':{'type':'array','maxItems':len(ids),'items':{'type':'string','enum':ids}}}}

def validate_decision(raw,text,mission):
    if not isinstance(raw,dict) or set(raw)!={'assessment','reply','taskRelevant','assistedGoalIds'}:raise DialogueError('dialogue fields')
    if type(raw['taskRelevant']) is not bool:raise DialogueError('relevance')
    if not isinstance(raw['reply'],str) or not 1<=len(raw['reply'].strip())<=320:raise DialogueError('reply')
    goals={g['id'] for g in mission['goals']};assisted=raw['assistedGoalIds']
    if not isinstance(assisted,list) or len(assisted)>len(goals) or any(not isinstance(g,str) or g not in goals for g in assisted) or len(set(assisted))!=len(assisted):raise DialogueError('assistance')
    a=raw['assessment']
    if not isinstance(a,dict) or set(a)!={'status','ratings','evidence','feedback'} or a['status'] not in ('scored','english_only','help_request','needs_clarification'):raise DialogueError('assessment fields')
    if not isinstance(a['ratings'],dict) or set(a['ratings'])!=set(DIMS):raise DialogueError('ratings')
    if a['status']=='scored':
        if not all(type(v) is int and 0<=v<=4 for v in a['ratings'].values()):raise DialogueError('rating range')
    elif any(v is not None for v in a['ratings'].values()):raise DialogueError('unscored ratings')
    if not isinstance(a['feedback'],str) or len(a['feedback'])>500 or not isinstance(a['evidence'],list) or len(a['evidence'])>len(goals):raise DialogueError('evidence')
    seen=set()
    for e in a['evidence']:
        if not isinstance(e,dict) or set(e)!={'goalId','quote'} or not isinstance(e['goalId'],str) or e['goalId'] not in goals or e['goalId'] in seen or not isinstance(e['quote'],str) or not e['quote'].strip() or e['quote'] not in text:raise DialogueError('learner evidence')
        seen.add(e['goalId'])
    if a['status']!='scored' and a['evidence']:raise DialogueError('unscored evidence')
    result=deepcopy(raw);result['reply']=result['reply'].strip()
    if not result['taskRelevant']:result['assessment']['evidence']=[]
    return result

def apply_decision(state,text,request_id,raw):
    mission=state['missionSnapshot']
    if mission.get('dialogueVersion')!=2 or state.get('status')!='active':raise DialogueError('incompatible session')
    d=validate_decision(raw,text,mission);s=deepcopy(state);a=d['assessment']
    score=round(10*sum(w*a['ratings'][dim]/4 for dim,w in zip(DIMS,WEIGHTS)),1) if a['status']=='scored' else None
    for e in a['evidence']:
        gid=e['goalId']
        if gid not in s['completed']:s['completed'][gid]={'mode':'assisted' if s['hints'].get(gid,0)>=2 else 'independent','quote':e['quote'],'messageId':request_id}
    for gid in d['assistedGoalIds']:
        if gid not in s['completed']:s['hints'][gid]=max(3,s['hints'].get(gid,0))
    status=a['status']
    if status=='scored' and not d['taskRelevant']:status='off_topic'
    elif status=='scored' and score<7:status='needs_practice'
    reaction='neutral' if not d['taskRelevant'] or score is None else 'positive' if score>=7 else 'support'
    attempt={'messageId':request_id,'status':status,'languageStatus':a['status'],'score':score,'languageScore':score,'ratings':a['ratings'],'feedback':'','taskRelevant':d['taskRelevant'],'reaction':reaction,'assistance':dict(s['hints']),'evidence':a['evidence']}
    s['attempts'].append(attempt);s['messages'].append({'role':'learner','text':text,'id':request_id})
    if a['status'] in ('scored','english_only'):s['turns']+=1
    pending=[g for g in mission['goals'] if g['id'] not in s['completed']]
    bee=d['reply']
    if not pending:
        s['status']='completed';closing=mission.get('closing','Salamat! Nice work!')
        if closing and not bee.endswith(closing):bee+=' '+closing
    elif s['turns']>=10 or len(s['attempts'])>=20:s['status']='ended_incomplete';bee+=' Let us pause here. You can practise again later.'
    s['messages'].append({'role':'bee','text':bee})
    return s,attempt,bee
