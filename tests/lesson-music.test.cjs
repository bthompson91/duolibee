// Lesson music test: each lesson plays its host character's track
// (an MP3 in assets/music/), looped, and it ducks for listening /
// speaking and while speech plays, respects mute and the Settings
// toggle, and stops on home. A session with no host (review) falls
// back to Lumpy's track. Settings also has a Character music preview:
// each character's track can be heard without starting a lesson. If
// a track fails to load, the lesson goes on silently. The <audio>
// element is mocked so src, loop, volume and play/pause can be
// asserted. Run from the repo root:
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

// Mock <audio>: records src, volume, loop and play/pause, so file
// playback can be asserted. answer-speech.js also uses new Audio()
// for its shared clip element, so the mock must support the
// properties it touches (playbackRate, onplaying, onended, onerror).
class MockAudio {
  constructor() {
    this._src = '';
    this.volume = 0;
    this.loop = false;
    this.preload = '';
    this.playbackRate = 1;
    this.currentTime = 0;
    this.paused = true;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
    this._listeners = {};
  }
  set src(v) { this._src = String(v); }
  get src() { return this._src; }
  play() { this.playCalls++; this.paused = false; return Promise.resolve(); }
  pause() { this.pauseCalls++; this.paused = true; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() {}
  _fire(type) {
    (this._listeners[type] || []).forEach((fn) => { try { fn({ type }); } catch (e) {} });
    if (type === 'error' && typeof this.onerror === 'function') { try { this.onerror({ type }); } catch (e) {} }
  }
}
// Controllable clock: lesson-music.js uses Date.now() for the speech
// lease, so the test can fast-forward past it.
let mockNow = 1000000;
const RealDate = Date;
function MockDate(...args) { return new RealDate(...args); }
MockDate.now = () => mockNow;
MockDate.parse = RealDate.parse;
MockDate.UTC = RealDate.UTC;
MockDate.prototype = RealDate.prototype;
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
  start() {}
  stop() {}
  close() {}
}
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new MockNode('dest');
  }
  get currentTime() { return 0; }
  resume() { return Promise.resolve(); }
  createGain() { return new MockNode('gain'); }
  createOscillator() { return new MockNode('osc'); }
  createBiquadFilter() { return new MockNode('filter'); }
  createBufferSource() { return new MockNode('src'); }
  createBuffer(channels, len) {
    return { getChannelData: () => new Float32Array(len), length: len, numberOfChannels: channels };
  }
  close() { return Promise.resolve(); }
}

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  URL, URLSearchParams, Blob,
  Math, JSON, Object, Array, Promise, Error, RegExp, Date: MockDate,
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
  Audio: MockAudio,
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
// The <audio> element lesson-music.js is using, or null before the
// first lesson/preview.
function musicEl() { return vm.runInContext('window.duolibeeMusic.audio', sandbox); }
function musicState() {
  return vm.runInContext(`
    (function () {
      const m = window.duolibeeMusic;
      return { playing: m.playing, volume: m.volume, track: m.track, host: m.host };
    })()
  `, sandbox);
}

