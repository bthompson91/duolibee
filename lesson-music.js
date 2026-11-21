// DUOLIBEE lesson music — study beats, generated in the browser.
//
// A soft background loop that plays while a lesson is in progress, and
// stops when the lesson ends. Nothing is downloaded and nothing leaves
// the device: every note is synthesized live with the Web Audio API, so
// there is no audio file, no server call, and no extra download.
//
// There are five styles, and one is picked at random each time a lesson
// starts, so the background changes from lesson to lesson:
//   * OPM lofi — the original: 72 BPM, Cmaj7-Am7-Fmaj7-G7, swung beat,
//     vinyl crackle, a sparse pentatonic melody.
//   * Bossa café — 84 BPM, a jazzy Dm7-G7-Cmaj9-Fmaj9, a bossa bass
//     pulse and a shaker-like hat.
//   * Dreamy ambient — 60 BPM, no drums at all: slow Am9-Fmaj9-Cmaj9-G6
//     pads with a few high music-box sparkles.
//   * City pop — 96 BPM, a bright bouncy C-G-Am-F, four-on-the-floor
//     kick and a busier glockenspiel-like melody.
//   * Rainy jazz — 66 BPM, a Cmaj7-A7-Dm7-G7 turnaround, swung ride,
//     walking bass, brush snare.
//
// Behaviour:
//   * Starts when a lesson starts (a tap, so iOS allows the audio),
//     stops when the lesson ends or the learner goes home.
//   * Ducks to almost silent on audio and speaking questions, and
//     while a pronunciation clip or the system voice is playing, so
//     the Tagalog is always clear.
//   * Respects the global mute (the speaker icon) and has its own
//     Settings toggle, on by default. Turning music off stops it at
//     once; turning it on starts it again if a lesson is in progress.
//
// A side effect worth knowing: keeping a Web Audio context running
// keeps iOS Safari's audio session warm, so the speech clips start
// instantly instead of waiting for the session to spin up.
(() => {
  const STEPS_PER_BAR = 16;
  const BARS = 4;
  const TOTAL_STEPS = STEPS_PER_BAR * BARS;

  const NORMAL_GAIN = 0.12;
  const DUCK_GAIN = 0.02;
  // No pronunciation clip runs this long. If speech has been "playing"
  // for longer, the end event was lost (iOS often never fires the
  // utterance onend, and pausing a clip never fires onended) — clear it
  // so the music comes back up on its own.
  const SPEECH_LEASE_MS = 15000;

  // A style: [name, pad midi notes, bass midi note] per chord, a melody
  // of [bar, step, midi note, length in steps], and the drum/bass steps
  // (0-based within the bar). An empty step list means that part is
  // silent for the style.
  const STYLES = [
    {
      name: 'OPM lofi', bpm: 72, swing: 0.12, crackle: true,
      chords: [
        { name: 'Cmaj7', pad: [60, 64, 67, 71], bass: 48 },
        { name: 'Am7', pad: [57, 60, 64, 67], bass: 45 },
        { name: 'Fmaj7', pad: [53, 57, 60, 64], bass: 41 },
        { name: 'G7', pad: [55, 59, 62, 65], bass: 43 },
      ],
      melody: [
        [0, 0, 76, 3], [0, 6, 79, 2], [0, 12, 84, 4],
        [1, 0, 72, 3], [1, 8, 76, 2], [1, 12, 81, 4],
        [2, 0, 81, 3], [2, 6, 84, 2], [2, 12, 77, 4],
        [3, 0, 71, 3], [3, 8, 74, 2], [3, 12, 79, 4],
      ],
      kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 8],
    },
    {
      name: 'Bossa café', bpm: 84, swing: 0.10, crackle: true,
      chords: [
        { name: 'Dm7', pad: [62, 65, 69, 72], bass: 38 },
        { name: 'G7', pad: [59, 62, 65, 69], bass: 43 },
        { name: 'Cmaj9', pad: [60, 64, 67, 74], bass: 48 },
        { name: 'Fmaj9', pad: [65, 69, 72, 79], bass: 41 },
      ],
      melody: [
        [0, 0, 74, 3], [0, 8, 76, 2], [0, 12, 79, 4],
        [1, 0, 77, 3], [1, 8, 76, 2], [1, 12, 74, 4],
        [2, 0, 72, 3], [2, 8, 74, 2], [2, 12, 76, 4],
        [3, 0, 79, 3], [3, 8, 77, 2], [3, 12, 74, 4],
      ],
      kick: [0, 8], snare: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 10],
    },
    {
      name: 'Dreamy ambient', bpm: 60, swing: 0, crackle: false,
      chords: [
        { name: 'Am9', pad: [57, 60, 64, 71], bass: 45 },
        { name: 'Fmaj9', pad: [65, 69, 72, 79], bass: 41 },
        { name: 'Cmaj9', pad: [60, 64, 67, 74], bass: 48 },
        { name: 'G6', pad: [59, 62, 64, 67], bass: 43 },
      ],
      melody: [
        [0, 0, 84, 8],
        [1, 8, 81, 8],
        [2, 0, 79, 8],
        [3, 8, 84, 8],
      ],
      kick: [], snare: [], hat: [], bass: [0],
    },
    {
      name: 'City pop', bpm: 96, swing: 0.05, crackle: false,
      chords: [
        { name: 'C', pad: [60, 64, 67, 72], bass: 48 },
        { name: 'G', pad: [59, 62, 67, 71], bass: 43 },
        { name: 'Am', pad: [57, 60, 64, 69], bass: 45 },
        { name: 'F', pad: [53, 57, 60, 65], bass: 41 },
      ],
      melody: [
        [0, 0, 76, 2], [0, 4, 79, 2], [0, 8, 81, 2], [0, 12, 79, 2],
        [1, 0, 76, 2], [1, 4, 74, 2], [1, 8, 76, 2], [1, 12, 79, 4],
        [2, 0, 81, 2], [2, 4, 79, 2], [2, 8, 76, 2], [2, 12, 74, 2],
        [3, 0, 76, 2], [3, 4, 79, 2], [3, 8, 81, 2], [3, 12, 84, 4],
      ],
      kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 4, 8, 12],
    },
    {
      name: 'Rainy jazz', bpm: 66, swing: 0.15, crackle: true,
      chords: [
        { name: 'Cmaj7', pad: [60, 64, 67, 71], bass: 48 },
        { name: 'A7', pad: [57, 61, 64, 67], bass: 45 },
        { name: 'Dm7', pad: [62, 65, 69, 72], bass: 38 },
        { name: 'G7', pad: [55, 59, 62, 65], bass: 43 },
      ],
      melody: [
        [0, 0, 76, 3], [0, 8, 79, 2], [0, 12, 81, 4],
        [1, 0, 76, 3], [1, 8, 73, 2], [1, 12, 76, 4],
        [2, 0, 77, 3], [2, 8, 81, 2], [2, 12, 77, 4],
        [3, 0, 79, 3], [3, 8, 74, 2], [3, 12, 77, 4],
      ],
      kick: [0], snare: [4, 12], hat: [0, 4, 8, 12], bass: [0, 4, 8, 12],
    },
  ];

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let crackleSrc = null;
  let crackleGain = null;
  let timer = null;
  let nextStep = 0;
  let nextTime = 0;
  let speechPlaying = false;
  let speechSince = 0; // when the current clip started (Date.now)
  // Set when an exercise is on screen, cleared when the learner
  // navigates away. session/index alone cannot tell "in a lesson"
  // from "went home mid-lesson", because go('home') leaves them set.
  let inLessonView = false;
  // The style for the lesson in progress. A new style is picked when a
  // lesson starts (its first exercise, coming from not being in a
  // lesson), never mid-lesson. Replaying the same lesson counts as a
  // fresh start, so it can pick a different style.
  let currentStyle = null;
  let wasInLesson = false;

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function stepSec() { return 60 / (currentStyle ? currentStyle.bpm : 72) / 4; }

  function musicOn() { return state.settings.music !== false; }
  function muted() { return !!(state.settings && state.settings.muted); }
  function lessonActive() {
    try {
      return inLessonView && typeof session !== 'undefined' && !!session && Array.isArray(session.exercises) && typeof index === 'number' && index < session.exercises.length;
    } catch (_) { return false; }
  }
  function currentExerciseType() {
    try {
      const ex = session && session.exercises && session.exercises[index];
      return ex ? ex.type : null;
    } catch (_) { return null; }
  }
  function shouldDuck() {
    // Safety net: a lost speech-end event must not leave the music
    // ducked forever. iOS often never fires the utterance onend, and
    // pausing a clip never fires onended, so if speech has been
    // "playing" for longer than any pronunciation clip can run, it is
    // stale — clear it and let the music come back up.
    if (speechPlaying && speechSince && Date.now() - speechSince > SPEECH_LEASE_MS) {
      speechPlaying = false;
      speechSince = 0;
    }
    if (speechPlaying) return true;
    const t = currentExerciseType();
    return t === 'audio' || t === 'speak';
  }
  function targetGain() {
    if (!musicOn() || muted() || !lessonActive()) return 0;
    return shouldDuck() ? DUCK_GAIN : NORMAL_GAIN;
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // One shared white-noise buffer for snare, hats and crackle.
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Vinyl crackle: the same noise, lowpassed and barely audible.
    // Some styles use it, some do not; pickStyle sets its level.
    crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = noiseBuf;
    crackleSrc.loop = true;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'lowpass';
    crackleFilter.frequency.value = 3200;
    crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.012;
    crackleSrc.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(master);
    crackleSrc.start();
    return ctx;
  }

  function applyGain() {
    if (!ctx || !master) return;
    const g = targetGain();
    try { master.gain.setTargetAtTime(g, ctx.currentTime, 0.4); } catch (e) { /* ignore */ }
  }

  function pickStyle() {
    currentStyle = STYLES[Math.floor(Math.random() * STYLES.length)];
    if (crackleGain) {
      try { crackleGain.gain.value = currentStyle.crackle ? 0.012 : 0; } catch (e) { /* ignore */ }
    }
    return currentStyle;
  }

  // ---- Instruments (all scheduled ahead of time) ----
  function padNote(midi, time, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    const detune = ctx.createOscillator();
    detune.type = 'sine';
    detune.frequency.value = midiToFreq(midi) * 1.003;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.35);
    gain.gain.setValueAtTime(0.05, time + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(filter); detune.connect(filter);
    filter.connect(gain); gain.connect(master);
    osc.start(time); detune.start(time);
    osc.stop(time + dur + 0.1); detune.stop(time + dur + 0.1);
  }
  function bassNote(midi, time, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.16, time + 0.05);
    gain.gain.setValueAtTime(0.16, time + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(time); osc.stop(time + dur + 0.1);
  }
  function melodyNote(midi, time, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = midiToFreq(midi) * 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.07, time + 0.08);
    gain.gain.setValueAtTime(0.07, time + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0, time + dur);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.25;
    osc.connect(gain); shimmer.connect(shimmerGain); shimmerGain.connect(gain);
    gain.connect(master);
    osc.start(time); shimmer.start(time);
    osc.stop(time + dur + 0.1); shimmer.stop(time + dur + 0.1);
  }
  function kick(time) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain); gain.connect(master);
    osc.start(time); osc.stop(time + 0.25);
  }
  function snare(time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(time); src.stop(time + 0.2);
  }
  function hat(time, open) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    const gain = ctx.createGain();
    const dur = open ? 0.12 : 0.04;
    gain.gain.setValueAtTime(open ? 0.05 : 0.035, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(time); src.stop(time + dur + 0.02);
  }

  function stepTime(step, baseTime) {
    // Swing: odd 16ths land late.
    const barStep = step % STEPS_PER_BAR;
    const swing = (barStep % 2 === 1) ? (currentStyle ? currentStyle.swing : 0.12) * stepSec() : 0;
    return baseTime + step * stepSec() + swing;
  }
  function scheduleStep(step, time) {
    const s = currentStyle;
    if (!s) return;
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
    const barStep = step % STEPS_PER_BAR;
    const chord = s.chords[bar];
    if (barStep === 0) {
      const barDur = STEPS_PER_BAR * stepSec();
      for (const m of chord.pad) padNote(m, time, barDur);
    }
    if (s.bass.includes(barStep)) bassNote(chord.bass, time, stepSec() * 6);
    if (s.kick.includes(barStep)) kick(time);
    if (s.snare.includes(barStep)) snare(time);
    if (s.hat.includes(barStep)) hat(time, barStep === 14);
    for (const [mBar, mStep, midi, len] of s.melody) {
      if (mBar === bar && mStep === barStep) melodyNote(midi, time, len * stepSec());
    }
  }

  function tick() {
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    } catch (e) { /* not yet allowed; a later tap will resume it */ }
    applyGain();
    if (!lessonActive() || !musicOn() || muted() || !currentStyle) return;
    while (nextTime < ctx.currentTime + 0.3) {
      scheduleStep(nextStep, stepTime(nextStep, nextTime));
      nextTime += stepSec();
      nextStep = (nextStep + 1) % TOTAL_STEPS;
    }
  }

  function updateMusic() {
    const active = lessonActive();
    if (!active || !musicOn()) {
      if (master) applyGain();
      wasInLesson = false;
      return;
    }
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
    // A lesson has started when we are on its first exercise and we
    // were not in a lesson before. Pick a style at random and keep it
    // for the whole lesson; re-rendering the first exercise does not
    // re-pick, but replaying the lesson does.
    if (!currentStyle || (typeof index === 'number' && index === 0 && !wasInLesson)) {
      pickStyle();
      nextStep = 0;
      nextTime = ctx.currentTime + 0.1;
    }
    wasInLesson = true;
    if (timer == null) {
      nextStep = 0;
      nextTime = ctx.currentTime + 0.1;
      timer = setInterval(tick, 100);
    }
    applyGain();
  }

  // Duck while a pronunciation clip or the system voice is playing;
  // answer-speech.js calls these through its hook().
  window.duolibeeSpeechStart = function () { speechPlaying = true; speechSince = Date.now(); applyGain(); };
  window.duolibeeSpeechEnd = function () { speechPlaying = false; speechSince = 0; applyGain(); };

  function setMusicEnabled(on) {
    state.settings.music = !!on;
    save();
    updateMusic();
  }
  window.setMusicEnabled = setMusicEnabled;

  // Start/stop with the lesson, and re-check the gain on every render.
  const originalRenderExercise = renderExercise;
  renderExercise = function () {
    inLessonView = true;
    originalRenderExercise();
    updateMusic();
  };
  const originalGo = go;
  go = function (...args) {
    const r = originalGo(...args);
    inLessonView = false;
    updateMusic();
    return r;
  };
  // next() is where a lesson completes (index reaches the end), so
  // re-check there too — the music stops on the Session complete screen.
  const originalNext = typeof next === 'function' ? next : null;
  if (originalNext) {
    next = function (...args) {
      const r = originalNext(...args);
      updateMusic();
      return r;
    };
  }

  // Settings toggle, next to the speaking and Whisper toggles.
  const originalSettings = renderSettings;
  renderSettings = function () {
    originalSettings();
    if (document.getElementById('music-setting')) return;
    const label = document.createElement('label');
    label.className = 'setting-row';
    label.id = 'music-setting';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'music-setting-box';
    box.checked = musicOn();
    box.onchange = () => { setMusicEnabled(box.checked); };
    label.append(box, document.createTextNode(' Background music during lessons (OPM lofi)'));
    const note = document.createElement('span');
    note.className = 'setting-note';
    note.textContent = 'Soft study beats, made in your browser — one of five styles is picked at random each lesson, and it quiets itself for listening and speaking questions.';
    label.append(note);
    const card = app.querySelector('.card');
    if (card) card.append(label);
  };

  window.duolibeeMusic = {
    updateMusic, setMusicEnabled,
    get playing() { return timer != null && lessonActive() && musicOn() && !muted(); },
    get gain() { return targetGain(); },
    get style() { return currentStyle ? currentStyle.name : null; },
    get styles() { return STYLES.map((s) => s.name); },
    get chords() { return currentStyle ? currentStyle.chords.map((c) => c.name) : []; },
  };
})();
