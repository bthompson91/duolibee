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
  URL, URLSearchParams,
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
  'chat-notifications.js', 'speaking.js',
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

(async () => {
  // boot() is async (fetch lessons); give it a few ticks
  for (let i = 0; i < 20 && !vm.runInContext('typeof LESSONS !== "undefined" && LESSONS.length', sandbox); i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  const script = `
    (function () {
      const out = {};
      out.lessonCount = LESSONS.length;
      out.types = [...new Set(LESSONS.flatMap(l => l.exercises.map(e => e.type)))].sort();
      out.speakLessons = LESSONS.filter(l => l.exercises.some(e => e.type === 'speak')).length;
      // sentence builds intentionally carry [] (no single item); everything else must have keys
      out.missingSrsKeys = LESSONS.flatMap(l => l.exercises.filter(e => e.type !== 'learn' && e.type !== 'build' && !(e.srsKeys && e.srsKeys.length))).length;
      out.buildCount = LESSONS.flatMap(l => l.exercises.filter(e => e.type === 'build')).length;
      out.sentenceBuildKeys = LESSONS.flatMap(l => l.exercises.filter(e => e.type === 'build')).map(e => (e.srsKeys || []).length);
      return out;
    })()
  `;
  const info = vm.runInContext(script, sandbox);
  console.log('boot info:', JSON.stringify(info));
  assert.strictEqual(info.lessonCount, 100, '100 lessons');
  assert.ok(info.types.includes('speak'), 'speak exercise type exists');
  assert.strictEqual(info.speakLessons, 100, 'every lesson has a speak exercise');
  assert.strictEqual(info.missingSrsKeys, 0, 'every non-sentence graded exercise carries srsKeys, got ' + info.missingSrsKeys);
  assert.strictEqual(info.buildCount, 100, 'one sentence build per lesson');
  assert.ok(info.sentenceBuildKeys.every((n) => n === 0), 'sentence builds carry no single-item key');

  // ---- Play lesson 1: the translate exercise wrong on first try, everything else right ----
  // (the sentence build is answered right, so the only first-try failure is a
  // single-item exercise — that item must reset while the others advance) ----
  const play = `
    (function () {
      const log = [];
      const lesson = LESSONS.find(l => l.id === 1);
      const items = lesson.items.map(it => ({ t: it.t, key: srsKey(it.theme || lesson.category, it.t) }));
      startLesson(1);
      let wrongDone = false;
      let steps = 0;
      while (steps++ < 40) {
        const ex = session.exercises[index];
        if (!ex) break;
        if (index >= session.exercises.length) break;
        if (ex.type === 'learn') { next(); continue; }
        const firstGraded = ex.type === 'translate' && !wrongDone;
        if (ex.type === 'choice') {
          answerChoice(ex.answer);
        } else if (ex.type === 'translate') {
          document.getElementById('answer').value = firstGraded ? 'maling sagot' : ex.item.t;
          answerTranslate();
        } else if (ex.type === 'match') {
          if (false) {
            // one wrong pairing, then correct ones (retry wrapper settles on first wrong pair)
            const li = 0, ri = (session.mR.indexOf(ex.pairs[0].e) + 1) % ex.pairs.length;
            pickMatch('L', li); pickMatch('R', ri);
          } else {
            for (let i = 0; i < ex.pairs.length; i++) {
              const t = ex.pairs[i].t, e = ex.pairs[i].e;
              pickMatch('L', session.mL.indexOf(t));
              pickMatch('R', session.mR.indexOf(e));
            }
          }
        } else if (ex.type === 'build') {
          const words = ex.answer.split(' ');
          const used = new Set();
          session.built = words.map((w) => {
            const j = session.bank.findIndex((b, k) => b === w && !used.has(k));
            used.add(j); return j;
          });
          checkBuild();
        } else if (ex.type === 'audio') {
          answerAudio(ex.options.indexOf(ex.item.e));
        } else if (ex.type === 'speak') {
          session.speakHeard = ex.item.t;
          checkSpeaking();
        } else { throw new Error('unknown exercise type ' + ex.type); }
        if (firstGraded) wrongDone = true;
        next();
        if (app.innerHTML.includes('Session complete')) break;
      }
      return { steps, items, srs: JSON.parse(JSON.stringify(state.srs)), completed: !!state.completed[1], first: JSON.parse(JSON.stringify(session.srsFirst || {})) };
    })()
  `;
  const result = vm.runInContext(play, sandbox);
  console.log('lesson 1 played in', result.steps, 'steps; completed:', result.completed);
  assert.ok(result.completed, 'lesson 1 should complete (retries eventually pass)');
  // The wrong first try was the translate exercise: its item must reset.
  const lesson1 = vm.runInContext('LESSONS.find(l => l.id === 1)', sandbox);
  const wrongEx = lesson1.exercises.find((e) => e.type === 'translate');
  const wrongKeys = new Set(wrongEx.srsKeys);
  assert.strictEqual(wrongKeys.size, 1, 'translate tests exactly one item');
  console.log('wrong first try was translate, keys:', [...wrongKeys]);
  for (const it of result.items) {
    const rec = result.srs[it.key];
    assert.ok(rec, 'item should have an SRS record: ' + it.key);
    if (wrongKeys.has(it.key)) {
      assert.strictEqual(rec.streak, 0, it.t + ' was wrong first try, streak must reset, got ' + rec.streak);
      assert.ok(rec.due <= Date.now() + 1000, it.t + ' wrong first try must be due soon');
      console.log('  WRONG first try:', it.t, '-> streak', rec.streak, 'interval', rec.interval);
    } else {
      // correct on first try on every exercise containing it -> advances to 1-day interval
      assert.strictEqual(rec.interval, 1, it.t + ' correct first try should have 1-day interval, got ' + rec.interval);
      console.log('  right first try:', it.t, '-> streak', rec.streak, 'interval', rec.interval);
    }
  }
  // An item in the wrong exercise must NOT have advanced even if its other exercise was right.
  // (wrongKeys items are exactly the ones that must be due soon.)

  // ---- Review: force some items due, answer them right, check they advance ----
  const review = `
    (function () {
      // make the first 3 lesson-1 items due now
      const keys = Object.keys(state.srs).slice(0, 3);
      keys.forEach(k => { state.srs[k].due = 0; });
      save();
      startReview();
      let steps = 0;
      const before = {};
      keys.forEach(k => { before[k] = state.srs[k].streak; });
      while (steps++ < 30) {
        const ex = session.exercises[index];
        if (!ex) break;
        if (index >= session.exercises.length) break;
        answerChoice(ex.answer);
        next();
        if (app.innerHTML.includes('Session complete')) break;
      }
      const after = {};
      session.reviewKeys.forEach((k, i) => { after[k] = { streak: state.srs[k].streak, interval: state.srs[k].interval, result: session.results[i] }; });
      return { keys, before, after, results: session.results };
    })()
  `;
  const rev = vm.runInContext(review, sandbox);
  console.log('review results:', JSON.stringify(rev.results), 'reviewed keys:', rev.keys.length);
  assert.ok(rev.results.every((r) => r === true), 'all review answers were correct');
  for (const k of rev.keys) {
    assert.ok(rev.after[k], 'reviewed key scheduled: ' + k);
    assert.ok(rev.after[k].streak > rev.before[k], k + ' should advance after a correct review');
    console.log('  review advanced:', k, 'streak', rev.before[k], '->', rev.after[k].streak);
  }

  // ---- Speaking matcher unit tests ----
  const speakTests = vm.runInContext(`
    (function () {
      const item = { t: 'Kumusta ka?', e: 'How are you?' };
      return {
        exact: speakAccepted('Kumusta ka?', item),
        noPunct: speakAccepted('kumusta ka', item),
        oneTypo: speakAccepted('Kumusta ka', { t: 'Kumusta ka', e: 'x' }),
        typoLong: speakAccepted('Magandang umaga', { t: 'Magandang umaga', e: 'x' }),
        typoLong1: speakAccepted('Magandang umag', { t: 'Magandang umaga', e: 'x' }),
        wrong: speakAccepted('Paalam', item),
        empty: speakAccepted('', item),
        supported: speakSupported(),
      };
    })()
  `, sandbox);
  console.log('speakAccepted tests:', JSON.stringify(speakTests));
  assert.strictEqual(speakTests.exact, true);
  assert.strictEqual(speakTests.noPunct, true);
  assert.strictEqual(speakTests.wrong, false);
  assert.strictEqual(speakTests.empty, false);
  assert.strictEqual(speakTests.supported, false, 'no SpeechRecognition in this vm, so fallback path is the one exercised');

  // ---- Speaking fallback: unsupported browser swaps to a written question ----
  const fallback = vm.runInContext(`
    (function () {
      startLesson(2);
      // find the speak exercise
      let idx = session.exercises.findIndex(e => e.type === 'speak');
      index = idx; renderExercise();
      const before = session.exercises[idx].srsKeys.slice();
      replaceSpeakWithChoice();
      const ex = session.exercises[idx];
      return { type: ex.type, srsKeys: ex.srsKeys, kept: JSON.stringify(ex.srsKeys) === JSON.stringify(before) };
    })()
  `, sandbox);
  console.log('speak fallback:', JSON.stringify(fallback));
  assert.strictEqual(fallback.type, 'choice');
  assert.strictEqual(fallback.kept, true, 'fallback must keep srsKeys');



  // ---- Speaking, part 2: the app tries to make it work before falling back ----
  // (These run before the terminal-error tests below, which set the
  // session-wide "speech unavailable" flag.)
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));

  // P. iOS Safari: the microphone is primed via getUserMedia first, then
  // recognition starts and hears the word.
  vm.runInContext(`
    window.__langsTried = [];
    window.__primerCalled = false;
    window.webkitSpeechRecognition = class {
      constructor() {}
      abort() {}
      start() {
        const self = this;
        window.__langsTried.push(self.lang);
        setTimeout(() => {
          if (self.onresult) self.onresult({ results: [{ 0: { transcript: window.__fakeTranscript || 'test' } }] });
          if (self.onend) self.onend();
        }, 0);
      }
    };
    navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
    navigator.mediaDevices = { getUserMedia: () => { window.__primerCalled = true; return Promise.resolve({ getTracks: () => [{ stop() {} }] }); } };
  `, sandbox);
  const primer = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 6); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak');
      window.__fakeTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      startSpeaking();
      return { idx, item: session.exercises[idx].item.t };
    })()
  `, sandbox);
  await sleep2(80);
  const primerAfter = vm.runInContext(`
    (function () {
      return { primer: window.__primerCalled, langs: window.__langsTried.join(','), heard: session.speakHeard, type: session.exercises[index].type };
    })()
  `, sandbox);
  console.log('iOS primer + recognition:', JSON.stringify(primerAfter));
  assert.strictEqual(primerAfter.primer, true, 'on iOS the microphone should be primed first');
  assert.strictEqual(primerAfter.langs, 'fil-PH', 'recognition should start with fil-PH');
  assert.strictEqual(primerAfter.heard, primer.item, 'the spoken word should be heard');
  assert.strictEqual(primerAfter.type, 'speak', 'a working recognition must not swap the exercise');

  // F. Language fallback: fil-PH rejected, tl-PH hears the word.
  vm.runInContext(`
    window.__langsTried = [];
    delete navigator.mediaDevices;
    navigator.userAgent = '';
    window.webkitSpeechRecognition = class {
      constructor() {}
      abort() {}
      start() {
        const self = this;
        window.__langsTried.push(self.lang);
        setTimeout(() => {
          if (self.lang === 'fil-PH') {
            if (self.onerror) self.onerror({ error: 'service-not-allowed' });
            if (self.onend) self.onend();
          } else {
            if (self.onresult) self.onresult({ results: [{ 0: { transcript: window.__fakeTranscript || 'test' } }] });
            if (self.onend) self.onend();
          }
        }, 0);
      }
    };
  `, sandbox);
  const langFallback = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 7); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak');
      window.__fakeTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      startSpeaking();
      return { idx, item: session.exercises[idx].item.t };
    })()
  `, sandbox);
  await sleep2(80);
  const langFallbackAfter = vm.runInContext(`
    (function () {
      return { langs: window.__langsTried.join(','), heard: session.speakHeard, type: session.exercises[index].type };
    })()
  `, sandbox);
  console.log('language fallback:', JSON.stringify(langFallbackAfter));
  assert.strictEqual(langFallbackAfter.langs, 'fil-PH,tl-PH', 'a rejected fil-PH should retry once with tl-PH');
  assert.strictEqual(langFallbackAfter.heard, langFallback.item, 'the fallback language should hear the word');
  assert.strictEqual(langFallbackAfter.type, 'speak', 'a successful fallback must not swap the exercise');


  // G. Full chain: both Tagalog tags rejected, English hears the word.
  vm.runInContext(`
    window.__langsTried = [];
    window.webkitSpeechRecognition = class {
      constructor() {}
      abort() {}
      start() {
        const self = this;
        window.__langsTried.push(self.lang);
        setTimeout(() => {
          if (self.lang === 'en-US') {
            if (self.onresult) self.onresult({ results: [{ 0: { transcript: window.__fakeTranscript || 'test' } }] });
            if (self.onend) self.onend();
          } else {
            if (self.onerror) self.onerror({ error: 'service-not-allowed' });
            if (self.onend) self.onend();
          }
        }, 0);
      }
    };
  `, sandbox);
  const fullChain = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 8); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak');
      window.__fakeTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      startSpeaking();
      return { idx, item: session.exercises[idx].item.t };
    })()
  `, sandbox);
  await sleep2(80);
  const fullChainAfter = vm.runInContext(`
    (function () {
      return { langs: window.__langsTried.join(','), heard: session.speakHeard, type: session.exercises[index].type };
    })()
  `, sandbox);
  console.log('full language chain:', JSON.stringify(fullChainAfter));
  assert.strictEqual(fullChainAfter.langs, 'fil-PH,tl-PH,en-US', 'both Tagalog tags failing should reach en-US');
  assert.strictEqual(fullChainAfter.heard, fullChain.item, 'the English fallback should hear the word');
  assert.strictEqual(fullChainAfter.type, 'speak', 'a successful fallback must not swap the exercise');

  // ---- Speech recognition errors: terminal ones auto-swap, network does not ----
  vm.runInContext(`
    window.__fakeError = 'network';
    window.webkitSpeechRecognition = class {
      constructor() {}
      abort() {}
      start() {
        const err = window.__fakeError || 'network';
        const self = this;
        setTimeout(() => {
          if (self.onerror) self.onerror({ error: err });
          if (self.onend) self.onend();
        }, 0);
      }
    };
  `, sandbox);
  const notes = [];
  vm.runInContext(`
    (function () {
      const card = { prepend: (p) => { window.__notes = window.__notes || []; window.__notes.push(p.textContent); }, append: () => {} };
      app.querySelector = () => card;
    })()
  `, sandbox);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // C. 'network' is retryable: the exercise stays a speak exercise.
  const net = vm.runInContext(`
    (function () {
      window.__fakeError = 'network';
      session = LESSONS.find(l => l.id === 5); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak');
      index = idx; renderExercise();
      startSpeaking();
      return { idx, type: session.exercises[idx].type };
    })()
  `, sandbox);
  await sleep(60);
  const netAfter = vm.runInContext(`
    (function () {
      return {
        type: session.exercises[index].type,
        status: document.getElementById('speak-status').textContent,
      };
    })()
  `, sandbox);
  console.log('network error:', JSON.stringify(netAfter));
  assert.strictEqual(netAfter.type, 'speak', 'a network error must not swap the exercise');
  assert.ok(/connection/i.test(netAfter.status), 'network error should mention the connection, got: ' + netAfter.status);

  // A. 'service-not-allowed' is terminal: auto-swap to a written question with an explanation.
  const svc = vm.runInContext(`
    (function () {
      window.__fakeError = 'service-not-allowed';
      window.__notes = [];
      session = LESSONS.find(l => l.id === 3); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak');
      index = idx; renderExercise();
      startSpeaking();
      return { idx };
    })()
  `, sandbox);
  await sleep(60);
  const svcAfter = vm.runInContext(`
    (function () {
      return { type: session.exercises[index].type, notes: window.__notes || [] };
    })()
  `, sandbox);
  console.log('service-not-allowed:', JSON.stringify(svcAfter));
  assert.strictEqual(svcAfter.type, 'choice', 'service-not-allowed must auto-swap to a written question');
  assert.ok(svcAfter.notes.some((n) => /isn.t available/.test(n) && /written question/.test(n)),
    'swap must explain why, got notes: ' + JSON.stringify(svcAfter.notes));

  // B. Later speak exercises in the same session auto-swap at render time.
  const later = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 4); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak');
      index = idx; renderExercise();
      return { type: session.exercises[idx].type };
    })()
  `, sandbox);
  console.log('later speak exercise after terminal failure:', JSON.stringify(later));
  assert.strictEqual(later.type, 'choice', 'a later speak exercise must auto-swap once the service has failed');


  // ---- Environment detection: Home Screen app, in-app browser, Safari ----
  const envTests = vm.runInContext(`
    (function () {
      const env = window.duolibeeSpeakingEnv;
      const out = {};
      navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
      navigator.standalone = false;
      out.safari = { ios: env.isIOS(), inApp: env.isInAppBrowser(), standalone: env.isStandaloneWebApp() };
      navigator.standalone = true;
      out.homeScreen = { ios: env.isIOS(), inApp: env.isInAppBrowser(), standalone: env.isStandaloneWebApp() };
      navigator.standalone = false;
      navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
      out.webview = { ios: env.isIOS(), inApp: env.isInAppBrowser(), standalone: env.isStandaloneWebApp() };
      navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1';
      out.chromeIOS = { ios: env.isIOS(), inApp: env.isInAppBrowser(), standalone: env.isStandaloneWebApp() };
      navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
      out.desktop = { ios: env.isIOS(), inApp: env.isInAppBrowser(), standalone: env.isStandaloneWebApp() };
      navigator.userAgent = '';
      return out;
    })()
  `, sandbox);
  console.log('environment detection:', JSON.stringify(envTests));
  assert.strictEqual(envTests.safari.ios, true, 'Safari on iPhone is iOS');
  assert.strictEqual(envTests.safari.inApp, false, 'Safari itself is not an in-app browser');
  assert.strictEqual(envTests.safari.standalone, false, 'Safari itself is not a Home Screen app');
  assert.strictEqual(envTests.homeScreen.standalone, true, 'a Home Screen launch must be detected');
  assert.strictEqual(envTests.webview.inApp, true, 'a plain webview (no Safari token) is an in-app browser');
  assert.strictEqual(envTests.chromeIOS.inApp, true, 'Chrome on iOS is a webview, not Safari');
  assert.strictEqual(envTests.desktop.ios, false, 'desktop Chrome is not iOS');
  assert.strictEqual(envTests.desktop.inApp, false, 'desktop Chrome is not an in-app browser');

  console.log('FULL-CHAIN: PASS');
  process.exit(0); // scripts register intervals; exit explicitly on success
  if (loadFailures.length) console.log('note: some non-core scripts failed to load in the vm:', loadFailures.join(' | '));
})().catch((e) => { console.error('FULL-CHAIN: FAIL', e); process.exit(1); });
