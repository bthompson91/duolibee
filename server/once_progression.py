"""Continuous-chat progression: one accepted answer per distinct prompt."""
from copy import deepcopy
import json
from continuous_thread import BeeThreadStore, session_feedback


def prompt_key(mission):
    return ' '.join(mission.get('opening','').casefold().split())


def one_goal(mission):
    result=deepcopy(mission)
    goals=[g for g in result['goals'] if g['id']=='theme-response']
    if len(goals)!=1:
        raise ValueError('Expected one theme-response goal')
    result['goals']=goals
    result['onceAnswer']=True
    result['goals'][0]['description'] += (
        ' A single sufficient, relevant answer completes this prompt. '
        'Do not require a reciprocal question, extra detail or second answer. '
        'Accept beginner-level Taglish and reasonable synonyms. '
        'Credit theme-response with an exact quote of the current learner answer.'
    )
    return result


def next_unanswered(missions,current,answered):
    keys=list(missions)
    if not keys:return None
    start=keys.index(current) if current in keys else -1
    current_key=prompt_key(missions[current]) if current in missions else ''
    for offset in range(1,len(keys)+1):
        candidate=keys[(start+offset)%len(keys)]
        key=prompt_key(missions[candidate])
        if key and key!=current_key and key not in answered:
            return candidate
    return None


class OneAnswerStore(BeeThreadStore):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        with self.db() as c:
            c.executescript('CREATE TABLE IF NOT EXISTS bee_prompt_mastery(subject TEXT NOT NULL,prompt TEXT NOT NULL,PRIMARY KEY(subject,prompt));\n                CREATE TABLE IF NOT EXISTS bee_prompt_imported(subject TEXT PRIMARY KEY);')

    def answered(self,c,subject):
        return {r[0] for r in c.execute('SELECT prompt FROM bee_prompt_mastery WHERE subject=?',(subject,))}

    def credit(self,c,subject,mission):
        key=prompt_key(mission)
        if key:c.execute('INSERT OR IGNORE INTO bee_prompt_mastery VALUES (?,?)',(subject,key))

    def import_previous_credit(self,c,subject):
        if c.execute('SELECT 1 FROM bee_prompt_imported WHERE subject=?',(subject,)).fetchone():return
        missions=self.catalog()
        for row in c.execute('SELECT r.result FROM replies r JOIN owners_v026 o ON o.session_id=r.session_id WHERE o.subject=?',(subject,)):
            try:
                old=json.loads(row[0]).get('session',{})
                if old.get('completed',{}).get('theme-response') and old.get('missionId') in missions:
                    self.credit(c,subject,missions[old['missionId']])
            except (ValueError,TypeError,AttributeError):
                continue
        c.execute('INSERT INTO bee_prompt_imported VALUES (?)',(subject,))

    def new_state(self,*args,**kwargs):
        state=super().new_state(*args,**kwargs)
        state['missionSnapshot']=one_goal(state['missionSnapshot'])
        return state

    def ensure(self,c,subject,lesson,vocab):
        super().ensure(c,subject,lesson,vocab)
        self.prepare(c,subject)

    def prepare(self,c,subject):
        self.import_previous_credit(c,subject)
        row=self.row(c,subject)
        state=self.state(c,row)
        if state is None:return
        changed=False
        mission=state['missionSnapshot']
        if not mission.get('onceAnswer'):
            state['missionSnapshot']=one_goal(mission)
            state['completed']={k:v for k,v in state.get('completed',{}).items() if k=='theme-response'}
            state['revision']+=1;changed=True
        if state.get('completed',{}).get('theme-response'):
            self.credit(c,subject,state['missionSnapshot'])
            if state['status']=='active':state['status']='completed';changed=True
        elif state['status']=='active' and prompt_key(mission) in self.answered(c,subject):
            state['status']='skipped_mastered';changed=True
        if changed:self.save(c,state)

    def advance(self,c,subject):
        self.prepare(c,subject)
        state=self.sync(c,subject)
        if state['status']=='active':return
        row=self.row(c,subject)
        if state['status']=='completed':self.credit(c,subject,state['missionSnapshot'])
        if state['status'] in ('completed','ended_incomplete'):
            self.event(c,subject,f"episode:{row['episode']}:summary",dict(role='bee',text=session_feedback(state),kind='feedback'))
        mission_id=next_unanswered(self.catalog(),state['missionId'],self.answered(c,subject))
        if mission_id is None:
            self.event(c,subject,'all-new-prompts-covered',dict(role='bee',text="That's all the new prompts currently available. I'll keep your thread here and won't repeat answered questions automatically.",kind='notice'))
            if state['status']!='practice_complete':
                state['status']='practice_complete';state['revision']+=1;self.save(c,state)
            return
        recent=[json.loads(r[0]) for r in c.execute('SELECT payload FROM bee_thread_events WHERE subject=? ORDER BY id DESC LIMIT 8',(subject,)).fetchall()][::-1]
        new=self.new_state(state['id'],mission_id,row['vocab'],state['revision']+1,recent)
        self.save(c,new)
        c.execute('UPDATE bee_threads SET episode=episode+1,synced=0 WHERE subject=?',(subject,))
        self.sync(c,subject)

    def perform(self,subject,kind,body,invoke):
        with self.lock:
            with self.db() as c:self.prepare(c,subject)
            return super().perform(subject,kind,body,invoke)

    def delete(self,subject):
        super().delete(subject)
        with self.db() as c:
            c.execute('DELETE FROM bee_prompt_mastery WHERE subject=?',(subject,))
            c.execute('INSERT OR IGNORE INTO bee_prompt_imported VALUES (?)',(subject,))
