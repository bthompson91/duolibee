import sqlite3
from pathlib import Path
import unittest
import test_continuous_thread_http as base
class ThreadNotificationHTTPTests(unittest.TestCase):
    setUp=base.ContinuousThreadHTTPTests.setUp
    tearDown=base.ContinuousThreadHTTPTests.tearDown
    open=base.ContinuousThreadHTTPTests.open
    def test_poll_does_not_create_thread(self):
        r=self.client.get('/thread/notifications',headers=self.h)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.get_json(),{'unread':0,'lastEventId':0})
        with sqlite3.connect(Path(self.tmp.name)/'chat.sqlite3') as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],0)
    def test_unread_is_account_scoped_and_marks_cursor(self):
        self.open()
        r=self.client.get('/thread/notifications',headers=self.h).get_json()
        self.assertEqual(r['unread'],1)
        self.assertEqual(self.client.get('/thread/notifications?since='+str(r['lastEventId']),headers=self.h).get_json()['unread'],0)
        self.assertEqual(self.client.get('/thread/notifications',headers=self.h|{'Authorization':'Bearer bob'}).get_json()['unread'],0)
    def test_bad_cursor_and_unauthenticated_requests_rejected(self):
        for value in ('-1','bad',str(2**64)):
            self.assertEqual(self.client.get('/thread/notifications?since='+value,headers=self.h).status_code,400)
        self.assertEqual(self.client.get('/thread/notifications').status_code,401)
