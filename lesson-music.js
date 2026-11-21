// DUOLIBEE lesson music — OPM-flavoured lofi, generated in the browser.
//
// A soft "beats to study to" loop that plays while a lesson is in
// progress, and stops when the lesson ends. Nothing is downloaded and
// nothing leaves the device: every note is synthesized live with the
// Web Audio API, so there is no audio file, no server call, and no
// extra download.
//
// The sound: a slow (72 BPM) four-bar loop over the classic OPM
// I-vi-IV-V progression (Cmaj7 - Am7 - Fmaj7 - G7), voiced as warm
// seventh chords with smooth voice-leading, a soft sine bass on the
// roots, a swung lofi beat (kick, snare, hats), a whisper of vinyl
// crackle, and a sparse pentatonic melody that stays on chord tones —
// dreamy and girl-coded, never loud enough to fight the Tagalog.
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
(() => {
  const BPM = 72;
  const STEPS_PER_BAR = 16;
  const BARS = 4;
  const TOTAL_STEPS = STEPS_PER_BAR * BARS;
  const STEP_SEC = 60 / BPM / 4;
  const SWING = 0.12; // off-beat 16ths are pushed late by this much of a step

  const NORMAL_GAIN = 0.12;
  const DUCK_GAIN = 0.02;

  // Chords: [name, pad midi notes, bass midi note]. Voice-led so each
  // note moves by a step or stays put between bars.
  const CHORDS = [
    { name: 'Cmaj7', pad: [60, 64, 67, 71], bass: 48 },
    { name: 'Am7', pad: [57, 60, 64, 67], bass: 45 },
    { name: 'Fmaj7', pad: [53, 57, 60, 64], bass: 41 },
    { name: 'G7', pad: [55, 59, 62, 65], bass: 43 },
  ];
  // Melody: [bar, step, midi note, length in steps]. C major pentatonic,
  // chord tones only, one gentle phrase per loop.
  const MELODY = [
    [0, 0, 76, 3], [0, 6, 79, 2], [0, 12, 84, 4],
    [1, 0, 72, 3], [1, 8, 76, 2], [1, 12, 81, 4],
    [2, 0, 81, 3], [2, 6, 84, 2], [2, 12, 77, 4],
    [3, 0, 71, 3], [3, 8, 74, 2], [3, 12, 79, 4],
  ];
  // Drums: [step, kind]. Kick on 1 and 3 (plus the "and" of 2), snare
  // on 2 and 4, hats on the 8ths. Steps are 0-based within the bar.
  const KICK_STEPS = [0, 8, 10];
  const SNARE_STEPS = [4, 12];
  const HAT_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
  const BASS_STEPS = [0, 8];

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

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

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
    if (speechPlaying && speechSince && Date.now() - speechSince > 15000) {
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
    const swing = (barStep % 2 === 1) ? SWING * STEP_SEC : 0;
    return baseTime + step * STEP_SEC + swing;
  }
  function scheduleStep(step, time) {
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
    const barStep = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    if (barStep === 0) {
      const barDur = STEPS_PER_BAR * STEP_SEC;
      for (const m of chord.pad) padNote(m, time, barDur);
    }
    if (BASS_STEPS.includes(barStep)) bassNote(chord.bass, time, STEP_SEC * 6);
    if (KICK_STEPS.includes(barStep)) kick(time);
    if (SNARE_STEPS.includes(barStep)) snare(time);
    if (HAT_STEPS.includes(barStep)) hat(time, barStep === 14);
    for (const [mBar, mStep, midi, len] of MELODY) {
      if (mBar === bar && mStep === barStep) melodyNote(midi, time, len * STEP_SEC);
    }
  }

  function tick() {
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    } catch (e) { /* not yet allowed; a later tap will resume it */ }
    applyGain();
    if (!lessonActive() || !musicOn() || muted()) return;
    while (nextTime < ctx.currentTime + 0.3) {
      scheduleStep(nextStep, stepTime(nextStep, nextTime));
      nextTime += STEP_SEC;
      nextStep = (nextStep + 1) % TOTAL_STEPS;
    }
  }

  function updateMusic() {
    if (!lessonActive() || !musicOn()) {
      if (master) applyGain();
      return;
    }
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
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
    note.textContent = 'Soft study beats, made in your browser — it quiets itself for listening and speaking questions.';
    label.append(note);
    const card = app.querySelector('.card');
    if (card) card.append(label);
  };

  window.duolibeeMusic = {
    updateMusic, setMusicEnabled,
    get playing() { return timer != null && lessonActive() && musicOn() && !muted(); },
    get gain() { return targetGain(); },
    get chords() { return CHORDS.map((c) => c.name); },
  };
})();
