// DUOLIBEE lesson music — study beats, generated in the browser.
//
// A soft background loop that plays while a lesson is in progress, and
// stops when the lesson ends. Nothing is downloaded and nothing leaves
// the device: every note is synthesized live with the Web Audio API, so
// there is no audio file, no server call, and no extra download.
//
// There are six styles, one per character, and a lesson plays its
// host character's style, so the background matches who is teaching:
//   * OPM lofi — Lumpy: 72 BPM, Cmaj7-Am7-Fmaj7-G7, swung beat,
//     vinyl crackle, a sparse pentatonic melody.
//   * Love ballad — Tita Baby: 60 BPM, a lush Fmaj7-Dm7-Bbmaj7-C7,
//     no drums at all: slow piano-like chords, a long emotional
//     melody.
//   * Folk rondalla — Lola Joli: 88 BPM, a gentle C-Am-F-G, lilting
//     swing, a plucked stepwise melody, a light two-beat pulse.
//   * Arena rock — Tito Bong: 120 BPM, a big D-A-Bm-G, driving
//     four-on-the-floor kick, a soaring long melody.
//   * Pop punk — Ate Crystal: 136 BPM, a punchy A-C-D-E, a driving
//     eighth-note melody, punchy drums.
//   * Brainrot hyperpop — Jetjet: 150 BPM, a bright C-G-Bb-F,
//     four-on-the-floor kick, a hat on every 16th, a rapid glitchy
//     melody that jumps around.
//
// All six are original compositions in each genre's idiom — they
// evoke the feel, they do not reproduce any song's melody or
// note-for-note progression.
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
      name: 'Love ballad', bpm: 60, swing: 0, crackle: false,
      chords: [
        { name: 'Fmaj7', pad: [53, 57, 60, 64], bass: 41 },
        { name: 'Dm7', pad: [50, 53, 57, 60], bass: 38 },
        { name: 'Bbmaj7', pad: [46, 50, 53, 57], bass: 46 },
        { name: 'C7', pad: [48, 52, 55, 58], bass: 48 },
      ],
      melody: [
        [0, 0, 77, 4], [0, 8, 81, 4],
        [1, 0, 79, 4], [1, 8, 77, 4],
        [2, 0, 76, 4], [2, 8, 77, 4],
        [3, 0, 79, 4], [3, 8, 74, 8],
      ],
      kick: [], snare: [], hat: [], bass: [0],
    },
    {
      name: 'Folk rondalla', bpm: 88, swing: 0.10, crackle: false,
      chords: [
        { name: 'C', pad: [60, 64, 67], bass: 48 },
        { name: 'Am', pad: [57, 60, 64], bass: 45 },
        { name: 'F', pad: [53, 57, 60], bass: 41 },
        { name: 'G', pad: [55, 59, 62], bass: 43 },
      ],
      melody: [
        [0, 0, 72, 2], [0, 4, 76, 2], [0, 8, 79, 2], [0, 12, 76, 2],
        [1, 0, 74, 2], [1, 4, 72, 2], [1, 8, 74, 2], [1, 12, 76, 2],
        [2, 0, 77, 2], [2, 4, 76, 2], [2, 8, 74, 2], [2, 12, 72, 2],
        [3, 0, 74, 2], [3, 4, 71, 2], [3, 8, 72, 4],
      ],
      kick: [0, 8], snare: [], hat: [0, 4, 8, 12], bass: [0, 8],
    },
    {
      name: 'Arena rock', bpm: 120, swing: 0, crackle: false,
      chords: [
        { name: 'D', pad: [50, 57, 62], bass: 38 },
        { name: 'A', pad: [45, 52, 57], bass: 45 },
        { name: 'Bm', pad: [47, 54, 59], bass: 47 },
        { name: 'G', pad: [43, 50, 55], bass: 43 },
      ],
      melody: [
        [0, 0, 74, 4], [0, 8, 78, 4],
        [1, 0, 76, 4], [1, 8, 81, 4],
        [2, 0, 79, 4], [2, 8, 78, 4],
        [3, 0, 74, 4], [3, 8, 71, 4],
      ],
      kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 4, 8, 12],
    },
    {
      name: 'Pop punk', bpm: 136, swing: 0, crackle: false,
      chords: [
        { name: 'A', pad: [45, 52, 57], bass: 45 },
        { name: 'C', pad: [48, 55, 60], bass: 48 },
        { name: 'D', pad: [50, 57, 62], bass: 38 },
        { name: 'E', pad: [52, 59, 64], bass: 40 },
      ],
      melody: [
        [0, 0, 76, 2], [0, 4, 77, 2], [0, 8, 76, 2], [0, 12, 74, 2],
        [1, 0, 79, 2], [1, 4, 77, 2], [1, 8, 76, 2], [1, 12, 74, 2],
        [2, 0, 78, 2], [2, 4, 79, 2], [2, 8, 81, 2], [2, 12, 79, 2],
        [3, 0, 78, 2], [3, 4, 76, 2], [3, 8, 74, 2], [3, 12, 76, 4],
      ],
      kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 4, 8, 12],
    },
    {
      name: 'Brainrot hyperpop', bpm: 150, swing: 0, crackle: false,
      chords: [
        { name: 'C', pad: [60, 64, 67], bass: 48 },
        { name: 'G', pad: [55, 59, 62], bass: 43 },
        { name: 'Bb', pad: [58, 62, 65], bass: 46 },
        { name: 'F', pad: [53, 57, 60], bass: 41 },
      ],
      melody: [
        [0, 0, 84, 1], [0, 2, 79, 1], [0, 4, 86, 1], [0, 6, 81, 1], [0, 8, 84, 1], [0, 10, 79, 1], [0, 12, 86, 1], [0, 14, 81, 1],
        [1, 0, 83, 1], [1, 2, 79, 1], [1, 4, 86, 1], [1, 6, 83, 1], [1, 8, 79, 1], [1, 10, 86, 1], [1, 12, 83, 1], [1, 14, 79, 1],
        [2, 0, 82, 1], [2, 2, 77, 1], [2, 4, 84, 1], [2, 6, 82, 1], [2, 8, 77, 1], [2, 10, 84, 1], [2, 12, 82, 1], [2, 14, 77, 1],
        [3, 0, 84, 1], [3, 2, 81, 1], [3, 4, 86, 1], [3, 6, 84, 1], [3, 8, 81, 1], [3, 10, 86, 1], [3, 12, 84, 1], [3, 14, 89, 2],
      ],
      kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], bass: [0, 4, 8, 12],
    },
  ];

  // One style per character: a lesson plays its host character's
  // music. Lessons carry `host` (category-generator.js puts the theme's
  // host on every lesson); review and category sessions have no host
  // and fall back to the OPM lofi default.
  const HOST_STYLE = {
    'lumpy': 'OPM lofi',
    'tito-bong': 'Arena rock',
    'ate-crystal': 'Pop punk',
    'jetjet': 'Brainrot hyperpop',
    'lola-joli': 'Folk rondalla',
    'tita-baby': 'Love ballad',
  };
  const CHARACTER_NAMES = {
    'lumpy': 'Lumpy',
    'tito-bong': 'Tito Bong',
    'ate-crystal': 'Ate Crystal',
    'jetjet': 'Jetjet',
    'lola-joli': 'Lola Joli',
    'tita-baby': 'Tita Baby',
  };

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
  // The style for the lesson in progress. It is picked when a lesson
  // starts (its first exercise, coming from not being in a lesson),
  // never mid-lesson. The pick is deterministic — the host character's
  // style — so replaying the same lesson plays the same music, and
  // re-rendering the first exercise does not re-pick.
  let currentStyle = null;
  let wasInLesson = false;
  // The host whose style is being previewed in Settings, or null.
  // A preview plays outside a lesson, through the same engine, and
  // stops when the user leaves Settings or starts a lesson.
  let previewHost = null;
  // The preview buttons, rebuilt on every Settings render (host ->
  // button element), so their Play/Stop labels can follow the state.
  let previewButtons = {};

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
    if (muted()) return 0;
    // A preview is a deliberate listen: it plays at full volume even
    // if the lesson-music toggle is off. The toggle still controls
    // whether music plays during lessons.
    if (previewHost) return NORMAL_GAIN;
    if (!musicOn() || !lessonActive()) return 0;
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

  function lessonHost() {
    // The lesson's host character. Lessons carry `host` directly; if
    // it is missing, look it up from the theme (session.category is
    // the theme name). Review and other host-less sessions return
    // null and fall back to the default style.
    try {
      if (typeof session !== 'undefined' && session && session.host) return session.host;
      if (typeof session !== 'undefined' && session && session.category && typeof THEMES !== 'undefined' && Array.isArray(THEMES)) {
        const th = THEMES.find((t) => t.name === session.category);
        if (th && th.host) return th.host;
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  function pickStyle() {
    const host = lessonHost();
    const name = (host && HOST_STYLE[host]) || 'OPM lofi';
    currentStyle = STYLES.find((s) => s.name === name) || STYLES[0];
    if (crackleGain) {
      try { crackleGain.gain.value = currentStyle.crackle ? 0.012 : 0; } catch (e) { /* ignore */ }
    }
    return currentStyle;
  }

  // ---- Settings preview ----
  // Play one character's style outside a lesson, through the same
  // engine. Only one preview plays at a time; it plays even if the
  // lesson-music toggle is off (it is a deliberate listen), and it
  // stops when the user leaves Settings or starts a lesson.
  function previewFor(host) {
    if (!HOST_STYLE[host]) return false;
    if (lessonActive()) return false;
    const s = STYLES.find((x) => x.name === HOST_STYLE[host]);
    if (!s) return false;
    if (!ensureCtx()) return false;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
    currentStyle = s;
    previewHost = host;
    if (crackleGain) {
      try { crackleGain.gain.value = s.crackle ? 0.012 : 0; } catch (e) { /* ignore */ }
    }
    nextStep = 0;
    nextTime = ctx.currentTime + 0.1;
    if (timer == null) timer = setInterval(tick, 100);
    refreshPreviewButtons();
    applyGain();
    return true;
  }
  function togglePreview(host) {
    if (previewHost === host) { stopPreview(); return; }
    previewFor(host);
  }
  function stopPreview() {
    if (!previewHost) return;
    previewHost = null;
    refreshPreviewButtons();
    applyGain();
  }
  function refreshPreviewButtons() {
    for (const host of Object.keys(previewButtons)) {
      const btn = previewButtons[host];
      if (btn) btn.textContent = (previewHost === host) ? '⏸ Stop' : '▶ Play';
    }
  }
  // The preview section, rebuilt on every Settings render so the
  // Play/Stop labels always match the current preview state.
  function buildPreviewSection(card) {
    const old = document.getElementById('music-preview');
    if (old && typeof old.remove === 'function') old.remove();
    const section = document.createElement('div');
    section.className = 'music-preview';
    section.id = 'music-preview';
    const title = document.createElement('h3');
    title.textContent = 'Character music';
    section.append(title);
    const note = document.createElement('p');
    note.className = 'setting-note';
    note.textContent = 'Hear each character\'s style without starting a lesson. Tap play to listen; tap again to stop.';
    section.append(note);
    previewButtons = {};
    for (const host of Object.keys(HOST_STYLE)) {
      const row = document.createElement('div');
      row.className = 'setting-row music-preview-row';
      const name = document.createElement('span');
      name.textContent = CHARACTER_NAMES[host] + ' — ' + HOST_STYLE[host];
      const btn = document.createElement('button');
      btn.className = 'ghost music-preview-btn';
      btn.id = 'music-preview-' + host;
      btn.textContent = (previewHost === host) ? '⏸ Stop' : '▶ Play';
      btn.onclick = () => { togglePreview(host); };
      row.append(name, btn);
      section.append(row);
      previewButtons[host] = btn;
    }
    card.append(section);
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
    // The scheduler runs for lesson music, or for a preview (which
    // plays outside a lesson and ignores the lesson-music toggle).
    const active = previewHost ? !muted() : (lessonActive() && musicOn() && !muted());
    if (!active || !currentStyle) return;
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
    // A lesson started: stop any preview so it cannot clash with the
    // lesson's own music.
    if (previewHost) stopPreview();
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
    // A lesson has started when we are on its first exercise and we
    // were not in a lesson before. Pick the host character's style and
    // keep it for the whole lesson; re-rendering the first exercise
    // does not re-pick, but replaying the lesson does (same style —
    // the pick is deterministic by character).
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
    // Leaving Settings stops a preview — it must never keep playing
    // on another screen or clash with lesson music.
    if (typeof view === 'undefined' || view !== 'settings') stopPreview();
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

  // Settings toggle, next to the speaking and Whisper toggles, plus
  // the Character music preview section.
  const originalSettings = renderSettings;
  renderSettings = function () {
    originalSettings();
    const card = app.querySelector('.card');
    if (!card) return;
    if (!document.getElementById('music-setting')) {
      const label = document.createElement('label');
      label.className = 'setting-row';
      label.id = 'music-setting';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'music-setting-box';
      box.checked = musicOn();
      box.onchange = () => { setMusicEnabled(box.checked); };
      label.append(box, document.createTextNode(' Background music during lessons'));
      const note = document.createElement('span');
      note.className = 'setting-note';
      note.textContent = 'Soft study beats, made in your browser — each character has their own style, and it quiets itself for listening and speaking questions.';
      label.append(note);
      card.append(label);
    }
    buildPreviewSection(card);
  };

  window.duolibeeMusic = {
    updateMusic, setMusicEnabled,
    get playing() { return timer != null && lessonActive() && musicOn() && !muted(); },
    get gain() { return targetGain(); },
    get style() { return currentStyle ? currentStyle.name : null; },
    get styles() { return STYLES.map((s) => s.name); },
    get chords() { return currentStyle ? currentStyle.chords.map((c) => c.name) : []; },
    preview: previewFor,
    togglePreview,
    stopPreview,
    get previewHost() { return previewHost; },
    get previewing() { return previewHost !== null; },
  };
})();
