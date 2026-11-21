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
    this._id = '';
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
  // Like a real DOM: setting an id makes the element findable.
  set id(v) { this._id = String(v || ''); if (this._id) byId.set(this._id, this); }
  get id() { return this._id; }
  append(...xs) { this.children.push(...xs); return xs[0]; }
  appendChild(x) { this.children.push(x); return x; }
  insertBefore(x) { this.children.push(x); return x; }
  after(...xs) { this.children.push(...xs); return xs[0]; }
  before(...xs) { this.children.unshift(...xs); return xs[0]; }
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
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
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
  'sentence-builder.js', 'answer-speech.js', 'global-mute.js', 'sound-effects.js',
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
      // sentence builds and sentence speaks intentionally carry [] (no single item); everything else must have keys
      out.missingSrsKeys = LESSONS.flatMap(l => l.exercises.filter(e => e.type !== 'learn' && e.type !== 'build' && !e.sentence && !(e.srsKeys && e.srsKeys.length))).length;
      out.buildCount = LESSONS.flatMap(l => l.exercises.filter(e => e.type === 'build')).length;
      out.sentenceBuildKeys = LESSONS.flatMap(l => l.exercises.filter(e => e.type === 'build')).map(e => (e.srsKeys || []).length);
      out.sentenceSpeakCount = LESSONS.flatMap(l => l.exercises.filter(e => e.sentence)).length;
      out.sentenceSpeakAfterBuild = LESSONS.every(l => { const b = l.exercises.findIndex(e => e.type === 'build'); return b >= 0 && l.exercises[b + 1] && l.exercises[b + 1].sentence === true; });
      out.sentenceSpeakKeys = LESSONS.flatMap(l => l.exercises.filter(e => e.sentence)).map(e => (e.srsKeys || []).length);
      out.sentenceDiffersFromBuild = LESSONS.every(l => { const b = l.exercises.find(e => e.type === 'build'); const s = l.exercises.find(e => e.sentence); return b && s && s.item.t !== b.answer; });
      out.reverseCount = LESSONS.flatMap(l => l.exercises.filter(e => e.type === 'reverse')).length;
      out.gradedById = {};
      [1, 7, 13, 19, 25, 31, 100].forEach(id => { const l = LESSONS.find(x => x.id === id); out.gradedById[id] = l.exercises.filter(e => e.type !== 'learn').length; });
      out.itemsPerLesson = LESSONS.map(l => l.items.length);
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
  assert.strictEqual(info.sentenceSpeakCount, 170, 'one sentence speak per lesson plus a second one in lessons 31+ (100 + 70)');
  assert.ok(info.sentenceSpeakAfterBuild, 'sentence speak follows the build exercise');
  assert.ok(info.sentenceSpeakKeys.every((n) => n === 0), 'sentence speaks carry no single-item key');
  assert.ok(info.sentenceDiffersFromBuild, 'sentence speak uses a different sentence than the build');
  assert.ok(info.types.includes('reverse'), 'reverse translate exercise type exists');
  assert.strictEqual(info.reverseCount, 94, 'a reverse translate in every lesson from 7 on (94 lessons)');
  // gradedById comes from the vm context, so compare values individually
  // (deepStrictEqual would fail on the vm object's prototype).
  assert.strictEqual(info.gradedById[1], 7, 'lesson 1 has 7 graded');
  assert.strictEqual(info.gradedById[7], 8, 'lesson 7 has 8 graded');
  assert.strictEqual(info.gradedById[13], 9, 'lesson 13 has 9 graded');
  assert.strictEqual(info.gradedById[19], 10, 'lesson 19 has 10 graded');
  assert.strictEqual(info.gradedById[25], 11, 'lesson 25 has 11 graded');
  assert.strictEqual(info.gradedById[31], 12, 'lesson 31 has 12 graded');
  assert.strictEqual(info.gradedById[100], 12, 'lesson 100 has 12 graded');
  assert.ok(info.itemsPerLesson.every((n) => n === 6), '6 words per lesson');


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
        } else if (ex.type === 'reverse') {
          document.getElementById('answer').value = ex.item.e.split('/')[0].trim();
          answerReverse();
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

  // ---- Ramp play: lesson 31 (all 5 extras, 12 graded) completes, with a
  // reverse translate, two audios, two choices, and two sentence speaks ----
  const play31 = `
    (function () {
      // lesson-progression.js refuses a lesson past the frontier
      for (let i = 1; i < 31; i++) state.completed[i] = { last: Date.now() };
      startLesson(31);
      let steps = 0;
      const seen = {};
      while (steps++ < 40) {
        const ex = session.exercises[index];
        if (!ex) break;
        if (index >= session.exercises.length) break;
        if (ex.type === 'learn') { next(); continue; }
        seen[ex.type] = (seen[ex.type] || 0) + 1;
        if (ex.sentence) seen.sentence = (seen.sentence || 0) + 1;
        if (ex.type === 'choice') {
          answerChoice(ex.answer);
        } else if (ex.type === 'translate') {
          document.getElementById('answer').value = ex.item.t;
          answerTranslate();
        } else if (ex.type === 'reverse') {
          document.getElementById('answer').value = ex.item.e.split('/')[0].trim();
          answerReverse();
        } else if (ex.type === 'match') {
          for (let i = 0; i < ex.pairs.length; i++) {
            const t = ex.pairs[i].t, e = ex.pairs[i].e;
            pickMatch('L', session.mL.indexOf(t));
            pickMatch('R', session.mR.indexOf(e));
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
        }
        next();
        if (app.innerHTML.includes('Session complete')) break;
      }
      return { steps, seen, completed: !!state.completed[31], graded: session.exercises.filter(e => e.type !== 'learn').length };
    })()
  `;
  // The harness's fake match buttons persist across lessons and stay
  // disabled after lesson 1's match; a real browser re-renders fresh ones.
  for (const el of byId.values()) el.disabled = false;
  const r31 = vm.runInContext(play31, sandbox);
  console.log('lesson 31 ramp play:', JSON.stringify(r31));
  assert.ok(r31.completed, 'lesson 31 should complete');
  assert.strictEqual(r31.graded, 12, 'lesson 31 has 12 graded questions');
  assert.strictEqual(r31.seen.reverse, 1, 'lesson 31 has a reverse translate');
  assert.strictEqual(r31.seen.sentence, 2, 'lesson 31 has two sentence speaks');
  assert.strictEqual(r31.seen.speak, 4, 'lesson 31 has four speak exercises (word x2 + sentence x2)');
  assert.strictEqual(r31.seen.audio, 2, 'lesson 31 has two audio exercises');
  assert.strictEqual(r31.seen.choice, 2, 'lesson 31 has two choice exercises');

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

  // ---- Lenient matching: hyphens, bracket qualifiers, slashes ----
  // A hyphen is the same as a space ("lola joli" for "lola-joli"), a
  // parenthetical qualifier is ignored ("we" for "we (not you)"), and a
  // slash means either side is correct ("he" or "she" for "he / she").
  // Hyphens live in the Tagalog, so translate and speaking prove them
  // through accepted(); brackets and slashes live in the English, so
  // reverse proves them through norm() and its slash split.
  const lenient = vm.runInContext(`
    (function () {
      return {
        hyphen: accepted({ t: 'lola-joli' }, 'lola joli'),
        hyphenSentence: accepted({ t: 'Nasa ospital si lola-joli.' }, 'Nasa ospital si lola joli'),
        hyphenOther: accepted({ t: 'tita-baby' }, 'tita baby'),
        bracketKami: norm('we') === norm('we (not you)'),
        bracketTayo: norm('we') === norm('we (including you)'),
        slashHe: accepted({ t: 'he / she' }, 'he'),
        slashShe: accepted({ t: 'he / she' }, 'she'),
        slashSick: accepted({ t: 'sickness / pain' }, 'sickness'),
        slashPain: accepted({ t: 'sickness / pain' }, 'pain'),
        slashCan: accepted({ t: 'can / may' }, 'can'),
        reverseSlashHe: 'he / she'.split('/').map((s) => norm(s)).includes(norm('he')),
        reverseSlashShe: 'he / she'.split('/').map((s) => norm(s)).includes(norm('she')),
        reverseSlashMe: 'I / me'.split('/').map((s) => norm(s)).includes(norm('me')),
        reverseBracket: norm('we') === norm('we (not you)'),
        speakHyphen: speakAccepted('lola joli', { t: 'lola-joli', e: 'Grandma Joli' }),
        wrongStillWrong: accepted({ t: 'lola-joli' }, 'lola maria'),
      };
    })()
  `, sandbox);
  console.log('lenient matching:', JSON.stringify(lenient));
  for (const [k, v] of Object.entries(lenient)) {
    if (k === 'wrongStillWrong') assert.strictEqual(v, false, k + ' must still fail');
    else assert.strictEqual(v, true, k + ' must be accepted');
  }

  // ---- Reverse must reject the Tagalog word itself ----
  // A reverse question shows the Tagalog and asks for the English, so
  // typing the prompt word back must fail. (Brendan reported "kalsada"
  // passing for "Translate: kalsada" — the correct answer is "street".)
  // Lesson 34's reverse is items[4] = kalsada -> street.
  const reverseTagalog = vm.runInContext(`
    (function () {
      for (let i = 1; i < 34; i++) state.completed[i] = { last: Date.now() };
      startLesson(34);
      const idx = session.exercises.findIndex((e) => e.type === 'reverse' && e.item && e.item.t === 'kalsada');
      if (idx < 0) return { found: false };
      index = idx;
      renderExercise();
      const ex = session.exercises[index];
      const before = correct;
      document.getElementById('answer').value = ex.item.t; // the Tagalog word itself
      answerReverse();
      const fb = document.getElementById('feedback');
      return {
        found: true, prompt: ex.prompt, itemT: ex.item.t, itemE: ex.item.e,
        correctBefore: before, correctAfter: correct,
        fbClass: fb && fb.className, fbText: fb && fb.textContent,
      };
    })()
  `, sandbox);
  console.log('reverse Tagalog word:', JSON.stringify(reverseTagalog));
  assert.strictEqual(reverseTagalog.found, true, 'lesson 34 must have a reverse exercise for kalsada');
  assert.strictEqual(reverseTagalog.prompt, 'Translate: kalsada', 'the reverse prompt must show the Tagalog word');
  assert.strictEqual(reverseTagalog.correctAfter, reverseTagalog.correctBefore, 'typing the Tagalog word for a reverse question must not count as correct');
  assert.ok(reverseTagalog.fbClass && reverseTagalog.fbClass.includes('bad'), 'typing the Tagalog word for a reverse question must be marked wrong');
  assert.ok(reverseTagalog.fbText && reverseTagalog.fbText.includes('Correct answer: street'), 'the feedback must show the English answer');

  // ---- Speaking fallback: unsupported browser swaps to a written question ----
  const fallback = vm.runInContext(`
    (function () {
      startLesson(2);
      // find the speak exercise
      let idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
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
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
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
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
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
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
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
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
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

  // A. 'service-not-allowed' is terminal for the browser service, but the
  // exercise stays a speak exercise: the learner can record instead.
  const svc = vm.runInContext(`
    (function () {
      window.__fakeError = 'service-not-allowed';
      window.__notes = [];
      session = LESSONS.find(l => l.id === 3); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      index = idx; renderExercise();
      startSpeaking();
      return { idx };
    })()
  `, sandbox);
  await sleep(60);
  const svcAfter = vm.runInContext(`
    (function () {
      return {
        type: session.exercises[index].type,
        status: document.getElementById('speak-status').textContent,
        notes: window.__notes || [],
      };
    })()
  `, sandbox);
  console.log('service-not-allowed:', JSON.stringify(svcAfter));
  assert.strictEqual(svcAfter.type, 'speak', 'service-not-allowed must not swap the exercise any more — recording is the fallback');
  assert.ok(/record instead/i.test(svcAfter.status), 'terminal failure should offer recording, got: ' + svcAfter.status);
  assert.ok(!svcAfter.notes.some((n) => /written question/.test(n)), 'no written-question note should be added, got: ' + JSON.stringify(svcAfter.notes));

  // B. Later speak exercises in the same session stay speak exercises, and
  // tapping the microphone now records (server transcription) instead of
  // offering a recognition service that is known to be dead.
  vm.runInContext(`
    window.__serverTranscript = null;
    window.MediaRecorder = class {
      constructor(stream) { this.stream = stream; this.mimeType = 'audio/mp4'; }
      start() {
        const self = this;
        setTimeout(() => {
          if (self.ondataavailable) self.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/mp4' }) });
          if (self.onstop) self.onstop();
        }, 0);
      }
      stop() {}
    };
    navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) };
  `, sandbox);
  const fetchBeforeServer = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) return { ok: true, status: 200, json: async () => ({ transcript: sandbox.__serverTranscript || '' }) };
    return fetchBeforeServer(url, options);
  };
  const later = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 4); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      window.__serverTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      const typeAtRender = session.exercises[idx].type;
      startSpeaking();
      return { typeAtRender, idx, item: session.exercises[idx].item.t };
    })()
  `, sandbox);
  await sleep(120);
  const laterAfter = vm.runInContext(`
    (function () {
      const heard = session.speakHeard;
      const before = correct;
      checkSpeaking();
      return { type: session.exercises[index].type, heard, correctBefore: before, correctAfter: correct, answered: session._answeredIndex === index };
    })()
  `, sandbox);
  sandbox.fetch = fetchBeforeServer;
  console.log('later speak exercise after terminal failure:', JSON.stringify(laterAfter));
  assert.strictEqual(later.typeAtRender, 'speak', 'a later speak exercise must stay speak once the service has failed');
  assert.strictEqual(laterAfter.type, 'speak', 'the recorded exercise must stay speak');
  assert.strictEqual(laterAfter.heard, later.item, 'server transcription should hear the word');
  assert.strictEqual(laterAfter.correctAfter, laterAfter.correctBefore + 1, 'a correctly transcribed word should grade correct on Check');
  assert.strictEqual(laterAfter.answered, true, 'Check should mark the exercise answered');

  // H. Whisper mode: the recording goes only to the on-device model —
  // the server is never asked, even when it would fail.
  vm.runInContext(`
    window.__whisperTranscript = null;
    window.__whisperAudioLen = null;
    window.__serverCalls = 0;
    window.__realWhisper = window.duolibeeWhisper;
    window.duolibeeWhisper = {
      ensureLoaded: async () => {},
      transcribe: async (audio) => { window.__whisperAudioLen = audio.length; return window.__whisperTranscript || ''; },
      status: 'ready',
    };
    window.AudioContext = class {
      constructor() {}
      async decodeAudioData() { return { sampleRate: 48000, getChannelData: () => new Float32Array([0.1, 0.2, 0.3]) }; }
      close() {}
    };
    state.settings.whisper = true;
  `, sandbox);
  const fetchBeforeWhisper = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) { sandbox.__serverCalls++; return { ok: false, status: 502, json: async () => ({}) }; }
    return fetchBeforeWhisper(url, options);
  };
  const whisperTest = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 9); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      window.__whisperTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      startSpeaking();
      return { idx, item: session.exercises[idx].item.t };
    })()
  `, sandbox);
  await sleep(120);
  const whisperAfter = vm.runInContext(`
    (function () {
      return { type: session.exercises[index].type, heard: session.speakHeard, audioLen: window.__whisperAudioLen, serverCalls: window.__serverCalls };
    })()
  `, sandbox);
  sandbox.fetch = fetchBeforeWhisper;
  console.log('whisper mode transcribes on device:', JSON.stringify(whisperAfter));
  assert.strictEqual(whisperAfter.type, 'speak', 'a Whisper transcription must keep the exercise');
  assert.strictEqual(whisperAfter.heard, whisperTest.item, 'Whisper should hear the word');
  assert.strictEqual(whisperAfter.audioLen, 1, 'the recording should be resampled to 16 kHz before Whisper (3 samples at 48 kHz -> 1)');
  assert.strictEqual(whisperAfter.serverCalls, 0, 'Whisper mode must never call the server');

  // I. Whisper mode, and Whisper cannot transcribe: the exercise becomes
  // a written question, with an explanation and no penalty.
  vm.runInContext(`
    window.__whisperTranscript = '';
    window.__notes = [];
  `, sandbox);
  const fetchBeforeBothFail = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) throw new Error('offline');
    return fetchBeforeBothFail(url, options);
  };
  const bothFail = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 10); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      index = idx; renderExercise();
      startSpeaking();
      return { idx };
    })()
  `, sandbox);
  await sleep(120);
  const bothFailAfter = vm.runInContext(`
    (function () {
      return { type: session.exercises[index].type, notes: window.__notes || [] };
    })()
  `, sandbox);
  sandbox.fetch = fetchBeforeBothFail;
  console.log('whisper cannot transcribe:', JSON.stringify(bothFailAfter));
  assert.strictEqual(bothFailAfter.type, 'choice', 'when the chosen transcription path fails the exercise must become a written question');
  assert.ok(bothFailAfter.notes.some((n) => /Couldn.t check what you said/.test(n)), 'the swap must explain why, got: ' + JSON.stringify(bothFailAfter.notes));
  vm.runInContext(`
    window.duolibeeWhisper = window.__realWhisper;
    delete state.settings.whisper;
  `, sandbox);

  // J. The Whisper Settings toggle: turning it on starts the model
  // download; a failed download reverts the setting.
  vm.runInContext(`
    window.__whisperLoadCalls = 0;
    window.__realWhisper2 = window.duolibeeWhisper;
    window.duolibeeWhisper = {
      ensureLoaded: async (onProgress) => { window.__whisperLoadCalls++; if (onProgress) onProgress('Downloading… 50%'); },
      transcribe: async () => '',
      status: 'ready',
    };
    state.settings.whisper = false;
  `, sandbox);
  await vm.runInContext('setWhisperEnabled(true)', sandbox);
  const toggleOn = vm.runInContext(`
    (function () {
      return { setting: state.settings.whisper, calls: window.__whisperLoadCalls, status: document.getElementById('whisper-status').textContent };
    })()
  `, sandbox);
  console.log('whisper toggle on:', JSON.stringify(toggleOn));
  assert.strictEqual(toggleOn.setting, true, 'enabling Whisper must save the setting');
  assert.strictEqual(toggleOn.calls, 1, 'enabling Whisper must trigger the model download');
  assert.ok(/Whisper/.test(toggleOn.status), 'a loaded model should report Whisper mode, got: ' + toggleOn.status);
  vm.runInContext(`
    window.duolibeeWhisper = {
      ensureLoaded: async () => { throw new Error('no network'); },
      transcribe: async () => '',
      status: 'failed',
    };
  `, sandbox);
  await vm.runInContext('setWhisperEnabled(true)', sandbox);
  const toggleFail = vm.runInContext(`
    (function () {
      return { setting: state.settings.whisper, status: document.getElementById('whisper-status').textContent };
    })()
  `, sandbox);
  console.log('whisper toggle, download fails:', JSON.stringify(toggleFail));
  assert.strictEqual(toggleFail.setting, false, 'a failed download must revert the setting');
  assert.ok(/Download failed/.test(toggleFail.status), 'a failed download must say so, got: ' + toggleFail.status);
  vm.runInContext(`
    window.duolibeeWhisper = window.__realWhisper2;
    delete state.settings.whisper;
  `, sandbox);

  // J2. Whisper runs the base model, not tiny: the worker loads
  // onnx-community/whisper-base, and the Settings status names its size.
  const workerSrc = fs.readFileSync(path.join(REPO, 'whisper-worker.js'), 'utf8');
  assert.ok(workerSrc.includes("onnx-community/whisper-base"), 'the Whisper worker must load whisper-base');
  assert.ok(!workerSrc.includes('whisper-tiny'), 'the Whisper worker must not reference whisper-tiny');
  assert.ok(/75 MB/.test(toggleOn.status), 'the Whisper status should name the base model size, got: ' + toggleOn.status);

  // K. Whisper mode is exclusive: the server is never asked — the same
  // recording goes straight to the on-device model, even when the server
  // would answer. This is the toggle: one path, never both at once.
  vm.runInContext(`
    window.__whisperTranscript = null;
    window.__whisperCalls = 0;
    window.__serverCalls = 0;
    window.__realWhisper3 = window.duolibeeWhisper;
    window.duolibeeWhisper = {
      ensureLoaded: async () => {},
      transcribe: async (audio) => { window.__whisperCalls++; return window.__whisperTranscript || ''; },
      status: 'ready',
    };
    state.settings.whisper = true;
  `, sandbox);
  const fetchBeforeForce = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) { sandbox.__serverCalls++; return { ok: true, status: 200, json: async () => ({ transcript: 'SERVER-WORD' }) }; }
    return fetchBeforeForce(url, options);
  };
  const forceTest = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 13); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      window.__whisperTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      const useWhisper = window.duolibeeSpeaking.useWhisper();
      startSpeaking();
      return { idx, item: session.exercises[idx].item.t, useWhisper };
    })()
  `, sandbox);
  await sleep(120);
  const forceAfter = vm.runInContext(`
    (function () {
      return { type: session.exercises[index].type, heard: session.speakHeard, serverCalls: window.__serverCalls, whisperCalls: window.__whisperCalls };
    })()
  `, sandbox);
  sandbox.fetch = fetchBeforeForce;
  console.log('whisper mode, server would answer:', JSON.stringify(forceAfter));
  assert.strictEqual(forceTest.useWhisper, true, 'Whisper on with the model present must report Whisper mode');
  assert.strictEqual(forceAfter.type, 'speak', 'Whisper mode must keep the exercise');
  assert.strictEqual(forceAfter.heard, forceTest.item, 'Whisper mode must hear the word');
  assert.strictEqual(forceAfter.serverCalls, 0, 'Whisper mode must never call the server');
  assert.strictEqual(forceAfter.whisperCalls, 1, 'Whisper mode must call the model exactly once');

  // useWhisper is only true when the setting is on and the model object
  // exists; Whisper off, or no model object, means the cloud model.
  const whisperStates = vm.runInContext(`
    (function () {
      const out = {};
      const real = window.duolibeeWhisper;
      state.settings.whisper = true;
      out.on = window.duolibeeSpeaking.useWhisper();
      state.settings.whisper = false;
      out.off = window.duolibeeSpeaking.useWhisper();
      state.settings.whisper = true;
      window.duolibeeWhisper = undefined;
      out.noModel = window.duolibeeSpeaking.useWhisper();
      window.duolibeeWhisper = real;
      return out;
    })()
  `, sandbox);
  assert.strictEqual(whisperStates.on, true, 'Whisper on with the model must use Whisper');
  assert.strictEqual(whisperStates.off, false, 'Whisper off must use the cloud model');
  assert.strictEqual(whisperStates.noModel, false, 'Whisper on without the model object must fall back to the cloud model');

  // Settings shows one Whisper toggle, and no "Always use Whisper"
  // checkbox — the force option is gone from the source entirely.
  const whisperSrc = fs.readFileSync(path.join(REPO, 'whisper.js'), 'utf8');
  assert.ok(whisperSrc.includes("whisper-setting-box"), 'whisper.js must still build the Whisper toggle');
  assert.ok(!whisperSrc.includes('force-whisper-setting'), 'whisper.js must not create the force checkbox');
  assert.ok(!whisperSrc.includes('forceWhisper'), 'whisper.js must not reference forceWhisper');
  const speakingSrc = fs.readFileSync(path.join(REPO, 'speaking.js'), 'utf8');
  assert.ok(!speakingSrc.includes('transcribeInParallel'), 'speaking.js must not run the parallel path');
  assert.ok(!speakingSrc.includes('whisperForced'), 'speaking.js must not have a force path');
  assert.ok(speakingSrc.includes('useWhisper'), 'speaking.js must pick one path by the toggle');
  vm.runInContext(`
    window.duolibeeWhisper = window.__realWhisper3;
    delete state.settings.whisper;
  `, sandbox);

  // L. Speaking switched off in Settings still swaps speak exercises at
  // render time.
  const settingsOff = vm.runInContext(`
    (function () {
      state.settings.speaking = false;
      session = LESSONS.find(l => l.id === 11); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      index = idx; renderExercise();
      const type = session.exercises[idx].type;
      state.settings.speaking = true;
      return { type };
    })()
  `, sandbox);
  console.log('speaking off in settings:', JSON.stringify(settingsOff));
  assert.strictEqual(settingsOff.type, 'choice', 'speaking off must swap the exercise at render');

  // M. A sentence speak that cannot be transcribed becomes a translate
  // question (type the sentence), not a choice: a choice would give the
  // long English sentence away among single-word distractors.
  vm.runInContext(`
    window.__notes = [];
  `, sandbox);
  const fetchBeforeSentenceFail = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) throw new Error('offline');
    return fetchBeforeSentenceFail(url, options);
  };
  const sentenceFail = vm.runInContext(`
    (function () {
      startLesson(12);
      const idx = session.exercises.findIndex(e => e.sentence);
      const sentence = session.exercises[idx].item.t;
      const english = session.exercises[idx].item.e;
      index = idx; renderExercise();
      startSpeaking();
      return { idx, sentence, english };
    })()
  `, sandbox);
  await sleep(120);
  const sentenceFailAfter = vm.runInContext(`
    (function () {
      const ex = session.exercises[index];
      return { type: ex.type, prompt: ex.prompt, itemT: ex.item && ex.item.t, origin: ex._origin, notes: window.__notes || [] };
    })()
  `, sandbox);
  sandbox.fetch = fetchBeforeSentenceFail;
  console.log('sentence speak, transcription fails:', JSON.stringify(sentenceFailAfter));
  assert.strictEqual(sentenceFailAfter.type, 'translate', 'a failed sentence speak must become a translate question');
  assert.strictEqual(sentenceFailAfter.prompt, 'Translate: ' + sentenceFail.english, 'the translate prompt shows the English sentence');
  assert.strictEqual(sentenceFailAfter.itemT, sentenceFail.sentence, 'the translate answer is the sentence');
  assert.strictEqual(sentenceFailAfter.origin, sentenceFail.idx, 'the fallback keeps the sentence speak origin');
  assert.ok(sentenceFailAfter.notes.some((n) => /Couldn.t check what you said/.test(n)), 'the swap must explain why, got: ' + JSON.stringify(sentenceFailAfter.notes));
  // Answering the translate correctly grades it right.
  const sentenceAnswered = vm.runInContext(`
    (function () {
      document.getElementById('answer').value = session.exercises[index].item.t;
      answerTranslate();
      return { correct };
    })()
  `, sandbox);
  console.log('sentence translate answered:', JSON.stringify(sentenceAnswered));
  assert.strictEqual(sentenceAnswered.correct, 1, 'typing the sentence must grade correct');

  // N. Cloud mode is exclusive too: Whisper is never asked — the
  // recording goes only to the server, even when the model is present.
  vm.runInContext(`
    state.settings.whisper = false;
    window.__serverTranscript = null;
    window.__cloudServerCalls = 0;
    window.__cloudWhisperCalls = 0;
    window.duolibeeWhisper = {
      ensureLoaded: async () => {},
      transcribe: async (audio) => { window.__cloudWhisperCalls++; return window.__whisperTranscript || ''; },
      status: 'ready',
    };
  `, sandbox);
  const fetchBeforeCloud = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) { sandbox.__cloudServerCalls++; return { ok: true, status: 200, json: async () => ({ transcript: sandbox.__serverTranscript || '' }) }; }
    return fetchBeforeCloud(url, options);
  };
  const cloudTest = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 16); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      const target = session.exercises[idx].item.t;
      window.__serverTranscript = target;
      window.__whisperTranscript = 'zzz wrong';
      index = idx; renderExercise();
      startSpeaking();
      return { idx, target };
    })()
  `, sandbox);
  await sleep(200);
  const cloudAfter = vm.runInContext(`({ heard: session.speakHeard, serverCalls: window.__cloudServerCalls, whisperCalls: window.__cloudWhisperCalls })`, sandbox);
  sandbox.fetch = fetchBeforeCloud;
  console.log('cloud mode, model present:', JSON.stringify(cloudAfter));
  assert.strictEqual(cloudAfter.heard, cloudTest.target, 'cloud mode must hear the server transcript');
  assert.strictEqual(cloudAfter.serverCalls, 1, 'cloud mode must call the server exactly once');
  assert.strictEqual(cloudAfter.whisperCalls, 0, 'cloud mode must never call Whisper');

  // O. Silence detection: speech, then a second of quiet, stops the
  // recording early — well before the 8 s cap — and the clipped recording
  // is still transcribed.
  vm.runInContext(`
    window.__micLevel = 0;
    window.__recorderStopped = false;
    window.__recorderStopAt = null;
    window.__recordStartedAt = null;
    window.AudioContext = class {
      constructor() { this.state = 'running'; }
      resume() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() {
        return {
          fftSize: 512,
          getByteTimeDomainData(buf) {
            const v = window.__micLevel ? 170 : 128;
            for (let i = 0; i < buf.length; i++) buf[i] = v;
          },
        };
      }
      async decodeAudioData() { return { sampleRate: 48000, getChannelData: () => new Float32Array([0.1, 0.2, 0.3]) }; }
      close() {}
    };
    window.MediaRecorder = class {
      constructor(stream) { this.stream = stream; this.mimeType = 'audio/mp4'; }
      start() { window.__recordStartedAt = Date.now(); }
      stop() {
        window.__recorderStopped = true;
        window.__recorderStopAt = Date.now();
        if (this.ondataavailable) this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/mp4' }) });
        if (this.onstop) this.onstop();
      }
    };
    navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) };
    state.settings.whisper = false;
  `, sandbox);
  const fetchBeforeSilence = sandbox.fetch;
  sandbox.fetch = async (url, options) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/transcribe')) return { ok: true, status: 200, json: async () => ({ transcript: sandbox.__serverTranscript || '' }) };
    return fetchBeforeSilence(url, options);
  };
  const sil = vm.runInContext(`
    (function () {
      session = LESSONS.find(l => l.id === 21); index = 0; correct = 0; delete session._answeredIndex;
      const idx = session.exercises.findIndex(e => e.type === 'speak' && !e.sentence);
      window.__serverTranscript = session.exercises[idx].item.t;
      index = idx; renderExercise();
      window.__micLevel = 1;
      startSpeaking();
      return { idx, target: session.exercises[idx].item.t };
    })()
  `, sandbox);
  await sleep(300);
  vm.runInContext(`window.__micLevel = 0;`, sandbox);
  await sleep(1800);
  const silAfter = vm.runInContext(`({
    stopped: window.__recorderStopped,
    elapsed: window.__recorderStopAt - window.__recordStartedAt,
    heard: session.speakHeard,
  })`, sandbox);
  sandbox.fetch = fetchBeforeSilence;
  console.log('silence detection:', JSON.stringify(silAfter));
  assert.strictEqual(silAfter.stopped, true, 'a second of silence after speech must stop the recording');
  assert.ok(silAfter.elapsed >= 1000 && silAfter.elapsed < 4000, 'the silence stop should come ~1 s after speech ends, not at the 8 s cap, got ' + silAfter.elapsed);
  assert.strictEqual(silAfter.heard, sil.target, 'the clipped recording must still be transcribed');
  // Restore the auto-stop recorder for later tests.
  vm.runInContext(`
    window.MediaRecorder = class {
      constructor(stream) { this.stream = stream; this.mimeType = 'audio/mp4'; }
      start() {
        const self = this;
        setTimeout(() => {
          if (self.ondataavailable) self.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/mp4' }) });
          if (self.onstop) self.onstop();
        }, 0);
      }
      stop() {}
    };
  `, sandbox);

  // P. Kumusta: the models sometimes spell it as its Spanish source,
  // "como esta" — that counts as correct, with or without accents, and
  // the variant is carried in the lesson data.
  const kumustaTests = vm.runInContext(`
    (function () {
      const item = { t: 'Kumusta', e: 'Hello', v: ['como esta'] };
      const dataItem = ALL.find((it) => it.t === 'Kumusta');
      return {
        plain: window.speakAccepted('Kumusta', item),
        comoEsta: window.speakAccepted('como esta', item),
        accented: window.speakAccepted('¿Cómo está?', item),
        normAccented: norm('¿Cómo está?'),
        wrong: window.speakAccepted('Salamat', item),
        dataVariant: !!(dataItem && Array.isArray(dataItem.v) && dataItem.v.indexOf('como esta') >= 0),
      };
    })()
  `, sandbox);
  console.log('Kumusta variant:', JSON.stringify(kumustaTests));
  assert.strictEqual(kumustaTests.plain, true, 'Kumusta should be accepted');
  assert.strictEqual(kumustaTests.comoEsta, true, 'como esta should count for Kumusta');
  assert.strictEqual(kumustaTests.accented, true, '¿Cómo está? should count for Kumusta');
  assert.strictEqual(kumustaTests.normAccented, 'como esta', 'norm should transliterate accents, got ' + kumustaTests.normAccented);
  assert.strictEqual(kumustaTests.wrong, false, 'Salamat must not count for Kumusta');
  assert.strictEqual(kumustaTests.dataVariant, true, 'lessons.json Kumusta must carry the como esta variant');

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

  // ---- Pre-recorded lesson audio ----
  // play() prefers the generated MP3 for a phrase (words in the lesson
  // host's voice, sentences in the speaker's voice) and falls back to the
  // system voice when there is no file. Both languages are recorded: the
  // manifest is v2 (character|lang|text) with a v1 key kept as a fallback.
  // Starting a lesson pre-caches that lesson's Tagalog + English clips.
  // Runs before the header block so the header block still runs last.
  const fetchBeforeAudio = sandbox.fetch;
  const l1 = JSON.parse(vm.runInContext(`JSON.stringify({ host: LESSONS[0].host || THEMES[0].host, word: LESSONS[0].items[1].t, wordEn: LESSONS[0].items[1].e, sent: THEMES.find(t => t.name === LESSONS[0].category).sentences[1].t, sentEn: THEMES.find(t => t.name === LESSONS[0].category).sentences[1].e, sentSpeaker: THEMES.find(t => t.name === LESSONS[0].category).sentences[1].speaker, buildSent: THEMES.find(t => t.name === LESSONS[0].category).sentences[0].t, buildSpeaker: THEMES.find(t => t.name === LESSONS[0].category).sentences[0].speaker, buildWords: THEMES.find(t => t.name === LESSONS[0].category).sentences[0].t.split(' ') })`, sandbox));
  sandbox.__buildWords = l1.buildWords;
  sandbox.__buildSpeaker = l1.buildSpeaker;
  sandbox.__fetchedAudio = [];
  // The build sentence's individual words, in the speaker's voice: the
  // stripped form of each token (tokens carry trailing punctuation).
  // 'Kumusta' is already there as vocab (aaa111); 'ka' is the new file.
  const audioEntries = {
    'lumpy|tl|Kumusta': 'aaa111.mp3',
    'lola-joli|tl|Kumusta ka?': 'bbb222.mp3',
    'lumpy|en|Thank you': 'ccc333.mp3',
    'lumpy|Kumusta ka?': 'ddd444.mp3',
    [l1.host + '|tl|' + l1.word]: 'lesson1word.mp3',
    [l1.host + '|en|' + l1.wordEn]: 'lesson1word-en.mp3',
    [l1.sentSpeaker + '|tl|' + l1.sent]: 'lesson1sent.mp3',
    [l1.sentSpeaker + '|en|' + l1.sentEn]: 'lesson1sent-en.mp3',
  };
  l1.buildWords.map(w => w.replace(/[?.,!;:'"()]+$/g, '')).forEach((w, i) => {
    const k = l1.buildSpeaker + '|tl|' + w;
    if (!audioEntries[k]) audioEntries[k] = 'lesson1buildword' + (i + 1) + '.mp3';
  });
  sandbox.fetch = async (url) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('manifest.json')) return { ok: true, status: 200, json: async () => ({ version: 2, entries: audioEntries }) };
    if (u.startsWith('assets/audio/')) sandbox.__fetchedAudio.push(u.replace('assets/audio/', ''));
    return fetchBeforeAudio(url);
  };
  sandbox.Audio = class {
    constructor(src) { this.src = src; this.playbackRate = 1; this.paused = false; sandbox.__audioCreated.push(this); }
    play() { sandbox.__audioPlayed.push(this.src); if (this.onplaying) this.onplaying(); return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  sandbox.__audioCreated = [];
  sandbox.__audioPlayed = [];
  await vm.runInContext('duolibeeLessonAudio.load()', sandbox);
  const audio = vm.runInContext(`
    (function () {
      const out = {};
      out.fileLumpy = duolibeeLessonAudio.fileFor('Kumusta', 'lumpy');
      out.fileLola = duolibeeLessonAudio.fileFor('Kumusta ka?', 'lola-joli');
      out.fileMissing = duolibeeLessonAudio.fileFor('Kumusta', 'lola-joli');
      out.fileUnknown = duolibeeLessonAudio.fileFor('Hindi ito totoo', 'lumpy');
      out.fileEn = duolibeeLessonAudio.fileFor('Thank you', 'lumpy', true);
      out.fileEnWrongLang = duolibeeLessonAudio.fileFor('Thank you', 'lumpy', false);
      out.fileV1 = duolibeeLessonAudio.fileFor('Kumusta ka?', 'lumpy', false);
      __fetchedAudio.length = 0;
      startLesson(1);
      out.preloaded = __fetchedAudio.slice().sort();
      out.hostChar = duolibeeLessonAudio.characterFor('Kumusta');
      const th = THEMES.find(t => t.name === session.category);
      const sent = th.sentences[0];
      out.wordEnChar = duolibeeLessonAudio.characterFor(th.items[0].e);
      out.sentenceTextChar = duolibeeLessonAudio.characterFor(sent.t);
      out.sentenceEnChar = duolibeeLessonAudio.characterFor(sent.e);
      out.sentenceTextSpeaker = sent.speaker;
      const ex = session.exercises.find(e => e.speaker);
      out.hasSentenceSpeaker = !!ex;
      if (ex) { index = session.exercises.indexOf(ex); renderExercise(); out.speakerChar = duolibeeLessonAudio.characterFor('kahit ano'); out.exSpeaker = ex.speaker; }
      index = 0; renderExercise();
      speak('Kumusta');
      out.playedSrc = __audioCreated.length ? __audioCreated[__audioCreated.length - 1].src : null;
      out.playedCount = __audioPlayed.length;
      out.statusAfterFile = document.getElementById('speech-status').textContent;
      duolibeeLessonAudio.play('Kumusta ka?', false, false, 'lola-joli');
      out.lolaSrc = __audioCreated.length ? __audioCreated[__audioCreated.length - 1].src : null;
      duolibeeLessonAudio.play('Thank you', true);
      out.enSrc = __audioCreated.length ? __audioCreated[__audioCreated.length - 1].src : null;
      speak('Kumusta', true);
      out.slowRate = __audioCreated.length ? __audioCreated[__audioCreated.length - 1].playbackRate : null;
      const createdBefore = __audioCreated.length;
      speak('Hindi ito totoo');
      out.fallbackCreatedAudio = __audioCreated.length - createdBefore;
      out.fallbackStatus = document.getElementById('speech-status').textContent;
      // The build sentence's words: a punctuated token finds its stripped
      // file, and tapping it plays that file in the sentence speaker's voice.
      const buildIdx = session.exercises.findIndex(e => e.type === 'build');
      out.buildIdx = buildIdx;
      if (buildIdx >= 0) {
        index = buildIdx; renderExercise();
        out.buildSpeaker = session.exercises[buildIdx].speaker;
        out.buildChar = duolibeeLessonAudio.characterFor(__buildWords[1]);
        duolibeeLessonAudio.play(__buildWords[1], false);
        out.tokenSrc = __audioCreated.length ? __audioCreated[__audioCreated.length - 1].src : null;
      }
      // A word with no clip in the asked-for character falls back to the
      // lesson host's clip instead of the (silent, on a phone) system voice.
      // Playback reuses one shared <audio> element, so the fallback is
      // verified by a play happening (not a new element being created).
      const playedBeforeFallback = __audioPlayed.length;
      duolibeeLessonAudio.play('Kumusta', false, false, 'tita-baby');
      out.fallbackHostPlayed = __audioPlayed.length - playedBeforeFallback;
      out.fallbackHostSrc = __audioCreated.length ? __audioCreated[__audioCreated.length - 1].src : null;
      out.audioElementsCreated = __audioCreated.length;
      out.fileBuildWord = duolibeeLessonAudio.fileFor(__buildWords[1], __buildSpeaker);
      return out;
    })()
  `, sandbox);
  assert.strictEqual(audio.fileLumpy, 'aaa111.mp3', 'manifest lookup by character + phrase');
  assert.strictEqual(audio.fileLola, 'bbb222.mp3', 'manifest lookup for a second character');
  assert.strictEqual(audio.fileMissing, null, 'same phrase, other character has no file');
  assert.strictEqual(audio.fileUnknown, null, 'unknown phrase has no file');
  assert.strictEqual(audio.fileEn, 'ccc333.mp3', 'English lookup uses the en key');
  assert.strictEqual(audio.fileEnWrongLang, null, 'an English entry is not used for Tagalog');
  assert.strictEqual(audio.fileV1, 'ddd444.mp3', 'a v1 manifest key still plays Tagalog');
  assert.strictEqual(audio.sentenceEnChar, audio.sentenceTextSpeaker, 'a sentence translation resolves to its speaker');
  assert.strictEqual(audio.wordEnChar, 'lumpy', 'an English meaning resolves to the lesson host');
  assert.deepStrictEqual(audio.preloaded, ['aaa111.mp3', 'ccc333.mp3', 'ddd444.mp3', 'lesson1buildword2.mp3', 'lesson1sent-en.mp3', 'lesson1sent.mp3', 'lesson1word-en.mp3', 'lesson1word.mp3'], 'lesson start pre-caches its Tagalog + English clips and the build sentence words, got ' + JSON.stringify(audio.preloaded));
  assert.strictEqual(audio.fileBuildWord, 'lesson1buildword2.mp3', 'a punctuated build token finds its stripped word file, got ' + audio.fileBuildWord);
  assert.ok(audio.buildIdx >= 0, 'lesson 1 has a build exercise');
  assert.strictEqual(audio.buildChar, audio.buildSpeaker, 'a build word resolves to the sentence speaker, got ' + audio.buildChar);
  assert.strictEqual(audio.tokenSrc, 'assets/audio/lesson1buildword2.mp3', 'tapping a build word plays its file, got ' + audio.tokenSrc);
  assert.strictEqual(audio.fallbackHostPlayed, 1, 'a missing speaker clip falls back to the host clip instead of the system voice');
  assert.strictEqual(audio.fallbackHostSrc, 'assets/audio/aaa111.mp3', 'the host fallback plays the host file, got ' + audio.fallbackHostSrc);
  assert.strictEqual(audio.audioElementsCreated, 1, 'all recorded clips reuse one shared <audio> element instead of a new one per clip, got ' + audio.audioElementsCreated);
  assert.strictEqual(audio.hostChar, 'lumpy', 'word in lesson 1 uses the host (Lumpy), got ' + audio.hostChar);
  assert.strictEqual(audio.sentenceTextChar, audio.sentenceTextSpeaker, 'a sentence in the theme resolves to its speaker');
  assert.ok(audio.hasSentenceSpeaker, 'lesson 1 has a sentence exercise with a speaker');
  assert.strictEqual(audio.speakerChar, audio.exSpeaker, 'sentence exercise uses its speaker, got ' + audio.speakerChar);
  assert.strictEqual(audio.playedSrc, 'assets/audio/aaa111.mp3', 'speaking a listed phrase plays its file, got ' + audio.playedSrc);
  assert.strictEqual(audio.playedCount, 1, 'the file played exactly once');
  assert.strictEqual(audio.statusAfterFile, 'Playing recorded audio.', 'status reports recorded audio, got ' + audio.statusAfterFile);
  assert.strictEqual(audio.lolaSrc, 'assets/audio/bbb222.mp3', 'explicit character plays that character file, got ' + audio.lolaSrc);
  assert.strictEqual(audio.enSrc, 'assets/audio/ccc333.mp3', 'playing English plays its file, got ' + audio.enSrc);
  assert.strictEqual(audio.slowRate, 0.62, 'slow playback reduces the rate, got ' + audio.slowRate);
  assert.strictEqual(audio.fallbackCreatedAudio, 0, 'an unlisted phrase creates no Audio element');
  assert.strictEqual(audio.fallbackStatus, 'Device speech is unavailable.', 'unlisted phrase falls back to the system voice, got ' + audio.fallbackStatus);
  console.log('LESSON AUDIO: file lookup, English files, v1 back-compat, lesson pre-cache, slow rate, fallback: OK');
  sandbox.fetch = fetchBeforeAudio;

  // ---- Header fraction: one progress number per screen ----
  // The header counts graded questions only, out of the fixed graded
  // total: the learn screen shows no fraction (it is not a question),
  // and a retry shows the same question number as the original, so the
  // total never grows. Runs last, revisiting lesson 1 after it completed,
  // so it cannot disturb the SRS/review assertions above; the retry is
  // rendered directly (index jump) rather than walked to, since walking
  // would need the match buttons, whose disabled state the vm's
  // getElementById stub carries over from the earlier play-through.
  const header = vm.runInContext(`
    (function () {
      const grab = () => {
        const m = app.innerHTML.match(/<\\/strong> • (\\d+)\\/(\\d+)/);
        return m ? m[1] + '/' + m[2] : null;
      };
      const answerWrong = (e) => {
        if (e.type === 'choice') answerChoice((e.answer + 1) % e.options.length);
        else if (e.type === 'translate') { document.getElementById('answer').value = 'maling sagot'; answerTranslate(); }
        else if (e.type === 'reverse') { document.getElementById('answer').value = 'maling sagot'; answerReverse(); }
        else if (e.type === 'audio') answerAudio((e.options.indexOf(e.item.e) + 1) % e.options.length);
        else if (e.type === 'match') { pickMatch('L', 0); pickMatch('R', (session.mR.indexOf(e.pairs[0].e) + 1) % e.pairs.length); }
        else if (e.type === 'build') { const words = e.answer.split(' '); const used = new Set(); session.built = words.map((w) => { const j = session.bank.findIndex((b, k) => b === w && !used.has(k)); used.add(j); return j; }).reverse(); checkBuild(); }
        else if (e.type === 'speak') { session.speakHeard = 'maling sagot'; checkSpeaking(); }
      };
      const out = {};
      startLesson(1);
      out.learn = grab();
      next();
      out.first = grab();
      const wrongOrigin = session.exercises[index]._origin;
      answerWrong(session.exercises[index]);
      // The retry is queued at the end of the lesson; render it directly.
      // (Walking there exercise-by-exercise would need the match buttons,
      // whose disabled state the vm's getElementById stub carries over
      // from the earlier play-through; in a real browser renderExercise
      // rebuilds them fresh.)
      index = session.exercises.length - 1;
      renderExercise();
      out.retry = grab();
      out.retryIsRetry = !!session.exercises[index]._retry;
      out.retryOriginMatches = session.exercises[index]._origin === wrongOrigin;
      return out;
    })()
  `, sandbox);
  assert.strictEqual(header.learn, null, 'learn screen header has no fraction, got ' + header.learn);
  assert.strictEqual(header.first, '1/7', 'first graded exercise header is 1/7, got ' + header.first);
  assert.strictEqual(header.retryIsRetry, true, 'rendered the retry exercise');
  assert.strictEqual(header.retryOriginMatches, true, 'the retry is the same question as the one answered wrong');
  assert.strictEqual(header.retry, '1/7', 'retry shows the same question number and total, got ' + header.retry);
  console.log('HEADER: learn screen has no fraction; first graded 1/7; retry still 1/7: OK');

  console.log('FULL-CHAIN: PASS');
  process.exit(0); // scripts register intervals; exit explicitly on success
  if (loadFailures.length) console.log('note: some non-core scripts failed to load in the vm:', loadFailures.join(' | '));
})().catch((e) => { console.error('FULL-CHAIN: FAIL', e); process.exit(1); });
