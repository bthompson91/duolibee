// Lesson music test: the OPM lofi loop starts with a lesson, ducks for
// listening/speaking and while speech plays, respects mute and the
// Settings toggle, and stops on home. The Web Audio API is mocked so the
// scheduled notes and gains can be asserted. Run from the repo root:
// node <this file>
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
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
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

// Mock Web Audio: records every oscillator start (type + frequency) and
// every master-gain target, so the loop and the ducking can be asserted.
const musicLog = { oscs: [], gains: [], buffers: 0 };
let mockTime = 0;
// Controllable clock: lesson-music.js uses Date.now() for the speech
// lease, so the test can fast-forward past it.
let mockNow = 1000000;
const RealDate = Date;
function MockDate(...args) { return new RealDate(...args); }
MockDate.now = () => mockNow;
MockDate.parse = RealDate.parse;
MockDate.UTC = RealDate.UTC;
MockDate.prototype = RealDate.prototype;
// Controllable randomness: lesson-music.js picks a style with
// Math.random(), so the test can force which style a lesson gets.
let mockRandom = 0;
const sandboxMath = Object.create(Math);
sandboxMath.random = () => mockRandom;
class MockParam {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(v) { this.value = v; this.events.push(['set', v]); }
  linearRampToValueAtTime(v) { this.value = v; this.events.push(['lin', v]); }
  exponentialRampToValueAtTime(v) { this.value = v; this.events.push(['exp', v]); }
  setTargetAtTime(v) { this.value = v; this.events.push(['target', v]); }
}
class MockNode {
  constructor(kind) { this.kind = kind; this.frequency = new MockParam(); this.gain = new MockParam(); this.Q = new MockParam(); this.type = ''; this.buffer = null; this.loop = false; }
  connect() { return this; }
  start() {
    if (this.kind === 'osc') musicLog.oscs.push({ type: this.type, freq: this.frequency.value });
  }
  stop() {}
  close() {}
}
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new MockNode('dest');
    this._master = null;
  }
  get currentTime() { return mockTime; }
  resume() { return Promise.resolve(); }
  createGain() { const g = new MockNode('gain'); return g; }
  createOscillator() { return new MockNode('osc'); }
  createBiquadFilter() { return new MockNode('filter'); }
  createBufferSource() { return new MockNode('src'); }
  createBuffer(channels, len) {
    musicLog.buffers++;
    return { getChannelData: () => new Float32Array(len), length: len, numberOfChannels: channels };
  }
  close() { return Promise.resolve(); }
}
// Tag the master gain so the test can read its target: lesson-music.js
// connects it to ctx.destination, so capture it there.
const origCreateGain = MockAudioContext.prototype.createGain;

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  URL, URLSearchParams, Blob,
  Math: sandboxMath, JSON, Object, Array, Promise, Error, RegExp, Date: MockDate,
  document: {
    getElementById: (id) => (id === 'app' ? appEl : getEl(id)),
    createElement: (tag) => new El(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
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
  crypto: { randomUUID: () => 'test-uuid-' + Math.floor(Math.random() * 1e9) },
  alert: () => {}, confirm: () => true,
  addEventListener: () => {}, removeEventListener: () => {},
  scrollTo: () => {}, scroll: () => {},
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
  fetch: async (url) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('lessons.json')) return { ok: true, status: 200, json: async () => lessonsData };
    return { ok: false, status: 404, json: async () => ({}) };
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.__musicLog = musicLog;
vm.createContext(sandbox);

const order = [
  'pronunciation.js', 'app.js', 'classic-rhymes.js', 'speech-routing.js',
  'learning-flow.js', 'category-generator.js', 'lesson-progression.js',
  'sentence-builder.js', 'answer-speech.js', 'global-mute.js', 'sound-effects.js',
  'release-notes.js', 'mascots.js', 'review-core.js', 'daily-crossword.js',
  'daily-progress.js', 'lesson-retries.js', 'cloud-save.js', 'translation.js',
  'review-conversations.js', 'lesson-numbering.js', 'webpage-update.js',
  'chat-notifications.js', 'speaking.js', 'characters.js', 'whisper.js',
  'lesson-music.js',
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

(async () => {
  for (let i = 0; i < 20 && !vm.runInContext('typeof LESSONS !== "undefined" && LESSONS.length', sandbox); i++) await sleep(50);
  assert.ok(vm.runInContext('LESSONS.length', sandbox) > 0, 'lessons must load');
  assert.ok(vm.runInContext('typeof window.duolibeeMusic !== "undefined"', sandbox), 'lesson-music.js must expose window.duolibeeMusic');

  // Music is on by default (no setting stored yet).
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0, 'no lesson yet, so the gain must be 0');

  // Start lesson 1. The first graded exercise is a choice (not audio /
  // speak), so the music plays at full volume. Advance mock time so the
  // scheduler's lookahead can fire, then let the interval tick.
  vm.runInContext('startLesson(1)', sandbox);
  mockTime = 0.5;
  await sleep(250);
  // mockRandom is 0, so lesson 1 picks the OPM lofi style: the chord
  // progression is the OPM I-vi-IV-V: Cmaj7, Am7, Fmaj7, G7.
  // (JSON round-trip: vm arrays carry the vm's Array prototype, which
  // deepStrictEqual rejects.)
  const chords = JSON.parse(JSON.stringify(vm.runInContext('window.duolibeeMusic.chords', sandbox)));
  console.log('chords:', JSON.stringify(chords));
  assert.deepStrictEqual(chords, ['Cmaj7', 'Am7', 'Fmaj7', 'G7'], 'the loop must be the OPM I-vi-IV-V');
  const playing = vm.runInContext(`
    (function () {
      return { playing: window.duolibeeMusic.playing, gain: window.duolibeeMusic.gain, type: session.exercises[index].type };
    })()
  `, sandbox);
  console.log('lesson started:', JSON.stringify(playing));
  assert.strictEqual(playing.playing, true, 'music must be playing during a lesson');
  assert.strictEqual(playing.gain, 0.12, 'a choice exercise must play at full volume, got ' + playing.gain);
  assert.ok(musicLog.oscs.length > 0, 'the scheduler must have started oscillators, got ' + musicLog.oscs.length);
  // The first bar is Cmaj7: the pad must include C4, E4, G4, B4.
  const padFreqs = musicLog.oscs.filter((o) => o.type === 'triangle').map((o) => Math.round(o.freq * 100) / 100);
  for (const m of [60, 64, 67, 71]) {
    assert.ok(padFreqs.some((f) => Math.abs(f - freq(m)) < 0.5), 'the Cmaj7 pad must include midi ' + m + ' (' + freq(m).toFixed(2) + ' Hz), got: ' + JSON.stringify(padFreqs.slice(0, 12)));
  }

  // Move to an audio exercise: the music must duck.
  vm.runInContext(`
    (function () {
      const idx = session.exercises.findIndex((e) => e.type === 'audio');
      index = idx; renderExercise();
    })()
  `, sandbox);
  await sleep(150);
  const audioGain = vm.runInContext('window.duolibeeMusic.gain', sandbox);
  console.log('audio exercise gain:', audioGain);
  assert.strictEqual(audioGain, 0.02, 'an audio exercise must duck the music, got ' + audioGain);

  // And a speaking exercise: still ducked.
  vm.runInContext(`
    (function () {
      const idx = session.exercises.findIndex((e) => e.type === 'speak');
      index = idx; renderExercise();
    })()
  `, sandbox);
  await sleep(150);
  const speakGain = vm.runInContext('window.duolibeeMusic.gain', sandbox);
  console.log('speak exercise gain:', speakGain);
  assert.strictEqual(speakGain, 0.02, 'a speaking exercise must duck the music, got ' + speakGain);

  // Back to a choice exercise: full volume again.
  vm.runInContext(`
    (function () {
      const idx = session.exercises.findIndex((e) => e.type === 'choice');
      index = idx; renderExercise();
    })()
  `, sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.12, 'a choice exercise must restore full volume');

  // Speech playback ducks the music even on a choice exercise, and
  // restores it when the clip ends.
  vm.runInContext('window.duolibeeSpeechStart()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.02, 'speech playback must duck the music');
  vm.runInContext('window.duolibeeSpeechEnd()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.12, 'speech end must restore the music');

  // A lost speech-end event must not leave the music ducked forever.
  // iOS often never fires the utterance onend, and pausing a clip never
  // fires onended, so if the end hook is lost the music must recover
  // on its own once the clip could not still be playing.
  vm.runInContext('window.duolibeeSpeechStart()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.02, 'speech start must duck the music');
  // No SpeechEnd call: the end event is lost. Fast-forward past the
  // 15s lease and the music must come back up on its own.
  mockNow += 16000;
  vm.runInContext('window.duolibeeMusic.updateMusic()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.12, 'a stale speech duck must clear after the lease so the music comes back up');
  // And a fresh clip still ducks (the lease only clears stale state).
  vm.runInContext('window.duolibeeSpeechStart()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.02, 'a new clip must duck again');
  vm.runInContext('window.duolibeeSpeechEnd()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.12, 'speech end must restore the music after the lease test');

  // The global mute silences the music, and unmuting restores it.
  vm.runInContext('state.settings.muted = true; window.duolibeeMusic.updateMusic()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0, 'mute must silence the music');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), false, 'mute must report not playing');
  vm.runInContext('state.settings.muted = false; window.duolibeeMusic.updateMusic()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.12, 'unmute must restore the music');

  // The Settings toggle turns it off and on.
  vm.runInContext('window.setMusicEnabled(false)', sandbox);
  assert.strictEqual(vm.runInContext('state.settings.music', sandbox), false, 'turning music off must save the setting');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0, 'turning music off must silence it');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), false, 'turning music off must report not playing');
  vm.runInContext('window.setMusicEnabled(true)', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.gain', sandbox), 0.12, 'turning music on must restore it during a lesson');

  // Going home stops the music.
  vm.runInContext(`go('home')`, sandbox);
  await sleep(150);
  const home = vm.runInContext(`
    (function () { return { playing: window.duolibeeMusic.playing, gain: window.duolibeeMusic.gain }; })()
  `, sandbox);
  console.log('home:', JSON.stringify(home));
  assert.strictEqual(home.playing, false, 'music must stop on home');
  assert.strictEqual(home.gain, 0, 'music gain must be 0 on home');

  // Five styles, and one is picked at random each time a lesson
  // starts. mockRandom forces the pick, so the rotation is exact.
  // (Lesson 2 is locked in a fresh profile, so the rotation is proven
  // by replaying lesson 1 — a fresh start picks again.)
  const styles = JSON.parse(JSON.stringify(vm.runInContext('window.duolibeeMusic.styles', sandbox)));
  console.log('styles:', JSON.stringify(styles));
  assert.deepStrictEqual(styles, ['OPM lofi', 'Bossa café', 'Dreamy ambient', 'City pop', 'Rainy jazz'], 'there must be five styles');
  mockRandom = 0; // style 0: OPM lofi
  vm.runInContext('startLesson(1)', sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.style', sandbox), 'OPM lofi', 'mockRandom 0 must pick OPM lofi');
  vm.runInContext(`go('home')`, sandbox);
  mockRandom = 0.99; // style 4: Rainy jazz
  vm.runInContext('startLesson(1)', sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.style', sandbox), 'Rainy jazz', 'mockRandom 0.99 must pick Rainy jazz on a fresh start');
  // Re-rendering the same first exercise must not re-pick the style.
  vm.runInContext('renderExercise()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.style', sandbox), 'Rainy jazz', 'a re-render must not change the style mid-lesson');

  console.log('LESSON MUSIC: PASS');
  process.exit(0);
})().catch((e) => { console.error('LESSON MUSIC: FAIL', e); process.exit(1); });
