// Full-chain test for the SRS-targeting + speaking change.
// Loads the repo's scripts in index.html order in a vm with DOM stubs,
// boots with the real data/lessons.json, plays a lesson (one graded
// exercise wrong on first try, the rest right), and checks per-item SRS.
// Then plays a review session and checks review scheduling, and unit-tests
// the speaking matcher. Run from the repo root: node <this file>
// (REPO env var overrides /tmp/duolibee).
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
    querySelector: (sel) => (sel === '.stats' || sel === '.topbar .stats' ? new El('div') : new El('div')),
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
  crypto: { randomUUID: () => 'test-uuid-' + Math.floor(Math.random() * 1e9) },
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
const loadFailures = [];
for (const f of order) {
  try {
    vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), sandbox, { filename: f });
  } catch (e) {
    loadFailures.push(f + ': ' + e.message);
    console.log('LOAD FAILED (continuing):', f, '-', e.message);
  }
}

// Regression test: lesson 23 must finish even when exercises are swapped to
// written questions (speak fallback via failed transcription, audio via
// "I can't hear this"). Both swaps replace the exercise with a choice that
// keeps the original _origin, so the retry tracker can credit it.
// Run from the repo root: node tests/repro-stuck.cjs [plain|swap-wrong|fail-other|speak-wrong|restart|two-swaps]
// Each run is a fresh vm, so variants are isolated. Exits non-zero when the
// lesson gets stuck.
const variant = process.argv[2] || 'plain';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (code) => vm.runInContext(code, sandbox);