(async () => {
  for (let i = 0; i < 20 && !vm.runInContext('typeof LESSONS !== "undefined" && LESSONS.length', sandbox); i++) await sleep(50);
  assert.ok(vm.runInContext('LESSONS.length', sandbox) > 0, 'lessons must load');
  assert.ok(vm.runInContext('typeof window.duolibeeMusic !== "undefined"', sandbox), 'lesson-music.js must expose window.duolibeeMusic');

  // Music is on by default (no setting stored yet), but nothing plays
  // before a lesson starts, and no <audio> element exists yet.
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0, 'no lesson yet, so the volume must be 0');
  assert.strictEqual(musicEl(), null, 'no <audio> element must exist before the first lesson');
  const tracks = JSON.parse(JSON.stringify(vm.runInContext('window.duolibeeMusic.tracks', sandbox)));
  console.log('tracks:', JSON.stringify(tracks));
  assert.deepStrictEqual(tracks, [
    'assets/music/lumpy.mp3', 'assets/music/tito-bong.mp3', 'assets/music/ate-crystal.mp3',
    'assets/music/jetjet.mp3', 'assets/music/lola-joli.mp3', 'assets/music/tita-baby.mp3',
  ], 'there must be six tracks, one per character');

  // Start lesson 1. The first graded exercise is a choice (not audio /
  // speak), so the track plays at half volume, looped.
  vm.runInContext('startLesson(1)', sandbox);
  await sleep(150);
  // Lesson 1 is hosted by lumpy.
  const lumpy = musicState();
  console.log('lesson 1:', JSON.stringify(lumpy));
  assert.strictEqual(lumpy.track, 'assets/music/lumpy.mp3', 'lesson 1 must load Lumpy\'s track, got ' + lumpy.track);
  assert.strictEqual(lumpy.host, 'lumpy', 'lesson 1 must be hosted by lumpy');
  assert.strictEqual(lumpy.playing, true, 'music must be playing during a lesson');
  assert.strictEqual(lumpy.volume, 0.25, 'a choice exercise must play at half volume, got ' + lumpy.volume);
  const el = musicEl();
  assert.ok(el, 'an <audio> element must exist once a lesson starts');
  assert.strictEqual(el.src, 'assets/music/lumpy.mp3', 'the element must load Lumpy\'s track');
  assert.strictEqual(el.loop, true, 'the track must loop (lessons run longer than the track)');
  assert.strictEqual(el.volume, 0.25, 'the element volume must be half volume on a choice exercise');
  assert.strictEqual(el.paused, false, 'the element must be playing');
  assert.ok(el.playCalls >= 1, 'play() must have been called');

  // Move to an audio exercise: the music must duck, but keep playing.
  vm.runInContext(`
    (function () {
      const idx = session.exercises.findIndex((e) => e.type === 'audio');
      index = idx; renderExercise();
    })()
  `, sandbox);
  await sleep(150);
  const audioState = musicState();
  console.log('audio exercise:', JSON.stringify(audioState));
  assert.strictEqual(audioState.volume, 0.04, 'an audio exercise must duck the music, got ' + audioState.volume);
  assert.strictEqual(audioState.playing, true, 'ducked music must keep playing (the session stays warm)');
  assert.strictEqual(el.volume, 0.04, 'the element volume must duck');
  assert.strictEqual(el.paused, false, 'the element must keep playing while ducked');

  // And a speaking exercise: still ducked.
  vm.runInContext(`
    (function () {
      const idx = session.exercises.findIndex((e) => e.type === 'speak');
      index = idx; renderExercise();
    })()
  `, sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.04, 'a speaking exercise must duck the music');

  // Back to a choice exercise: half volume again.
  vm.runInContext(`
    (function () {
      const idx = session.exercises.findIndex((e) => e.type === 'choice');
      index = idx; renderExercise();
    })()
  `, sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'a choice exercise must restore half volume');

  // Speech playback ducks the music even on a choice exercise, and
  // restores it when the clip ends.
  vm.runInContext('window.duolibeeSpeechStart()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.04, 'speech playback must duck the music');
  vm.runInContext('window.duolibeeSpeechEnd()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'speech end must restore the music');

  // A lost speech-end event must not leave the music ducked forever.
  // iOS often never fires the utterance onend, and pausing a clip never
  // fires onended, so if the end hook is lost the music must recover
  // on its own once the clip could not still be playing.
  vm.runInContext('window.duolibeeSpeechStart()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.04, 'speech start must duck the music');
  // No SpeechEnd call: the end event is lost. Fast-forward past the
  // 15s lease and the music must come back up on its own.
  mockNow += 16000;
  vm.runInContext('window.duolibeeMusic.updateMusic()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'a stale speech duck must clear after the lease so the music comes back up');
  // And a fresh clip still ducks (the lease only clears stale state).
  vm.runInContext('window.duolibeeSpeechStart()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.04, 'a new clip must duck again');
  vm.runInContext('window.duolibeeSpeechEnd()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'speech end must restore the music after the lease test');

  // The global mute silences the music and pauses the track, and
  // unmuting resumes it.
  vm.runInContext('state.settings.muted = true; window.duolibeeMusic.updateMusic()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0, 'mute must silence the music');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), false, 'mute must report not playing');
  assert.strictEqual(el.paused, true, 'mute must pause the track');
  vm.runInContext('state.settings.muted = false; window.duolibeeMusic.updateMusic()', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'unmute must restore the music');
  assert.strictEqual(el.paused, false, 'unmute must resume the track');

  // The Settings toggle turns it off and on.
  vm.runInContext('window.setMusicEnabled(false)', sandbox);
  assert.strictEqual(vm.runInContext('state.settings.music', sandbox), false, 'turning music off must save the setting');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0, 'turning music off must silence it');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), false, 'turning music off must report not playing');
  assert.strictEqual(el.paused, true, 'turning music off must pause the track');
  vm.runInContext('window.setMusicEnabled(true)', sandbox);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'turning music on must restore it during a lesson');
  assert.strictEqual(el.paused, false, 'turning music on must resume the track');

  // Going home stops the music and pauses the track.
  vm.runInContext(`go('home')`, sandbox);
  await sleep(150);
  const home = musicState();
  console.log('home:', JSON.stringify(home));
  assert.strictEqual(home.playing, false, 'music must stop on home');
  assert.strictEqual(home.volume, 0, 'music volume must be 0 on home');
  assert.strictEqual(el.paused, true, 'the track must pause on home');

  // Six tracks, one per character. A lesson plays its host
  // character's track, deterministically — no random pick.
  // Lesson -> theme -> host (lessons are grouped four per theme, in
  // theme order): 1 lumpy, 5 jetjet, 13 lola-joli, 21 tita-baby,
  // 33 tito-bong, 53 ate-crystal. A lesson can only start once the
  // earlier ones are complete, so unlock up to it.
  async function trackForLesson(id) {
    vm.runInContext(`
      (function () {
        for (let i = 1; i < ${id}; i++) state.completed[i] = { last: Date.now() };
        startLesson(${id});
      })()
    `, sandbox);
    await sleep(150);
    return musicState();
  }
  const perCharacter = [
    [1, 'lumpy', 'assets/music/lumpy.mp3'],
    [5, 'jetjet', 'assets/music/jetjet.mp3'],
    [13, 'lola-joli', 'assets/music/lola-joli.mp3'],
    [21, 'tita-baby', 'assets/music/tita-baby.mp3'],
    [33, 'tito-bong', 'assets/music/tito-bong.mp3'],
    [53, 'ate-crystal', 'assets/music/ate-crystal.mp3'],
  ];
  for (const [id, host, file] of perCharacter) {
    const gotHost = vm.runInContext(`LESSONS.find(l => l.id === ${id}).host`, sandbox);
    assert.strictEqual(gotHost, host, `lesson ${id} must be hosted by ${host}`);
    const got = await trackForLesson(id);
    console.log(`lesson ${id} (${host}):`, got.track);
    assert.strictEqual(got.track, file, `lesson ${id} hosted by ${host} must play ${file}, got ${got.track}`);
    assert.strictEqual(musicEl().src, file, `lesson ${id} must load ${file} into the element`);
    assert.strictEqual(got.playing, true, `lesson ${id} must be playing`);
    vm.runInContext(`go('home')`, sandbox);
    await sleep(50);
  }
  // Replaying the same lesson loads the same track and restarts it.
  const replay = await trackForLesson(33);
  assert.strictEqual(replay.track, 'assets/music/tito-bong.mp3', 'replaying a tito-bong lesson must play his track again');
  assert.strictEqual(musicEl().currentTime, 0, 'replaying a lesson must restart its track from the beginning');
  // Re-rendering the same first exercise must not reload the track.
  musicEl().currentTime = 42;
  const srcBefore = musicEl().src;
  const playsBefore = musicEl().playCalls;
  vm.runInContext('renderExercise()', sandbox);
  assert.strictEqual(musicEl().src, srcBefore, 'a re-render must not reload the track');
  assert.strictEqual(musicEl().currentTime, 42, 'a re-render must not restart the track');
  assert.strictEqual(musicEl().playCalls, playsBefore, 'a re-render must not call play() again');
  vm.runInContext(`go('home')`, sandbox);

  // A session with no host (review) falls back to Lumpy's track.
  // Make one item due, then start a review.
  vm.runInContext(`
    (function () {
      const item = LESSONS[0].items[0];
      state.srs[srsKey(LESSONS[0].category, item.t)] = { due: 0 };
      startReview();
    })()
  `, sandbox);
  await sleep(150);
  const reviewTrack = musicState();
  console.log('review:', JSON.stringify(reviewTrack));
  assert.strictEqual(reviewTrack.track, 'assets/music/lumpy.mp3', 'a host-less review session must fall back to Lumpy\'s track, got ' + reviewTrack.track);
  assert.strictEqual(reviewTrack.playing, true, 'the review must play the fallback track');
  vm.runInContext(`go('home')`, sandbox);

  // ---- Settings preview: hear each character's track without a lesson ----
  vm.runInContext(`go('settings')`, sandbox);
  await sleep(50);
  // The preview section lists all six characters with their track and
  // a play button. (The mock's getElementById always returns an
  // element, so assert on the built section's children instead.)
  const previewSection = vm.runInContext(`document.getElementById('music-preview')`, sandbox);
  assert.strictEqual(previewSection.children.length, 8, 'the preview section must have a title, a note and six rows, got ' + previewSection.children.length);
  const previewRows = previewSection.children.slice(2);
  const expectedRows = [
    ['Lumpy', 'OPM lofi'],
    ['Tito Bong', 'Arena rock'],
    ['Ate Crystal', 'Pop punk'],
    ['Jetjet', 'Brainrot hyperpop'],
    ['Lola Joli', 'Folk rondalla'],
    ['Tita Baby', 'Love ballad'],
  ];
  previewRows.forEach((row, i) => {
    assert.strictEqual(row.children[0].textContent, expectedRows[i][0] + ' — ' + expectedRows[i][1], 'row ' + i + ' must name the character and track');
    assert.strictEqual(row.children[1].textContent, '▶ Play', 'row ' + i + ' must start as Play');
    assert.ok(typeof row.children[1].onclick === 'function', 'row ' + i + ' must have a play button handler');
  });
  // Playing a character's track loads it, at half volume, outside a
  // lesson.
  const lolaBtn = vm.runInContext(`document.getElementById('music-preview-lola-joli')`, sandbox);
  lolaBtn.onclick();
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.track', sandbox), 'assets/music/lola-joli.mp3', 'previewing Lola Joli must load her track');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), 'lola-joli', 'previewHost must be lola-joli');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'a preview must play at half volume outside a lesson');
  assert.strictEqual(musicEl().src, 'assets/music/lola-joli.mp3', 'a preview must load the track into the element');
  assert.strictEqual(musicEl().paused, false, 'a preview must play');
  assert.strictEqual(lolaBtn.textContent, '⏸ Stop', 'the playing row must show Stop');
  // Switching to another character switches the track, and the old
  // row goes back to Play.
  const bongBtn = vm.runInContext(`document.getElementById('music-preview-tito-bong')`, sandbox);
  bongBtn.onclick();
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.track', sandbox), 'assets/music/tito-bong.mp3', 'switching to Tito Bong must load his track');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), 'tito-bong', 'previewHost must switch to tito-bong');
  assert.strictEqual(lolaBtn.textContent, '▶ Play', 'the old row must go back to Play');
  assert.strictEqual(bongBtn.textContent, '⏸ Stop', 'the new row must show Stop');
  // Tapping the same button again stops the preview.
  bongBtn.onclick();
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), null, 'tapping the playing button again must stop the preview');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0, 'a stopped preview must be silent');
  assert.strictEqual(musicEl().paused, true, 'a stopped preview must pause the element');
  assert.strictEqual(bongBtn.textContent, '▶ Play', 'the stopped row must go back to Play');
  // The preview plays even if the lesson-music toggle is off.
  vm.runInContext('window.setMusicEnabled(false)', sandbox);
  assert.strictEqual(vm.runInContext('state.settings.music', sandbox), false, 'the toggle must be off for this check');
  lolaBtn.onclick();
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), 'lola-joli', 'a preview must start even with the lesson-music toggle off');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0.25, 'a preview must play at half volume even with the toggle off');
  vm.runInContext('window.setMusicEnabled(true)', sandbox);
  // Leaving Settings stops the preview.
  vm.runInContext(`go('home')`, sandbox);
  await sleep(50);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), null, 'leaving Settings must stop a preview');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0, 'leaving Settings must silence the preview');
  assert.strictEqual(musicEl().paused, true, 'leaving Settings must pause the element');
  // Starting a lesson stops a preview and plays the lesson's host track.
  vm.runInContext(`go('settings')`, sandbox);
  await sleep(50);
  const lolaBtn2 = vm.runInContext(`document.getElementById('music-preview-lola-joli')`, sandbox);
  lolaBtn2.onclick();
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), 'lola-joli', 'the preview must be playing before the lesson starts');
  vm.runInContext('startLesson(1)', sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.previewHost', sandbox), null, 'starting a lesson must stop a preview');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.track', sandbox), 'assets/music/lumpy.mp3', 'the lesson must play its own host track, not the preview');
  vm.runInContext(`go('home')`, sandbox);

  // ---- A track that fails to load must not break the lesson ----
  vm.runInContext('startLesson(1)', sandbox);
  await sleep(150);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), true, 'the lesson must be playing before the failure');
  musicEl()._fire('error');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.volume', sandbox), 0, 'a failed track must go silent');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), false, 'a failed track must report not playing');
  assert.strictEqual(musicEl().paused, true, 'a failed track must pause the element');
  // The lesson itself still works: navigating and answering do not
  // throw, and starting a new lesson recovers the music.
  vm.runInContext('renderExercise()', sandbox);
  vm.runInContext(`go('home')`, sandbox);
  await trackForLesson(5);
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.track', sandbox), 'assets/music/jetjet.mp3', 'a new lesson after a failure must load its track');
  assert.strictEqual(vm.runInContext('window.duolibeeMusic.playing', sandbox), true, 'a new lesson after a failure must play again');
  vm.runInContext(`go('home')`, sandbox);

  console.log('LESSON MUSIC: PASS');
  process.exit(0);
})().catch((e) => { console.error('LESSON MUSIC: FAIL', e); process.exit(1); });
