"""One durable, account-owned Bee transcript over bounded lesson exchanges."""
from contextlib import contextmanager
from pathlib import Path
import hashlib
import json
import sqlite3
import threading
import time
import uuid


def session_feedback(state):
    attempts = [a for a in state.get('attempts', [])
                if a.get('score') is not None and a.get('taskRelevant', True)]
    complete = state.get('status') == 'completed'
    parts = ["Nice work finishing that practice!" if complete else "Let's pause that practice here."]
    if not attempts:
        parts.append("I don't have enough assessed Tagalog to judge your language yet. Try a short Tagalog answer next time; Taglish is okay.")
    else:
        averages = {}
        for dimension in ('communication', 'grammar', 'vocabulary', 'naturalness'):
            values = [a.get('ratings', {}).get(dimension) for a in attempts]
            values = [v for v in values if type(v) is int]
            if values:
                averages[dimension] = sum(values) / len(values)
        score = sum(a['score'] for a in attempts) / len(attempts)
        parts.append("Your Tagalog was mostly clear in this exchange." if score >= 7 else "You made a start with Tagalog, and there's still room to practise.")
        if averages:
            lowest = min(averages, key=averages.get)
            if averages[lowest] < 3:
                parts.append({
                    'communication': 'Next time, focus on answering the question directly with a short reply.',
                    'grammar': 'Next time, practise word order in a short sentence.',
                    'vocabulary': 'Next time, try using a familiar Tagalog word in your answer.',
                    'naturalness': 'Next time, practise a short, everyday way of saying your answer.'
                }[lowest])
        parts.append('These are AI estimates, not a formal language test.')
    assisted = any(v >= 2 for v in state.get('hints', {}).values()) or any(
        g.get('mode') == 'assisted' for g in state.get('completed', {}).values())
    if assisted:
        parts.append('You used a starter or example; try a similar reply without that help next time.')
    elif attempts:
        parts.append('You did not use a starter or example from the hint button.')
    return ' '.join(parts)


class ThreadConflict(ValueError):
    pass