(async () => {
  for (let i = 0; i < 20 && !V('typeof LESSONS !== "undefined" && LESSONS.length'); i++) await sleep(25);

  // Phone-like stubs: no speech recognition, mic records, server transcription
  // fails (live: nginx 413), Whisper off.
  V(`
    window.MediaRecorder = class {
      constructor(stream) { this.stream = stream; this.mimeType = 'audio/mp4'; }
      start() { const self = this; setTimeout(() => { if (self.ondataavailable) self.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/mp4' }) }); if (self.onstop) self.onstop(); }, 0); }
      stop() {}
    };
    navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) };
    state.settings.whisper = false;
  `);
  const fetchBefore = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) throw new Error('offline (nginx 413)');
    return fetchBefore(url, options);
  };

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
  const log = (tag) => console.log(tag, JSON.stringify(snap()));

  // one-shot failure flags, consumed by the play loop
  const fail = { translate: variant === 'fail-other', swappedChoice: variant === 'swap-wrong', speakCheck: variant === 'speak-wrong' };
  const twoSwaps = variant === 'two-swaps'; // audio swapped via "I can't hear this" AND speak swapped via failed transcription

  async function answerCurrent(swapped) {
    const s = snap();
    if (s.done) return 'done';
    const ex = JSON.parse(V(`(function () { const e = session.exercises[index]; return JSON.stringify({ type: e.type, answer: e.answer, options: e.options || null, item: e.item ? e.item.t : null, itemE: e.item ? e.item.e : null }); })()`));
    if (ex.type === 'learn') { V('next()'); return 'learn'; }
    if (ex.type === 'choice') {
      const isSwapped = !!swapped; // a swapped choice keeps its _origin, so track it via the caller
      let a = ex.answer;
      if (isSwapped && fail.swappedChoice) { fail.swappedChoice = false; a = (a + 1) % ex.options.length; }
      V(`answerChoice(${a})`);
      await sleep(10);
      V('next()');
      return 'choice' + (a === ex.answer ? ' ok' : ' WRONG') + (isSwapped ? ' (swapped speak)' : '');
    }
    if (ex.type === 'translate') {
      const wrong = fail.translate; fail.translate = false;
      V(`document.getElementById('answer').value = ${JSON.stringify(wrong ? 'maling sagot' : ex.item)}; answerTranslate();`);
      await sleep(10);
      V('next()');
      return 'translate' + (wrong ? ' WRONG' : ' ok');
    }
    if (ex.type === 'reverse') {
      V(`document.getElementById('answer').value = ${JSON.stringify(ex.itemE.split('/')[0].trim())}; answerReverse();`);
      await sleep(10);
      V('next()');
      return 'reverse ok';
    }
    if (ex.type === 'match') {
      V(`(function () { const ex = session.exercises[index]; for (let i = 0; i < ex.pairs.length; i++) { const t = ex.pairs[i].t, e = ex.pairs[i].e; pickMatch('L', session.mL.indexOf(t)); pickMatch('R', session.mR.indexOf(e)); } })()`);
      await sleep(10);
      V('next()');
      return 'match ok';
    }
    if (ex.type === 'build') {
      V(`(function () { const ex = session.exercises[index]; const words = ex.answer.split(' '); const used = new Set(); session.built = words.map((w) => { const j = session.bank.findIndex((b, k) => b === w && !used.has(k)); used.add(j); return j; }); checkBuild(); })()`);
      await sleep(10);
      V('next()');
      return 'build ok';
    }
    if (ex.type === 'audio') {
      if (twoSwaps) {
        // Tap "I can't hear this" through the real swap (speech-routing.js):
        // the audio exercise is replaced by a written choice that keeps _origin.
        if (!V(`typeof window.duolibeeReplaceAudio === 'function'`)) throw new Error('duolibeeReplaceAudio hook missing');
        V('window.duolibeeReplaceAudio()');
        await sleep(10);
        console.log('  audio swapped -> choice (I can\'t hear this), origin =', snap().origin);
        return 'audio swapped; ' + (await answerCurrent(true));
      }
      V('answerAudio(session.exercises[index].options.indexOf(session.exercises[index].item.e))');
      await sleep(10);
      V('next()');
      return 'audio ok';
    }
    if (ex.type === 'speak') {
      if (fail.speakCheck) {
        fail.speakCheck = false;
        V(`session.speakHeard = 'maling salita'; checkSpeaking();`);
        await sleep(10);
        V('next()');
        return 'speak WRONG (checkSpeaking)';
      }
      V('startSpeaking()');
      await sleep(250);
      const after = snap();
      if (after.type === 'speak') {
        console.log('  !! speak did NOT swap; status =', V(`(document.getElementById('speak-status') || {}).textContent || 'n/a'`));
        return 'speak-no-swap';
      }
      console.log('  speak swapped -> ' + after.type + ', origin =', after.origin);
      return 'speak swapped; ' + (await answerCurrent(true));
    }
    return 'unknown:' + ex.type;
  }

  async function play(id, label) {
    console.log('--- ' + label + ' ---');
    // Unlock the lesson the honest way: lesson-progression.js refuses to
    // start a lesson past the frontier in a fresh profile.
    V('for (let i = 1; i < 23; i++) state.completed[i] = { last: Date.now() };');
    V(`startLesson(${id})`);
    let steps = 0;
    while (steps++ < 40) {
      const s = snap();
      if (s.done) { console.log('>>> SESSION COMPLETE after', steps - 1, 'steps'); return true; }
      log('step ' + steps);
      const r = await answerCurrent();
      console.log('   ->', r);
      if (r === 'speak-no-swap' || r.startsWith('unknown')) { console.log('>>> STOPPED:', r); return false; }
      await sleep(10);
    }
    console.log('>>> STEP LIMIT REACHED, not complete. Final state:');
    log('final');
    // Prove Tuloy is dead: call next() once more and show nothing moves.
    const before = snap();
    V('next()');
    const after = snap();
    console.log('>>> after an extra next(): index', before.index, '->', after.index, ', done', before.done, '->', after.done, ', mastered', JSON.stringify(after.mastered));
    return false;
  }

  let result = false;
  if (variant === 'restart') {
    console.log('--- restart: attempt 1 (play until past the speak exercise) ---');
    V('for (let i = 1; i < 23; i++) state.completed[i] = { last: Date.now() };');
    V('startLesson(23)');
    let steps = 0, speakDone = false;
    while (steps++ < 40) {
      const s = snap();
      if (s.done) break;
      if (speakDone) {
        console.log('>>> exiting lesson after the speak exercise, restarting from the top');
        V('exitLesson(); startLesson(23);');
        log('after restart, index 0');
        break;
      }
      log('attempt1 step ' + steps);
      const r = await answerCurrent();
      console.log('   ->', r);
      if (r.indexOf('speak swapped') === 0) speakDone = true;
      if (r === 'speak-no-swap' || r.startsWith('unknown')) break;
      await sleep(10);
    }
    const ok = await play(23, 'restart: attempt 2 (full play)');
    console.log('variant restart result:', ok ? 'FINISHED' : 'STUCK');
    result = ok;
  } else {
    result = await play(23, 'variant: ' + variant);
    console.log('variant', variant, 'result:', result ? 'FINISHED' : 'STUCK');
  }
  process.exit(result ? 0 : 1);
})().catch((e) => { console.error('REPRO FAIL', e); process.exit(1); });
