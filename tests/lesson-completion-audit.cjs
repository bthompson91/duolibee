// All-lessons completion audit + Lesson 44 stuck-exit regression test.
// Loads the repo's scripts in index.html order in a vm with DOM stubs,
// boots with the real data/lessons.json, and plays EVERY lesson (1-100) to
// completion: one graded question answered wrong per lesson (to exercise
// the retry path) and every speak question swapped to a written question
// (the fallback path). Asserts each lesson reaches the Session Complete
// screen with every question mastered.
//
// Also covers the Lesson 44 bug (2026-11-22): Brendan was stuck on the
// final choice question ("What does 'taksi' mean?") with the status line
// at 11/12 while the header read 12/12, and Continue would not finish the
// lesson. Root cause: the finishing guard in lesson-retries.js refused to
// complete whenever _mastered was short by one, and a correct answer that
// was not credited leaves no retry behind (retries only cover wrong
// answers), so the lesson was permanently stuck. The guard now credits
// any missing origin when the user has answered every exercise, so the
// lesson always finishes. A second, related defect is also covered: a
// recording started on one speak question could apply its transcription
// (or its empty-transcription swap) to the NEXT speak question if the
// learner swapped and advanced while it was in flight (Lesson 44 has
// adjacent speak pairs). finishRecording now ignores a stale recording.
//
// Run from the repo root: node tests/lesson-completion-audit.cjs
// Exits non-zero when any lesson fails to complete.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const REPO = process.env.REPO || path.join(__dirname, '..');
const lessonsData = JSON.parse(fs.readFileSync(path.join(REPO, 'data/lessons.json'), 'utf8'));

class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.id = '';
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.onclick = null;
    this.classList = {
      add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false,
    };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  append(...xs) { this.children.push(...xs); return xs[0]; }
  appendChild(x) { this.children.push(x); return x; }
  prepend(...xs) { this.children.unshift(...xs); return xs[0]; }
  replaceChildren(...xs) { this.children = xs; }
  querySelector() { return new El('div'); }
  querySelectorAll() { return []; }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  getAttribute() { return null; }
  remove() {}
  focus() {}
}