class BeeThreadStore:
    def __init__(self, path, catalog, vocabulary):
        self.path = Path(path)
        self.catalog = catalog
        self.vocabulary = vocabulary
        self.lock = threading.RLock()
        with self.db() as c:
            c.executescript("""
                CREATE TABLE IF NOT EXISTS bee_threads(
                    subject TEXT PRIMARY KEY,sid TEXT,episode INTEGER NOT NULL,
                    synced INTEGER NOT NULL,vocab INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS bee_thread_events(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT NOT NULL,
                    event_key TEXT NOT NULL,payload TEXT NOT NULL,
                    UNIQUE(subject,event_key));
                CREATE INDEX IF NOT EXISTS bee_thread_events_owner
                    ON bee_thread_events(subject,id);
                CREATE TABLE IF NOT EXISTS bee_thread_requests(
                    subject TEXT NOT NULL,rid TEXT NOT NULL,fingerprint TEXT NOT NULL,
                    sid TEXT NOT NULL,episode INTEGER NOT NULL,result TEXT,
                    PRIMARY KEY(subject,rid));
            """)

    @contextmanager
    def db(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            with c:
                yield c
        finally:
            c.close()

    def event(self, c, subject, key, payload):
        c.execute('INSERT OR IGNORE INTO bee_thread_events(subject,event_key,payload) VALUES (?,?,?)',
                  (subject, key, json.dumps(payload)))

    def row(self, c, subject):
        return c.execute('SELECT * FROM bee_threads WHERE subject=?', (subject,)).fetchone()

    def state(self, c, row):
        if not row or not row['sid']:
            return None
        found = c.execute('SELECT state FROM sessions WHERE id=?', (row['sid'],)).fetchone()
        return json.loads(found[0]) if found else None

    def new_state(self, sid, mission_id, vocab, revision=0, recent=None):
        missions = self.catalog()
        if mission_id not in missions:
            raise ValueError('Unknown mission')
        m = missions[mission_id]
        return dict(id=sid, revision=revision, status='active', turns=0,
                    missionId=mission_id, numberingVersion='display-v2',
                    missionSnapshot=m, vocabularySnapshot=self.vocabulary(missions, vocab),
                    vocabularyThroughLesson=vocab, completed={}, hints={},
                    messages=[dict(role='bee', text=m['opening'])], attempts=[],
                    threadRecent=recent or [])

    def save(self, c, state):
        c.execute('INSERT INTO sessions(id,state,updated) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated=excluded.updated',
                  (state['id'], json.dumps(state), int(time.time())))

    def ensure(self, c, subject, lesson, vocab):
        row = self.row(c, subject)
        if row and self.state(c, row):
            c.execute('UPDATE bee_threads SET vocab=MAX(vocab,?) WHERE subject=?', (vocab,subject))
            return
        if row is None:
            old = c.execute('SELECT s.id,s.state FROM sessions s JOIN owners_v026 o ON o.session_id=s.id WHERE o.subject=? ORDER BY s.updated,s.rowid', (subject,)).fetchall()
            for item in old:
                state = json.loads(item['state'])
                for i, message in enumerate(state.get('messages', [])):
                    self.event(c, subject, f"import:{item['id']}:{i}", message)
                if state.get('status') != 'active':
                    self.event(c, subject, f"import:{item['id']}:summary", dict(role='bee',text=session_feedback(state),kind='feedback'))
            c.execute('INSERT INTO bee_threads VALUES (?,NULL,0,0,?)', (subject,vocab))
        sid = str(uuid.uuid4())
        state = self.new_state(sid, f'lesson-{lesson:03d}', vocab)
        self.save(c,state)
        c.execute('INSERT INTO owners_v026 VALUES (?,?)',(sid,subject))
        c.execute('UPDATE bee_threads SET sid=?,episode=episode+1,synced=0,vocab=? WHERE subject=?',(sid,vocab,subject))

    def sync(self, c, subject):
        row=self.row(c,subject)
        state=self.state(c,row)
        if state is None:
            raise ThreadConflict('Reopen Chat to reconnect your thread.')
        for i, message in enumerate(state['messages'][row['synced']:],row['synced']):
            self.event(c,subject,f"episode:{row['episode']}:message:{i}",message)
        c.execute('UPDATE bee_threads SET synced=? WHERE subject=?',(len(state['messages']),subject))
        return state

    def advance(self,c,subject):
        state=self.sync(c,subject)
        if state['status']=='active':
            return
        row=self.row(c,subject)
        self.event(c,subject,f"episode:{row['episode']}:summary",dict(role='bee',text=session_feedback(state),kind='feedback'))
        n=int(state['missionId'].split('-')[-1]) if state['missionId'].startswith('lesson-') else 1
        next_lesson=n % 100 + 1
        recent=[json.loads(r[0]) for r in c.execute('SELECT payload FROM bee_thread_events WHERE subject=? ORDER BY id DESC LIMIT 8',(subject,)).fetchall()][::-1]
        new=self.new_state(state['id'],f'lesson-{next_lesson:03d}',row['vocab'],state['revision']+1,recent)
        self.save(c,new)
        c.execute('UPDATE bee_threads SET episode=episode+1,synced=0 WHERE subject=?',(subject,))
        self.sync(c,subject)

    def snapshot(self,c,subject,before=None):
        row=self.row(c,subject)
        state=self.state(c,row)
        if state is None:
            raise ThreadConflict('Reopen Chat to reconnect your thread.')
        sql='SELECT id,payload FROM bee_thread_events WHERE subject=?'
        args=[subject]
        if before is not None:
            sql+=' AND id<?';args.append(before)
        rows=c.execute(sql+' ORDER BY id DESC LIMIT 101',args).fetchall()
        more=len(rows)>100;rows=rows[:100][::-1]
        return dict(messages=[dict(json.loads(r['payload']),eventId=r['id']) for r in rows],
                    hasOlder=more,revision=state['revision'],status=state['status'],
                    pendingGoalId=next((g['id'] for g in state['missionSnapshot']['goals'] if g['id'] not in state['completed']),None),
                    hintLevels=state['hints'],lesson=state['missionSnapshot'].get('lesson'),
                    threadVersion=1)

    def open(self,subject,lesson,vocab):
        with self.lock,self.db() as c:
            self.ensure(c,subject,lesson,vocab)
            self.advance(c,subject)
            return self.snapshot(c,subject)

    def notifications(self,subject,since=0):
        if type(since) is not int or not 0<=since<=9223372036854775807:
            raise ValueError('Invalid notification cursor')
        with self.db() as c:
            unread=sum(json.loads(r['payload']).get('role')=='bee' for r in c.execute('SELECT payload FROM bee_thread_events WHERE subject=? AND id>?',(subject,since)))
            latest=c.execute('SELECT COALESCE(MAX(id),0) FROM bee_thread_events WHERE subject=?',(subject,)).fetchone()[0]
            return dict(unread=unread,lastEventId=latest)

    def history(self,subject,before):
        with self.lock,self.db() as c:
            return self.snapshot(c,subject,before)

    def perform(self,subject,kind,body,invoke):
        encoded=json.dumps([kind,body],sort_keys=True)
        fingerprint=hashlib.sha256(encoded.encode()).hexdigest()
        rid=body['requestId']
        with self.lock:
            with self.db() as c:
                row=self.row(c,subject)
                if self.state(c,row) is None:
                    raise ThreadConflict('Reopen Chat to reconnect your thread.')
                record=c.execute('SELECT * FROM bee_thread_requests WHERE subject=? AND rid=?',(subject,rid)).fetchone()
                if record:
                    if record['fingerprint']!=fingerprint:
                        raise ThreadConflict('Request ID reused with different content.')
                    if record['result']:
                        return json.loads(record['result']),200
                    sid,episode=record['sid'],record['episode']
                else:
                    sid,episode=row['sid'],row['episode']
                    c.execute('INSERT INTO bee_thread_requests VALUES (?,?,?,?,?,NULL)',(subject,rid,fingerprint,sid,episode))
            data,status=invoke(sid,kind,body)
            if status!=200:
                return data,status
            with self.db() as c:
                row=self.row(c,subject)
                if row['episode']==episode:
                    if data.get('hint'):
                        self.event(c,subject,'hint:'+rid,dict(role='bee',text=data['hint']['text'],kind='hint'))
                    self.advance(c,subject)
                result=self.snapshot(c,subject)
                c.execute('UPDATE bee_thread_requests SET result=? WHERE subject=? AND rid=?',(json.dumps(result),subject,rid))
                return result,200

    def delete(self,subject):
        with self.lock,self.db() as c:
            row=self.row(c,subject)
            if row and row['sid']:
                sid=row['sid']
                c.execute('DELETE FROM replies WHERE session_id=?',(sid,))
                c.execute('DELETE FROM owners_v026 WHERE session_id=?',(sid,))
                c.execute('DELETE FROM sessions WHERE id=?',(sid,))
            c.execute('DELETE FROM bee_thread_events WHERE subject=?',(subject,))
            c.execute('DELETE FROM bee_thread_requests WHERE subject=?',(subject,))
            # Preserve the marker so old legacy sessions are not re-imported.
            c.execute('INSERT INTO bee_threads VALUES (?,NULL,0,0,0) ON CONFLICT(subject) DO UPDATE SET sid=NULL,synced=0',(subject,))


def register_thread_routes(app,db_path,catalog,vocabulary,public):
    from flask import g,jsonify,request
    store=BeeThreadStore(db_path,catalog,vocabulary)
    owner=lambda:g.subject if public else 'private-local'
    def invoke(sid,kind,body):
        response=app.make_response(app.view_functions['action'](sid,kind))
        return response.get_json(),response.status_code

    @app.post('/thread/open')
    def thread_open():
        body=request.get_json(silent=True)
        if not isinstance(body,dict) or set(body)!={'lesson','vocabularyThroughLesson'}:
            return jsonify(error='Invalid thread fields.'),400
        lesson,vocab=body['lesson'],body['vocabularyThroughLesson']
        if type(lesson) is not int or not 1<=lesson<=100 or type(vocab) is not int or not 0<=vocab<=100:
            return jsonify(error='Invalid lesson or vocabulary scope.'),400
        try:
            return jsonify(store.open(owner(),lesson,vocab))
        except ThreadConflict as error:
            return jsonify(error=str(error)),409
        except (ValueError,KeyError,OSError):
            return jsonify(error='Mission catalog unavailable.'),503

    @app.get('/thread/notifications')
    def thread_notifications():
        try:
            since=int(request.args.get('since','0'))
            return jsonify(store.notifications(owner(),since))
        except (ValueError,OverflowError):
            return jsonify(error='Invalid notification cursor.'),400

    @app.get('/thread/history')
    def thread_history():
        try:
            before=int(request.args['before'])
            if before<1:raise ValueError()
        except (ValueError,KeyError):
            return jsonify(error='Invalid history cursor.'),400
        try:return jsonify(store.history(owner(),before))
        except ThreadConflict as error:return jsonify(error=str(error)),409

    @app.post('/thread/<kind>')
    def thread_action(kind):
        if kind not in ('messages','hint','end'):
            return jsonify(error='Not found.'),404
        body=request.get_json(silent=True)
        fields={'requestId','expectedRevision'}|({'text'} if kind=='messages' else set())
        if not isinstance(body,dict) or set(body)!=fields:
            return jsonify(error='Unexpected fields.'),400
        if not isinstance(body['requestId'],str) or not 1<=len(body['requestId'])<=80 or type(body['expectedRevision']) is not int or body['expectedRevision']<0:
            return jsonify(error='Invalid request ID or revision.'),400
        if kind=='messages' and (not isinstance(body['text'],str) or not 1<=len(body['text'].strip())<=500):
            return jsonify(error='Use 1-500 characters.'),400
        try:
            data,status=store.perform(owner(),kind,body,invoke)
            return jsonify(data),status
        except ThreadConflict as error:
            return jsonify(error=str(error)),409
        except (ValueError,KeyError,OSError):
            return jsonify(error='Mission catalog unavailable.'),503

    @app.delete('/thread')
    def thread_delete():
        store.delete(owner())
        return jsonify(deleted=True)
