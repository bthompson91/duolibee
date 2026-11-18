// Check for the MIDI-note answer sounds: correct ascends, wrong descends,
// and the Sound effects setting + global mute silence them.
// Loads only sound-effects.js in a vm with a fake AudioContext.
// Run: node tests/sound-effects.test.cjs — exit 0 = pass, 1 = fail.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const REPO = '/home/hatch/workspace/duolibee';

class FakeOsc {
  constructor() { this.type = ''; this.frequency = { value: 0 }; this.started = null; this.stopped = null; }
  connect() { return this; }
  start(t) { this.started = t; }
  stop(t) { this.stopped = t; }
}
class FakeGain {
  constructor() { this.gain = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
  connect() { return this; }
}
class FakeCtx {
  constructor() { this.currentTime = 1; this.state = 'running'; this.oscillators = []; this.resumed = 0; }
  createOscillator() { const o = new FakeOsc(); this.oscillators.push(o); return o; }
  createGain() { return new FakeGain(); }
  resume() { this.resumed++; }
}

function load(state) {
  const ctx = new FakeCtx();
  const sandbox = {
    console, Math,
    window: null,
    state,
    AudioContext: function () { return ctx; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(REPO + '/sound-effects.js', 'utf8'), sandbox, { filename: 'sound-effects.js' });
  return { sandbox, ctx };
}

function freqs(ctx) { return ctx.oscillators.map((o) => o.frequency.value); }
function approx(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.5, label + ': expected ~' + expected + ', got ' + actual);
}

// 1. Correct answer plays an ascending arpeggio (C5 E5 G5 C6)
{
  const { sandbox, ctx } = load({ settings: { sound: true } });
  sandbox.window.duolibeeAnswerSound(true);
  const f = freqs(ctx);
  assert.strictEqual(f.length, 4, 'correct plays 4 notes, got ' + f.length);
  [523.25, 659.25, 783.99, 1046.5].forEach((e, i) => approx(f[i], e, 'correct note ' + i));
  assert.ok(f.every((v, i) => i === 0 || v > f[i - 1]), 'correct notes ascend');
  console.log('1. correct answer plays ascending C5 E5 G5 C6: OK');
}

// 2. Wrong answer plays a descending pair (A3 F3)
{
  const { sandbox, ctx } = load({ settings: { sound: true } });
  sandbox.window.duolibeeAnswerSound(false);
  const f = freqs(ctx);
  assert.strictEqual(f.length, 2, 'wrong plays 2 notes, got ' + f.length);
  approx(f[0], 220, 'wrong note 0');
  approx(f[1], 174.61, 'wrong note 1');
  assert.ok(f[1] < f[0], 'wrong notes descend');
  console.log('2. wrong answer plays descending A3 F3: OK');
}

// 3. Sound effects off in Settings silences both
{
  const { sandbox, ctx } = load({ settings: { sound: false } });
  sandbox.window.duolibeeAnswerSound(true);
  sandbox.window.duolibeeAnswerSound(false);
  assert.strictEqual(ctx.oscillators.length, 0, 'sound off plays nothing');
  console.log('3. Sound effects off silences both: OK');
}

// 4. Global mute silences both
{
  const { sandbox, ctx } = load({ settings: { sound: true, muted: true } });
  sandbox.window.duolibeeAnswerSound(true);
  sandbox.window.duolibeeAnswerSound(false);
  assert.strictEqual(ctx.oscillators.length, 0, 'muted plays nothing');
  console.log('4. global mute silences both: OK');
}

// 5. No Web Audio support: no throw, no sound
{
  const sandbox = { console, Math, window: null, state: { settings: { sound: true } } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(REPO + '/sound-effects.js', 'utf8'), sandbox, { filename: 'sound-effects.js' });
  assert.doesNotThrow(() => sandbox.window.duolibeeAnswerSound(true), 'no AudioContext must not throw');
  console.log('5. no Web Audio support degrades silently: OK');
}

console.log('SOUND EFFECTS: PASS');
process.exit(0);