const byId = new Map();
function getEl(id) {
  if (!byId.has(id)) { const e = new El('div'); e.id = id; byId.set(id, e); }
  return byId.get(id);
}
const appEl = new El('main'); appEl.id = 'app';
const bodyEl = new El('body');

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  URL, URLSearchParams, Blob,
  Math, JSON, Object, Array, Promise, Error, RegExp, Date,
  document: {
    getElementById: (id) => (id === 'app' ? appEl : getEl(id)),
    createElement: (tag) => new El(tag),
    querySelector: () => new El('div'),
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: bodyEl,
    documentElement: { dataset: {} },
    head: new El('head'),
  },
  window: null,
  localStorage: {
    _s: {},
    getItem(k) { return this._s[k] ?? null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
  location: { href: 'https://bthompson91.github.io/duolibee/', origin: 'https://bthompson91.github.io' },
  navigator: { onLine: true },
  speechSynthesis: undefined,
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined,
  MutationObserver: class { observe() {} disconnect() {} },
  crypto: { randomUUID: () => 'test-uuid-1' },
  alert: () => {},
  confirm: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
  scroll: () => {},
  fetch: async (url) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('lessons.json')) return { ok: true, status: 200, json: async () => lessonsData };
    return { ok: false, status: 404, json: async () => ({}) };
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const order = [
  'pronunciation.js', 'app.js', 'classic-rhymes.js', 'speech-routing.js',
  'learning-flow.js', 'category-generator.js', 'lesson-progression.js',
  'sentence-builder.js', 'answer-speech.js', 'global-mute.js',
  'release-notes.js', 'mascots.js', 'review-core.js', 'daily-crossword.js',
  'daily-progress.js', 'lesson-retries.js', 'cloud-save.js', 'translation.js',
  'review-conversations.js', 'lesson-numbering.js', 'webpage-update.js',
  'chat-notifications.js', 'speaking.js', 'characters.js', 'whisper.js',
];
for (const f of order) {
  try {
    vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), sandbox, { filename: f });
  } catch (e) {
    console.log('LOAD FAILED (continuing):', f, '-', e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (code) => vm.runInContext(code, sandbox);
const snap = () => JSON.parse(V(`(function () {
  const ex = session && session.exercises[index];
  return JSON.stringify({
    index, len: session.exercises.length,
    type: ex && ex.type,
    origin: ex && ('_origin' in ex ? ex._origin : null),
    retry: ex && !!ex._retry,
    mastered: Object.keys(session._mastered || {}),
    qc: session._questionCount, settled: session._settledIndex,
    done: app.innerHTML.includes('Session complete')
  });
})()`));

// Answer the current exercise. `wrong` answers it incorrectly once.
// Speak questions are swapped to a written question first (the fallback
// path), then answered. Returns a short description of what happened.
function answerCurrent(wrong) {
  const s = snap();
  if (s.done) return 'done';
  const ex = JSON.parse(V(`(function () { const e = session.exercises[index]; return JSON.stringify({ type: e.type, answer: e.answer, options: e.options || null, item: e.item ? e.item.t : null, itemE: e.item ? e.item.e : null }); })()`));
  if (ex.type === 'learn') { V('next()'); return 'learn'; }
  if (ex.type === 'speak') {
    // Swap to a written question (fallback) and answer that instead.
    V('replaceSpeakWithChoice()');
    return 'speak swapped; ' + answerCurrent(wrong);
  }
  if (ex.type === 'choice') {
    const a = wrong ? (ex.answer + 1) % ex.options.length : ex.answer;
    V(`answerChoice(${a})`);
    V('next()');
    return 'choice' + (wrong ? ' WRONG' : ' ok');
  }
  if (ex.type === 'translate') {
    V(`document.getElementById('answer').value = ${JSON.stringify(wrong ? 'maling sagot' : ex.item)}; answerTranslate();`);
    V('next()');
    return 'translate' + (wrong ? ' WRONG' : ' ok');
  }
  if (ex.type === 'reverse') {
    V(`document.getElementById('answer').value = ${JSON.stringify(wrong ? 'maling sagot' : ex.itemE.split('/')[0].trim())}; answerReverse();`);
    V('next()');
    return 'reverse' + (wrong ? ' WRONG' : ' ok');
  }
  if (ex.type === 'match') {
    if (wrong) {
      // One wrong pair: pick a mismatched pair, which settles the question
      // as wrong and queues a retry.
      V(`(function () { const ex = session.exercises[index]; const t = ex.pairs[0].t, e = ex.pairs[1].e; pickMatch('L', session.mL.indexOf(t)); pickMatch('R', session.mR.indexOf(e)); })()`);
      V('next()');
      return 'match WRONG';
    }
    V(`(function () { const ex = session.exercises[index]; for (let i = 0; i < ex.pairs.length; i++) { const t = ex.pairs[i].t, e = ex.pairs[i].e; pickMatch('L', session.mL.indexOf(t)); pickMatch('R', session.mR.indexOf(e)); } })()`);
    V('next()');
    return 'match ok';
  }
  if (ex.type === 'build') {
    V(`(function () { const ex = session.exercises[index]; const words = ex.answer.split(' '); const used = new Set(); session.built = words.map((w) => { const j = session.bank.findIndex((b, k) => b === w && !used.has(k)); used.add(j); return j; }); ${wrong ? 'session.built.reverse();' : ''} checkBuild(); })()`);
    V('next()');
    return 'build' + (wrong ? ' WRONG' : ' ok');
  }
  if (ex.type === 'audio') {
    const a = wrong ? (ex.options.indexOf(ex.itemE) + 1) % ex.options.length : ex.options.indexOf(ex.itemE);
    V(`answerAudio(${a})`);
    V('next()');
    return 'audio' + (wrong ? ' WRONG' : ' ok');
  }
  throw new Error('unknown exercise type: ' + ex.type);
}

// Play one lesson to completion. The first graded question is answered
// wrong (to exercise the retry path); everything else is answered right.
// Returns { completed, mastered, qcount }.
function playLesson(id) {
  // Fresh DOM stubs per lesson: in a real browser renderExercise recreates
  // every button via innerHTML, but the stub getElementById cache would
  // otherwise carry `disabled` state (e.g. matched pairs) into the next
  // lesson and make pickMatch return early.
  byId.clear();
  V(`for (let i = 1; i < ${id}; i++) state.completed[i] = { last: Date.now() };`);
  V(`startLesson(${id})`);
  let steps = 0;
  let wrongUsed = false;
  while (steps++ < 80) {
    const s = snap();
    if (s.done) {
      return { completed: true, mastered: s.mastered.length, qcount: s.qc, steps: steps - 1 };
    }
    const isFirstGraded = !wrongUsed && s.type !== 'learn';
    const r = answerCurrent(isFirstGraded);
    if (isFirstGraded) wrongUsed = true;
    if (r === 'done') break;
  }
  const s = snap();
  return { completed: s.done, mastered: s.mastered.length, qcount: s.qc, steps, final: s };
}

(async () => {
  for (let i = 0; i < 20 && !V('typeof LESSONS !== "undefined" && LESSONS.length'); i++) await sleep(25);

  // ---- 1. All 100 lessons must complete. ----
  const failures = [];
  for (let id = 1; id <= 100; id++) {
    const res = playLesson(id);
    if (!res.completed || res.mastered !== res.qcount) {
      failures.push({ id, ...res });
      console.log(`lesson ${id}: FAILED completed=${res.completed} mastered=${res.mastered}/${res.qcount} steps=${res.steps} final=${JSON.stringify(res.final)}`);
    }
  }
  console.log(`audit: ${100 - failures.length}/100 lessons completed with all questions mastered`);
  assert.strictEqual(failures.length, 0, `${failures.length} lesson(s) did not complete: ${JSON.stringify(failures.map((f) => f.id))}`);

  // ---- 2. Lesson 44 safety net: a missed credit must not trap the user. ----
  // Answer everything right, but drop one mastered entry just before the
  // last question (simulating the missed credit). The lesson must still
  // finish, with all questions mastered.
  byId.clear();
  V('for (let i = 1; i < 44; i++) state.completed[i] = { last: Date.now() };');
  V('startLesson(44)');
  let steps = 0;
  let dropped = false;
  while (steps++ < 40) {
    const s = snap();
    if (s.done) break;
    if (s.origin === 12 && !s.retry && !dropped) {
      dropped = true;
      V('delete session._mastered[7]');
    }
    answerCurrent(false);
  }
  const s44 = snap();
  console.log('lesson 44 safety net: completed=' + s44.done + ' mastered=' + s44.mastered.length + '/' + s44.qc + ' keys=' + JSON.stringify(s44.mastered));
  assert.strictEqual(s44.done, true, 'Lesson 44 must complete even when a mastered entry is missing (safety net)');
  assert.strictEqual(s44.mastered.length, s44.qc, 'Lesson 44 must end with all questions mastered');

  // ---- 3. Stale recorder: a recording from one speak question must not
  // land on the next speak question. ----
  V(`
    window.MediaRecorder = class {
      constructor(stream) { this.stream = stream; this.mimeType = 'audio/mp4'; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; const self = this; setTimeout(() => { if (self.ondataavailable) self.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/mp4' }) }); if (self.onstop) self.onstop(); }, 0); }
    };
    navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) };
    state.settings.whisper = false;
  `);
  const fetchBefore = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) return { ok: true, status: 200, json: async () => ({ transcript: 'Magkano ang tiket sa bangka?' }) };
    return fetchBefore(url, options);
  };
  V('for (let i = 1; i < 44; i++) state.completed[i] = { last: Date.now() };');
  byId.clear();
  V('startLesson(44)');
  // Advance to the first speak question (idx 4), answering the earlier ones.
  while (V('index') < 4) answerCurrent(false);
  assert.strictEqual(snap().type, 'speak', 'expected a speak question at idx 4');
  assert.strictEqual(snap().origin, 4, 'expected origin 4 at idx 4');
  V('startSpeaking()');
  await sleep(50);
  // Swap idx 4 to written while the recording is in flight, answer it, advance to idx 5.
  V('replaceSpeakWithChoice()');
  assert.strictEqual(V('session.exercises[4].type'), 'translate', 'idx 4 should be a written question after the swap');
  answerCurrent(false);
  assert.strictEqual(V('index'), 5, 'expected to be at idx 5 after answering idx 4');
  assert.strictEqual(snap().type, 'speak', 'idx 5 should still be a speak question');
  // Let the stale recording finish; its transcription is for idx 4's phrase.
  V('window.duolibeeSpeaking.stopRecording()');
  await sleep(200);
  const after = snap();
  console.log('stale recorder: idx5 type=' + after.type + ' speakHeard=' + JSON.stringify(V('session.speakHeard')));
  assert.strictEqual(after.type, 'speak', 'the stale recording must not swap idx 5 to a written question');
  assert.strictEqual(V('session.speakHeard'), '', 'the stale recording must not set speakHeard on idx 5');
  sandbox.fetch = fetchBefore;

  console.log('lesson-completion-audit: PASS (100/100 lessons, Lesson 44 safety net, stale recorder)');
  process.exit(0);
})().catch((e) => { console.error('AUDIT FAIL', e); process.exit(1); });
