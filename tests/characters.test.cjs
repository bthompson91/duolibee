// Character layer: host/intro/speaker flow from data/lessons.json through
// buildLessons into a played lesson, plus the characters.js render +
// talking-animation helpers. Loads the repo's scripts in index.html order
// in a vm with DOM stubs (same harness shape as srs-speaking.test.cjs).
// Run from the repo root: node tests/characters.test.cjs
// (REPO env var overrides the default repo path.)
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const REPO = process.env.REPO || path.join(__dirname, '..');
const lessonsData = JSON.parse(fs.readFileSync(path.join(REPO, 'data/lessons.json'), 'utf8'));
const charactersData = JSON.parse(fs.readFileSync(path.join(REPO, 'data/characters.json'), 'utf8'));

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
    if (u.includes('characters.json')) return { ok: true, status: 200, json: async () => charactersData };
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
assert.ok(!loadFailures.length, 'all scripts must load, failures: ' + loadFailures.join(' | '));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // boot() is async (fetch lessons); give it a few ticks
  for (let i = 0; i < 20 && !vm.runInContext('typeof LESSONS !== "undefined" && LESSONS.length', sandbox); i++) {
    await sleep(25);
  }
  assert.strictEqual(vm.runInContext('LESSONS.length', sandbox), 100, '100 lessons');

  // Registry must load (the fetch stub serves the real characters.json).
  await vm.runInContext('window.duolibeeCharacters.ready', sandbox);
  const registry = vm.runInContext('window.duolibeeCharacters.registry()', sandbox);
  assert.ok(registry, 'registry loaded');
  assert.strictEqual(registry.characters.length, 6, 'six characters in the registry');
  const regIds = registry.characters.map((c) => c.id).sort();
  assert.deepStrictEqual(regIds, ['ate-crystal', 'jetjet', 'lola-joli', 'lumpy', 'tita-baby', 'tito-bong'], 'registry ids');
  console.log('1. registry loads with all six characters: OK');

  // Every art file the registry names must exist in the repo, downscaled.
  const artPaths = [];
  for (const c of registry.characters) {
    if (c.portrait) artPaths.push(c.portrait);
    for (const st of Object.values(c.states || {})) {
      if (st.closed) artPaths.push(st.closed);
      if (st.open) artPaths.push(st.open);
    }
    for (const f of Object.values(c.expressions || {})) artPaths.push(f);
  }
  assert.ok(artPaths.length >= 42, 'registry names at least 42 art files, got ' + artPaths.length);
  for (const p of new Set(artPaths)) {
    assert.ok(fs.existsSync(path.join(REPO, p)), 'art file exists in repo: ' + p);
    const dims = (() => { const b = fs.readFileSync(path.join(REPO, p)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; })();
    assert.ok(Math.max(dims.w, dims.h) <= 512, p + ' downscaled to <=512px, got ' + dims.w + 'x' + dims.h);
  }
  console.log('2. all ' + new Set(artPaths).size + ' registry art files exist and are <=512px: OK');

  // Every host and speaker id in the lesson data must be in the registry.
  const dataInfo = vm.runInContext(`
    (function () {
      const out = { hosts: {}, intros: {}, badHosts: [], badSpeakers: [], lessonsWithoutHost: 0, lessonsWithoutIntro: 0 };
      LESSONS.forEach(l => {
        if (!l.host) out.lessonsWithoutHost++;
        else out.hosts[l.host] = (out.hosts[l.host] || 0) + 1;
        if (!l.intro) out.lessonsWithoutIntro++;
        else out.intros[l.host] = l.intro;
      });
      THEMES.forEach(th => (th.sentences || []).forEach(s => {
        if (!s.speaker) out.badSpeakers.push(th.name + ': missing speaker');
      }));
      return out;
    })()
  `, sandbox);
  assert.strictEqual(dataInfo.lessonsWithoutHost, 0, 'every lesson has a host');
  assert.strictEqual(dataInfo.lessonsWithoutIntro, 0, 'every lesson has an intro');
  assert.strictEqual(dataInfo.badSpeakers.length, 0, 'every sentence has a speaker: ' + dataInfo.badSpeakers.join('; '));
  for (const id of Object.keys(dataInfo.hosts)) {
    assert.ok(regIds.includes(id), 'host id in registry: ' + id);
  }
  for (const id of Object.keys(dataInfo.intros)) {
    assert.ok(typeof dataInfo.intros[id] === 'string' && dataInfo.intros[id].length > 10, 'intro text for ' + id);
  }
  console.log('3. all 100 lessons carry a host + intro; all 75 sentences a speaker: OK');

  // Sentence exercises carry the speaker of the sentence they use, by the
  // rotation: build -> sentences[(id-1)%3], speak1 -> sentences[id%3],
  // speak2 (lessons 31+) -> sentences[(id+1)%3].
  const rotation = vm.runInContext(`
    (function () {
      const out = { bad: [] };
      const byTheme = {};
      THEMES.forEach(th => { byTheme[th.name] = th.sentences; });
      [1, 2, 3, 31, 100].forEach(id => {
        const l = LESSONS.find(x => x.id === id);
        const s = byTheme[l.category];
        const build = l.exercises.find(e => e.type === 'build');
        const speaks = l.exercises.filter(e => e.sentence);
        if (!build || build.speaker !== s[(id - 1) % s.length].speaker) out.bad.push('lesson ' + id + ' build speaker');
        if (!speaks[0] || speaks[0].speaker !== s[id % s.length].speaker) out.bad.push('lesson ' + id + ' speak1 speaker');
        if (id >= 31 && (!speaks[1] || speaks[1].speaker !== s[(id + 1) % s.length].speaker)) out.bad.push('lesson ' + id + ' speak2 speaker');
      });
      // every build and sentence speak in every lesson has a speaker; word speaks do not
      LESSONS.forEach(l => l.exercises.forEach(e => {
        if ((e.type === 'build' || e.sentence) && !e.speaker) out.bad.push('lesson ' + l.id + ' ' + e.type + ' missing speaker');
        if (e.type === 'speak' && !e.sentence && e.speaker) out.bad.push('lesson ' + l.id + ' word speak must not have a speaker');
      }));
      return out;
    })()
  `, sandbox);
  assert.strictEqual(rotation.bad.length, 0, 'speaker rotation: ' + rotation.bad.join('; '));
  console.log('4. build/speak1/speak2 carry the right sentence speaker (rotation checked): OK');

  // Render: the learn screen shows the host card (portrait, name, intro),
  // and a sentence exercise shows its speaker card. Capture the card the
  // wrapper prepends to by pointing app.querySelector at a fake card.
  const captured = new El('section');
  sandbox.__captured = captured;
  appEl.querySelector = () => captured;
  const render = vm.runInContext(`
    (function () {
      const out = {};
      startLesson(1);
      const lesson = session;
      out.hostHtml = __captured.children[0] ? __captured.children[0].innerHTML : '';
      out.host = lesson.host;
      out.intro = lesson.intro;
      const buildIdx = session.exercises.findIndex(e => e.type === 'build');
      index = buildIdx; renderExercise();
      out.speakerHtml = __captured.children[0] ? __captured.children[0].innerHTML : '';
      out.speaker = session.exercises[buildIdx].speaker;
      return out;
    })()
  `, sandbox);
  assert.ok(render.hostHtml.includes('host-portrait'), 'learn screen has a host portrait');
  assert.ok(render.hostHtml.includes('Lumpy'), 'learn screen names the host (lesson 1 host is Lumpy)');
  const escIntroStart = vm.runInContext('esc(' + JSON.stringify(render.intro.slice(0, 20)) + ')', sandbox);
  assert.ok(render.hostHtml.includes(escIntroStart), 'learn screen shows the intro line');
  assert.ok(render.hostHtml.includes('assets/characters/lumpy-welcome.png'), 'host portrait art path present');
  assert.ok(render.speakerHtml.includes('speaker-portrait'), 'sentence exercise has a speaker portrait');
  assert.ok(render.speakerHtml.includes('Lumpy'), 'speaker card names the speaker');
  assert.ok(render.speakerHtml.includes('assets/characters/lumpy-welcome.png'), 'speaker portrait art path present');
  console.log('5. learn screen shows host card; build exercise shows speaker card: OK');

  // The speak fallback keeps the speaker (and _origin/_retry) when a
  // sentence speak becomes a written question.
  const fallback = vm.runInContext(`
    (function () {
      startLesson(1);
      const idx = session.exercises.findIndex(e => e.type === 'speak' && e.sentence);
      index = idx; renderExercise();
      const before = session.exercises[idx];
      const speaker = before.speaker, origin = before._origin, keys = JSON.stringify(before.srsKeys);
      replaceSpeakWithChoice();
      const ex = session.exercises[idx];
      return { type: ex.type, speaker: ex.speaker, keptSpeaker: ex.speaker === speaker, keptOrigin: ex._origin === origin, keptKeys: JSON.stringify(ex.srsKeys) === keys };
    })()
  `, sandbox);
  assert.strictEqual(fallback.type, 'translate', 'sentence speak falls back to a translate question');
  assert.strictEqual(fallback.keptSpeaker, true, 'fallback must keep the speaker');
  assert.strictEqual(fallback.keptOrigin, true, 'fallback must keep _origin');
  assert.strictEqual(fallback.keptKeys, true, 'fallback must keep srsKeys');
  console.log('6. speak fallback keeps speaker + _origin + srsKeys: OK');

  // Talking animation: mouth alternates while speaking, settles on closed.
  const anim = await (async () => {
    const seen = [];
    const img = vm.runInContext(`(function () { const img = document.createElement('img'); return img; })()`, sandbox);
    vm.runInContext('window.__animImg = null;', sandbox);
    // drive the animation directly with a short interval and sample src
    const started = vm.runInContext(`
      (function () {
        window.__animImg = document.createElement('img');
        return window.duolibeeCharacters.startTalking(window.__animImg, 'tito-bong', 'happy', 30);
      })()
    `, sandbox);
    assert.strictEqual(started, true, 'animation starts for a known character with both frames');
    for (let i = 0; i < 8; i++) {
      await sleep(25);
      seen.push(vm.runInContext('window.__animImg.src', sandbox));
    }
    vm.runInContext('window.duolibeeCharacters.stopTalking()', sandbox);
    const settled = vm.runInContext('window.__animImg.src', sandbox);
    return { seen, settled };
  })();
  assert.ok(anim.seen.includes('assets/characters/tito-bong-happy-open.png'), 'mouth opens during animation, saw: ' + [...new Set(anim.seen)].join(', '));
  assert.ok(anim.seen.includes('assets/characters/tito-bong-happy-closed.png'), 'mouth closes during animation');
  assert.strictEqual(anim.settled, 'assets/characters/tito-bong-happy-closed.png', 'animation settles on mouth-closed');
  console.log('7. talking animation alternates mouth open/closed and settles closed: OK');

  // Unknown character / missing art: no throw, no animation. Reduced
  // motion: no animation.
  const edge = vm.runInContext(`
    (function () {
      const out = {};
      const img = document.createElement('img');
      out.unknown = window.duolibeeCharacters.startTalking(img, 'no-such-character', 'happy', 30);
      window.duolibeeCharacters.stopTalking();
      const before = img.src;
      out.unknownSrcUnchanged = img.src === before;
      window.matchMedia = () => ({ matches: true });
      out.reduced = window.duolibeeCharacters.startTalking(img, 'tito-bong', 'happy', 30);
      out.reducedIdle = window.duolibeeCharacters.startIdle(img, 'tito-bong', 'happy');
      window.duolibeeCharacters.stopTalking();
      delete window.matchMedia;
      out.reducedSrcUnchanged = img.src === before;
      return out;
    })()
  `, sandbox);
  assert.strictEqual(edge.unknown, false, 'unknown character does not animate');
  assert.strictEqual(edge.unknownSrcUnchanged, true, 'unknown character leaves src alone');
  assert.strictEqual(edge.reduced, false, 'reduced motion does not animate');
  assert.strictEqual(edge.reducedIdle, false, 'reduced motion does not idle-animate');
  assert.strictEqual(edge.reducedSrcUnchanged, true, 'reduced motion leaves src alone');
  console.log('8. unknown character and reduced motion degrade silently: OK');

  // Speech hooks: duolibeeSpeechStart animates the on-screen speaker
  // portrait at talking speed; duolibeeSpeechEnd drops back to the idle
  // sway (the mouth keeps moving, slower) instead of stopping.
  const hookSeen = [];
  vm.runInContext(`
    (function () {
      const img = document.getElementById('speaker-portrait');
      img.dataset.character = 'jetjet';
      img.dataset.state = 'happy';
      window.duolibeeSpeechStart();
    })()
  `, sandbox);
  for (let i = 0; i < 10; i++) {
    await sleep(40);
    hookSeen.push(vm.runInContext(`document.getElementById('speaker-portrait').src`, sandbox));
  }
  vm.runInContext('window.duolibeeSpeechEnd()', sandbox);
  const hookIdleSeen = [];
  for (let i = 0; i < 30; i++) {
    await sleep(40);
    hookIdleSeen.push(vm.runInContext(`document.getElementById('speaker-portrait').src`, sandbox));
  }
  vm.runInContext('window.duolibeeCharacters.stopTalking()', sandbox);
  assert.ok(hookSeen.includes('assets/characters/jetjet-happy-open.png'), 'speech start animates the speaker portrait, saw: ' + [...new Set(hookSeen)].join(', '));
  assert.ok(hookIdleSeen.includes('assets/characters/jetjet-happy-open.png'), 'speech end returns to the idle sway, saw: ' + [...new Set(hookIdleSeen)].join(', '));
  console.log('9. speech start drives the speaker portrait; speech end returns to idle: OK');

  // A full lesson still completes with the character layer on.
  for (const el of byId.values()) el.disabled = false;
  const played = vm.runInContext(`
    (function () {
      startLesson(1);
      let steps = 0;
      while (steps++ < 40) {
        const ex = session.exercises[index];
        if (!ex || index >= session.exercises.length) break;
        if (ex.type === 'learn') { next(); continue; }
        if (ex.type === 'choice') answerChoice(ex.answer);
        else if (ex.type === 'translate') { document.getElementById('answer').value = ex.item.t; answerTranslate(); }
        else if (ex.type === 'reverse') { document.getElementById('answer').value = ex.item.e.split('/')[0].trim(); answerReverse(); }
        else if (ex.type === 'match') {
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
        } else if (ex.type === 'audio') answerAudio(ex.options.indexOf(ex.item.e));
        else if (ex.type === 'speak') { session.speakHeard = ex.item.t; checkSpeaking(); }
        next();
        if (app.innerHTML.includes('Session complete')) break;
      }
      return { steps, completed: !!state.completed[1] };
    })()
  `, sandbox);
  assert.ok(played.completed, 'lesson 1 completes with the character layer active, steps: ' + played.steps);
  console.log('10. lesson 1 plays through and completes with characters on: OK');

  // Speech start animates the host portrait when no speaker portrait is
  // on screen (learn screen and the compact host strip). The speaker
  // lookup is suppressed for this check so the host fallback is exercised.
  const hostSeen = [];
  vm.runInContext(`
    (function () {
      const origGet = document.getElementById;
      document.getElementById = (id) => (id === 'speaker-portrait' ? null : origGet(id));
      const img = document.getElementById('host-portrait');
      img.dataset.character = 'lumpy';
      img.dataset.state = 'neutral';
      window.duolibeeSpeechStart();
      document.getElementById = origGet;
    })()
  `, sandbox);
  for (let i = 0; i < 10; i++) {
    await sleep(40);
    hostSeen.push(vm.runInContext(`document.getElementById('host-portrait').src`, sandbox));
  }
  // Speech end must return the host portrait to idle, not stop it: the
  // speaker lookup is suppressed again so backToIdle finds the host.
  vm.runInContext(`
    (function () {
      const origGet = document.getElementById;
      document.getElementById = (id) => (id === 'speaker-portrait' ? null : origGet(id));
      window.duolibeeSpeechEnd();
      document.getElementById = origGet;
    })()
  `, sandbox);
  const hostIdleSeen = [];
  for (let i = 0; i < 30; i++) {
    await sleep(40);
    hostIdleSeen.push(vm.runInContext(`document.getElementById('host-portrait').src`, sandbox));
  }
  vm.runInContext('window.duolibeeCharacters.stopTalking()', sandbox);
  assert.ok(hostSeen.includes('assets/characters/lumpy-neutral-open.png'), 'speech start animates the host portrait, saw: ' + [...new Set(hostSeen)].join(', '));
  assert.ok(hostIdleSeen.includes('assets/characters/lumpy-neutral-open.png'), 'speech end returns the host portrait to idle, saw: ' + [...new Set(hostIdleSeen)].join(', '));
  console.log('11. speech start drives the host portrait when no speaker portrait is present; speech end returns to idle: OK');

  // Every exercise without a speaker card shows a compact host strip
  // (portrait + name, no intro), so speech always has a portrait to
  // animate. Choice exercises have no speaker.
  const strip = vm.runInContext(`
    (function () {
      startLesson(1);
      const idx = session.exercises.findIndex(e => e.type === 'choice');
      index = idx; renderExercise();
      return __captured.children[0] ? __captured.children[0].innerHTML : '';
    })()
  `, sandbox);
  assert.ok(strip.includes('host-portrait'), 'choice exercise shows a host portrait');
  assert.ok(strip.includes('Lumpy'), 'choice exercise names the lesson host');
  assert.ok(strip.includes('assets/characters/lumpy-welcome.png'), 'choice exercise host portrait art path present');
  assert.ok(!strip.includes(escIntroStart), 'compact host strip has no intro text');
  console.log('12. choice exercise shows a compact host strip (portrait, no intro): OK');

  // play() starts the talking animation at speak time, even when the
  // utterance onstart event never fires (iOS drops it): the portrait
  // must move while the line plays, and drop back to idle when onend fires.
  const playSeen = [];
  const playIdleSeen = await (async () => {
    vm.runInContext(`
      (function () {
        SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        window.__spoken = [];
        speechSynthesis = {
          getVoices: () => [{ lang: 'fil-PH', default: true, name: 'Test Filipino' }],
          cancel() {}, resume() {},
          speak(u) { window.__spoken.push(u); },
        };
        const img = document.getElementById('speaker-portrait');
        img.dataset.character = 'jetjet';
        img.dataset.state = 'happy';
        speak('kumusta');
      })()
    `, sandbox);
    for (let i = 0; i < 10; i++) {
      await sleep(40);
      playSeen.push(vm.runInContext(`document.getElementById('speaker-portrait').src`, sandbox));
    }
    // No onstart was ever fired by the stub. Fire onend by hand.
    vm.runInContext(`(function () { const u = window.__spoken[0]; if (u && u.onend) u.onend(); })()`, sandbox);
    const idleSeen = [];
    for (let i = 0; i < 30; i++) {
      await sleep(40);
      idleSeen.push(vm.runInContext(`document.getElementById('speaker-portrait').src`, sandbox));
    }
    vm.runInContext(`window.duolibeeCharacters.stopTalking(); speechSynthesis = undefined;`, sandbox);
    return idleSeen;
  })();
  assert.ok(playSeen.includes('assets/characters/jetjet-happy-open.png'), 'play() animates the portrait without any onstart event, saw: ' + [...new Set(playSeen)].join(', '));
  assert.ok(playIdleSeen.includes('assets/characters/jetjet-happy-open.png'), 'onend returns the portrait to idle, saw: ' + [...new Set(playIdleSeen)].join(', '));
  console.log('13. play() starts the animation without onstart; onend returns to idle: OK');

  // Idle sway with no speech at all: rendering a choice exercise starts
  // the host portrait moving on its own — no duolibeeSpeechStart call.
  // The speaker lookup is suppressed (as in step 11) so the host strip
  // is the portrait the wrapper idles, matching the real app where no
  // speaker card is on screen for a choice exercise.
  const idleSeen = [];
  vm.runInContext(`
    (function () {
      const origGet = document.getElementById;
      document.getElementById = (id) => (id === 'speaker-portrait' ? null : origGet(id));
      const img = document.getElementById('host-portrait');
      img.dataset.character = 'lumpy';
      img.dataset.state = 'neutral';
      startLesson(1);
      const idx = session.exercises.findIndex(e => e.type === 'choice');
      index = idx; renderExercise();
      document.getElementById = origGet;
    })()
  `, sandbox);
  for (let i = 0; i < 30; i++) {
    await sleep(40);
    idleSeen.push(vm.runInContext(`document.getElementById('host-portrait').src`, sandbox));
  }
  vm.runInContext('window.duolibeeCharacters.stopTalking()', sandbox);
  assert.ok(idleSeen.includes('assets/characters/lumpy-neutral-open.png'), 'host portrait idles with no speech, saw: ' + [...new Set(idleSeen)].join(', '));
  assert.ok(idleSeen.includes('assets/characters/lumpy-neutral-closed.png'), 'idle sway also closes the mouth');
  console.log('14. host portrait idles with no speech: OK');

  console.log('CHARACTERS: PASS');
  process.exit(0);
})().catch((e) => { console.error('CHARACTERS: FAIL', e); process.exit(1); });
