// DUOLIBEE lesson music — each character's own track.
//
// Brendan's tracks, one per character, in assets/music/. A lesson plays
// its host character's track on loop (the tracks are 2–3 minutes, a
// lesson can run longer, so they loop). It starts when a lesson starts
// (a tap, so iOS allows the audio) and stops when the lesson ends or
// the learner goes home.
//
// Behaviour:
//   * Starts when a lesson starts, stops when the lesson ends or the
//     learner goes home. A lesson plays its host character's track;
//     review and other host-less sessions fall back to Lumpy's track.
//     When a lesson ends it fades out over about a second and a half
//     instead of cutting off.
//   * Ducks to almost silent on audio and speaking questions, and
//     while a pronunciation clip or the system voice is playing, so
//     the Tagalog is always clear. While the microphone is recording
//     it dims to 5% instead — quiet enough to hear yourself, loud
//     enough to know it is still playing. It never pauses for a
//     recording: iOS may pause the track when the mic activates, and
//     the tick starts it again.
//   * A Settings volume slider (0–100%) scales every volume — normal,
//     duck, mic dim, and preview. Full (100%) is the current level:
//     the loudest the music ever gets.
//   * Respects the global mute (the speaker icon) and has its own
//     Settings toggle, on by default. Turning music off stops it at
//     once; turning it on starts it again if a lesson is in progress.
//   * If a track fails to load, the lesson just goes on silently —
//     a missing file must never break a lesson.
//
// A side effect worth knowing: keeping a track playing keeps iOS
// Safari's audio session warm, so the speech clips start instantly
// instead of waiting for the session to spin up.
(() => {
  // The tracks are mastered songs (mean around -18 dB), so the
  // element's volume is a quiet background level: a tenth volume, not
  // foreground. Ducking drops it to a whisper.
  const NORMAL_VOLUME = 0.10;
  const DUCK_VOLUME = 0.04;
  // While the microphone is recording, the track dims to 5% — quiet
  // enough to hear yourself, loud enough to know it is still playing.
  // It never pauses for a recording.
  const MIC_VOLUME = 0.05;
  // Recordings cap at 8 s. A mic state older than this is stale (the
  // stop event was lost) — clear it so the music comes back up.
  const MIC_LEASE_MS = 12000;
  // How long the track takes to fade out when a lesson ends.
  const FADE_MS = 1500;
  // No pronunciation clip runs this long. If speech has been "playing"
  // for longer, the end event was lost (iOS often never fires the
  // utterance onend, and pausing a clip never fires onended) — clear it
  // so the music comes back up on its own.
  const SPEECH_LEASE_MS = 15000;

  // One track per character: a lesson plays its host character's
  // track. Lessons carry `host` (category-generator.js puts the theme's
  // host on every lesson); review and category sessions have no host
  // and fall back to Lumpy's track.
  const HOST_TRACK = {
    'lumpy': 'assets/music/lumpy.mp3',
    'tito-bong': 'assets/music/tito-bong.mp3',
    'ate-crystal': 'assets/music/ate-crystal.mp3',
    'jetjet': 'assets/music/jetjet.mp3',
    'lola-joli': 'assets/music/lola-joli.mp3',
    'tita-baby': 'assets/music/tita-baby.mp3',
  };
  const TRACK_LABEL = {
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
  const DEFAULT_HOST = 'lumpy';

  // The single <audio> element for lesson music and previews. One
  // element, one track at a time: a new Audio() per lesson would make
  // the browser set up and tear down a fresh media pipeline each time.
  let audio = null;
  // The file currently loaded in the element (the relative path as
  // set — reading audio.src returns the resolved absolute URL, so the
  // loaded file is tracked separately).
  let loadedFile = null;
  // The host whose track is loaded.
  let currentHost = null;
  // True once the current track has failed to load: stay silent rather
  // than retrying a broken file on every render.
  let audioFailed = false;
  let speechPlaying = false;
  let speechSince = 0; // when the current clip started (Date.now)
  // True while the microphone is recording a speaking answer
  // (speaking.js calls the mic hooks on start/stop).
  let micActive = false;
  let micSince = 0; // when the current recording started (Date.now)
  // A fade-out in progress after a lesson ends, or null.
  // { from, startedAt } — the volume it started from, and when.
  let fade = null;
  // Set when an exercise is on screen, cleared when the learner
  // navigates away. session/index alone cannot tell "in a lesson"
  // from "went home mid-lesson", because go('home') leaves them set.
  let inLessonView = false;
  // The host whose track is playing for the lesson in progress. It is
  // picked when a lesson starts (its first exercise, coming from not
  // being in a lesson), never mid-lesson. The pick is deterministic —
  // the host character's track — so replaying the same lesson plays
  // the same track, and re-rendering the first exercise does not
  // reload it.
  let wasInLesson = false;
  // The host whose track is being previewed in Settings, or null.
  // A preview plays outside a lesson, through the same element, and
  // stops when the user leaves Settings or starts a lesson.
  let previewHost = null;
  // The preview buttons, rebuilt on every Settings render (host ->
  // button element), so their Play/Stop labels can follow the state.
  let previewButtons = {};
  // Applies the volume (and the speech-lease recovery) on a tick, so
  // a lost speech-end event cannot leave the music ducked forever.
  // It only runs while there is music to manage.
  let timer = null;

  function musicOn() { return state.settings.music !== false; }
  // The Settings volume slider, 0–1, as a multiplier on every
  // lesson-music volume. Full (1.0) is the current level — NORMAL_VOLUME
  // is the loudest the music ever gets. Unset (older saved progress)
  // means full, so existing users keep the current behaviour.
  function musicLevel() {
    try {
      const v = state && state.settings ? Number(state.settings.musicVolume) : NaN;
      if (!Number.isFinite(v)) return 1;
      return Math.min(1, Math.max(0, v));
    } catch (_) { return 1; }
  }
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
  function recordingActive() {
    // Safety net, like the speech lease: a lost mic-end event must
    // not leave the music dimmed forever. Recordings cap at 8 s, so
    // a mic state older than the lease is stale — clear it.
    if (micActive && micSince && Date.now() - micSince > MIC_LEASE_MS) {
      micActive = false;
      micSince = 0;
    }
    return micActive;
  }
  function targetVolume() {
    if (audioFailed) return 0;
    if (muted()) return 0;
    // Every volume scales with the Settings volume slider: full is the
    // current level, half is half of that, 0 is silent.
    const level = musicLevel();
    // A preview is a deliberate listen: it plays at full volume even
    // if the lesson-music toggle is off. The toggle still controls
    // whether music plays during lessons.
    if (previewHost) return NORMAL_VOLUME * level;
    if (!musicOn() || !lessonActive()) return 0;
    // A recording dims the track to 5% and keeps it playing — it
    // never pauses for the microphone. A speaking exercise without a
    // recording still ducks to 0.04, as before.
    if (recordingActive()) return MIC_VOLUME * level;
    return (shouldDuck() ? DUCK_VOLUME : NORMAL_VOLUME) * level;
  }
  // The volume the element is actually at right now. During a fade-out
  // that is the fade's current step; otherwise it is the target.
  function currentVolume() {
    if (fade && !audioFailed) {
      const p = Math.min(1, (Date.now() - fade.startedAt) / FADE_MS);
      return fade.from * (1 - p);
    }
    return targetVolume();
  }

  function ensureAudio() {
    if (audio) return audio;
    try {
      audio = new Audio();
    } catch (e) {
      return null;
    }
    audio.loop = true;
    audio.preload = 'auto';
    try { audio.volume = 0; } catch (e) { /* ignore */ }
    audio.addEventListener('error', () => {
      // A track that fails to load must not break the lesson: log it
      // and stay silent.
      audioFailed = true;
      try { console.warn('lesson music: could not load', loadedFile); } catch (_) { /* ignore */ }
      applyVolume();
    });
    return audio;
  }

  function loadTrack(host) {
    const a = ensureAudio();
    if (!a) return false;
    // A new track means the fade is over — a lesson or a preview is
    // starting, so cancel any fade-out in progress.
    fade = null;
    const file = HOST_TRACK[host] || HOST_TRACK[DEFAULT_HOST];
    audioFailed = false;
    // Only reset the element when the track changes; restarting the
    // same track on every render would stutter it. A lesson start
    // always restarts its track from the beginning.
    if (loadedFile !== file) {
      loadedFile = file;
      try { a.src = file; } catch (e) { /* ignore */ }
    }
    currentHost = host;
    try { a.currentTime = 0; } catch (e) { /* ignore */ }
    return true;
  }

  function ensureTimer() {
    if (timer == null) {
      try { timer = setInterval(() => { applyVolume(); }, 250); } catch (e) { /* ignore */ }
    }
  }
  function clearTimer() {
    if (timer != null) {
      try { clearInterval(timer); } catch (e) { /* ignore */ }
      timer = null;
    }
  }

  // Begin fading the track out over FADE_MS after a lesson ends,
  // instead of cutting it off. The tick steps the fade; when it
  // reaches 0 the element pauses, so it never sits playing silently.
  // Starting a lesson or a preview cancels the fade (loadTrack).
  function startFade() {
    if (!audio || audio.paused || audioFailed) return;
    if (fade) return;
    fade = { from: audio.volume, startedAt: Date.now() };
    ensureTimer();
  }

  function applyVolume() {
    if (!audio) return;
    // A fade-out in progress: the fade drives the volume itself on
    // the tick, and the normal target must not cut it short.
    if (fade && !audioFailed) {
      const elapsed = Date.now() - fade.startedAt;
      const p = Math.min(1, elapsed / FADE_MS);
      const v = fade.from * (1 - p);
      try { audio.volume = v; } catch (e) { /* ignore */ }
      if (p >= 1) {
        fade = null;
        try { audio.volume = 0; } catch (e) { /* ignore */ }
        try { if (!audio.paused) audio.pause(); } catch (e) { /* ignore */ }
      }
      // Keep the tick running until the fade finishes.
      if (lessonActive() || previewHost || fade) ensureTimer(); else clearTimer();
      return;
    }
    if (fade) fade = null; // a failed track aborts the fade
    const v = targetVolume();
    try {
      if (Math.abs(audio.volume - v) > 0.001) audio.volume = v;
    } catch (e) { /* ignore */ }
    // Pause when there is nothing to hear, so the track does not run
    // on in the background — and play when there is. A playing
    // (looped) track keeps the audio session warm while a lesson
    // runs, so speech clips start fast. play() can be refused before
    // a user gesture; the tick retries it, and the next tap does too.
    const shouldPlay = v > 0 && !audioFailed;
    try {
      if (shouldPlay && audio.paused) {
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          // iOS can reset the element's volume to 1.0 when playback
          // resumes after an interruption (e.g. the mic opening), so
          // setting it before play() is not enough — re-apply the
          // target once the resume has actually happened. A fade-out
          // in progress owns the volume instead, so leave it alone.
          p.then(() => {
            if (fade || audioFailed) return;
            try {
              const now = targetVolume();
              if (Math.abs(audio.volume - now) > 0.001) audio.volume = now;
            } catch (e) { /* ignore */ }
          });
        }
        if (p && typeof p.catch === 'function') p.catch(() => { /* refused; a later tick or tap retries */ });
      } else if (!shouldPlay && !audio.paused) {
        audio.pause();
      }
    } catch (e) { /* ignore */ }
    // Keep the tick running only while there is music to manage.
    if (lessonActive() || previewHost) ensureTimer();
    else clearTimer();
  }

  function lessonHost() {
    // The lesson's host character. Lessons carry `host` directly; if
    // it is missing, look it up from the theme (session.category is
    // the theme name). Review and other host-less sessions return
    // null and fall back to the default track.
    try {
      if (typeof session !== 'undefined' && session && session.host) return session.host;
      if (typeof session !== 'undefined' && session && session.category && typeof THEMES !== 'undefined' && Array.isArray(THEMES)) {
        const th = THEMES.find((t) => t.name === session.category);
        if (th && th.host) return th.host;
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  // ---- Settings preview ----
  // Play one character's track outside a lesson, through the same
  // element. Only one preview plays at a time; it plays even if the
  // lesson-music toggle is off (it is a deliberate listen), and it
  // stops when the user leaves Settings or starts a lesson.
  function previewFor(host) {
    if (!HOST_TRACK[host]) return false;
    if (lessonActive()) return false;
    if (!ensureAudio()) return false;
    loadTrack(host);
    previewHost = host;
    refreshPreviewButtons();
    applyVolume();
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
    applyVolume();
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
    note.textContent = 'Hear each character\'s track without starting a lesson. Tap play to listen; tap again to stop.';
    section.append(note);
    previewButtons = {};
    for (const host of Object.keys(HOST_TRACK)) {
      const row = document.createElement('div');
      row.className = 'setting-row music-preview-row';
      const name = document.createElement('span');
      name.textContent = CHARACTER_NAMES[host] + ' — ' + TRACK_LABEL[host];
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

  function updateMusic() {
    const active = lessonActive();
    if (!active) {
      // The lesson just ended (or the learner went home): fade the
      // track out over about a second and a half instead of cutting
      // it off. A preview is not a lesson, so it never fades here.
      if (wasInLesson && !previewHost) startFade();
      wasInLesson = false;
      applyVolume();
      return;
    }
    if (!musicOn()) {
      // Turning music off stops it at once — no fade.
      wasInLesson = false;
      applyVolume();
      return;
    }
    // A lesson is active: any fade is over — cancel it and play the
    // lesson's track.
    fade = null;
    // A lesson started: stop any preview so it cannot clash with the
    // lesson's own music.
    if (previewHost) stopPreview();
    // A lesson has started when we are on its first exercise and we
    // were not in a lesson before. Load the host character's track and
    // keep it for the whole lesson; re-rendering the first exercise
    // does not reload it, but replaying the lesson restarts it.
    if (!currentHost || (typeof index === 'number' && index === 0 && !wasInLesson)) {
      loadTrack(lessonHost() || DEFAULT_HOST);
    }
    wasInLesson = true;
    applyVolume();
  }

  // Duck while a pronunciation clip or the system voice is playing;
  // answer-speech.js calls these through its hook().
  window.duolibeeSpeechStart = function () { speechPlaying = true; speechSince = Date.now(); applyVolume(); };
  window.duolibeeSpeechEnd = function () { speechPlaying = false; speechSince = 0; applyVolume(); };

  // The microphone is recording a speaking answer; speaking.js calls
  // these when a recording starts and stops. While recording the
  // track dims to 5% and keeps playing — it never pauses for the
  // microphone. If iOS pauses the element when the mic activates,
  // the tick starts it again (applyVolume plays whenever the target
  // is above 0).
  window.duolibeeMicStart = function () { micActive = true; micSince = Date.now(); applyVolume(); };
  window.duolibeeMicEnd = function () { micActive = false; micSince = 0; applyVolume(); };

  function setMusicEnabled(on) {
    state.settings.music = !!on;
    save();
    updateMusic();
  }
  window.setMusicEnabled = setMusicEnabled;

  // The Settings volume slider, 0–100. Stored as 0–1 in
  // state.settings.musicVolume. Saves and applies at once, without
  // re-rendering Settings, so dragging the slider is smooth.
  function setMusicVolume(pct) {
    const v = Number(pct);
    state.settings.musicVolume = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) / 100 : 1;
    save();
    applyVolume();
  }
  window.setMusicVolume = setMusicVolume;

  // Start/stop with the lesson, and re-check the volume on every render.
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
      note.textContent = 'Each character has their own track. It quiets itself for listening and speaking questions.';
      label.append(note);
      card.append(label);
    }
    // Volume slider, right after the music toggle. Rebuilt on every
    // Settings render (like the preview section below), so its position
    // and percentage always match the saved setting.
    const oldVol = document.getElementById('music-volume-setting');
    if (oldVol && typeof oldVol.remove === 'function') oldVol.remove();
    const volLabel = document.createElement('label');
    volLabel.className = 'setting-row';
    volLabel.id = 'music-volume-setting';
    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.id = 'music-volume-slider';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.step = '5';
    volSlider.value = String(Math.round(musicLevel() * 100));
    const volPct = document.createElement('span');
    volPct.id = 'music-volume-value';
    volPct.textContent = Math.round(musicLevel() * 100) + '%';
    volSlider.oninput = () => {
      setMusicVolume(Number(volSlider.value));
      volPct.textContent = Math.round(musicLevel() * 100) + '%';
    };
    volLabel.append(document.createTextNode(' Music volume '), volSlider, volPct);
    const volNote = document.createElement('span');
    volNote.className = 'setting-note';
    volNote.textContent = 'Full is as loud as it gets — the music never plays louder than this.';
    volLabel.append(volNote);
    card.append(volLabel);
    buildPreviewSection(card);
  };

  window.duolibeeMusic = {
    updateMusic, setMusicEnabled, setMusicVolume,
    get musicLevel() { return musicLevel(); },
    get playing() { return !!audio && !audio.paused && currentVolume() > 0; },
    get volume() { return currentVolume(); },
    get gain() { return currentVolume(); },
    get track() { return loadedFile; },
    get host() { return currentHost; },
    get tracks() { return Object.values(HOST_TRACK); },
    get audio() { return audio; },
    micStart: function () { window.duolibeeMicStart(); },
    micEnd: function () { window.duolibeeMicEnd(); },
    get recording() { return recordingActive(); },
    get fading() { return fade !== null; },
    preview: previewFor,
    togglePreview,
    stopPreview,
    get previewHost() { return previewHost; },
    get previewing() { return previewHost !== null; },
  };
})();
