// DUOLIBEE character layer (Lumpia Lingo cast).
//
// The lesson data (data/lessons.json) already carries the character layer:
// each theme has a host + intro, and each sentence has a speaker. This file
// only renders it — it never touches SRS keys, _origin, _retry, grading,
// or lesson completion. Everything here is best-effort: if the character
// registry fails to load, lessons still render with names and intro text,
// just without portraits; if the talking animation cannot run, the
// portrait simply stays on its mouth-closed frame.
//
// Art lives in assets/characters/ (downscaled to 512px). The registry is
// data/characters.json. The talking animation alternates a character's
// mouth-closed / mouth-open frames for the current state while a line is
// being spoken (answer-speech.js calls duolibeeSpeechStart/End around
// playback); it settles on mouth-closed when speech ends, and never
// animates when the learner prefers reduced motion.
(() => {
  let REGISTRY = null;
  let readyResolve = null;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  function loadRegistry() {
    const done = (data) => { REGISTRY = data && Array.isArray(data.characters) ? data : { characters: [] }; if (readyResolve) readyResolve(REGISTRY); return REGISTRY; };
    try {
      if (typeof fetch !== 'function') return Promise.resolve(done(null));
      return fetch('data/characters.json', { cache: 'no-store' })
        .then((r) => (r && r.ok ? r.json() : null))
        .then(done, () => done(null));
    } catch (e) {
      return Promise.resolve(done(null));
    }
  }
  loadRegistry();

  function characterById(id) {
    if (!id || !REGISTRY) return null;
    return REGISTRY.characters.find((c) => c.id === id) || null;
  }
  // Display name: from the registry when loaded, otherwise derived from
  // the id ("tito-bong" -> "Tito Bong") so cards render before it loads.
  function displayName(id) {
    const c = characterById(id);
    if (c && c.name) return c.name;
    return String(id || '').split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
  }
  function artFor(id, state, mouth) {
    const c = characterById(id);
    if (!c || !c.states) return null;
    const s = c.states[state || 'neutral'] || c.states.neutral;
    if (!s) return null;
    return s[mouth || 'closed'] || s.closed || null;
  }
  function portraitFor(id) {
    const c = characterById(id);
    if (c && c.portrait) return c.portrait;
    return artFor(id, 'neutral', 'closed');
  }
  function imgTag(id, state, imgId) {
    const src = portraitFor(id);
    const alt = displayName(id);
    // No src until the registry is known: fillPortraits() fills it in
    // when the registry arrives, instead of showing a broken image.
    return '<img id="' + imgId + '" data-character="' + esc(id) + '" data-state="' + esc(state || 'neutral') + '"' +
      (src ? ' src="' + esc(src) + '"' : '') + ' alt="' + esc(alt) + '">';
  }
  function hostCardHTML(lesson) {
    if (!lesson || !lesson.host) return '';
    return '<div class="character-host">' + imgTag(lesson.host, 'neutral', 'host-portrait') +
      '<div><strong>' + esc(displayName(lesson.host)) + '</strong>' +
      (lesson.intro ? '<p>' + esc(lesson.intro) + '</p>' : '') + '</div></div>';
  }
  function speakerCardHTML(ex) {
    if (!ex || !ex.speaker) return '';
    return '<div class="character-speaker">' + imgTag(ex.speaker, 'neutral', 'speaker-portrait') +
      '<div><strong>' + esc(displayName(ex.speaker)) + '</strong></div></div>';
  }
  // Fill in portrait sources once the registry has loaded (cards rendered
  // earlier render without a src; this completes them in place).
  function fillPortraits() {
    try {
      const imgs = document.querySelectorAll ? document.querySelectorAll('img[data-character]') : [];
      for (const img of imgs) {
        if (img.src) continue;
        const src = portraitFor(img.dataset ? img.dataset.character : null);
        if (src) img.src = src;
      }
    } catch (e) { /* best-effort */ }
  }
  ready.then(fillPortraits);

  // ---- Talking animation ----
  let talkTimer = null;
  let talkImg = null;
  let talkOpen = false;
  let talkClosedSrc = null;
  let talkOpenSrc = null;
  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }
  function startTalking(img, id, state, intervalMs) {
    try {
      stopTalking();
      if (!img || reducedMotion()) return false;
      const closed = artFor(id, state, 'closed');
      const open = artFor(id, state, 'open');
      if (!closed || !open || closed === open) return false;
      talkImg = img;
      talkClosedSrc = closed;
      talkOpenSrc = open;
      talkOpen = false;
      img.src = closed;
      talkTimer = setInterval(() => {
        try {
          if (!talkImg) return;
          talkOpen = !talkOpen;
          talkImg.src = talkOpen ? talkOpenSrc : talkClosedSrc;
        } catch (e) { /* best-effort */ }
      }, intervalMs || 180);
      return true;
    } catch (e) {
      return false;
    }
  }
  function stopTalking() {
    try {
      if (talkTimer) { clearInterval(talkTimer); talkTimer = null; }
      if (talkImg && talkClosedSrc) { try { talkImg.src = talkClosedSrc; } catch (e) { /* ignore */ } }
    } catch (e) { /* best-effort */ }
    talkImg = null;
    talkClosedSrc = null;
    talkOpenSrc = null;
    talkOpen = false;
  }
  // Called by answer-speech.js around speech playback. Only animates when
  // the current exercise shows a speaker portrait.
  window.duolibeeSpeechStart = function () {
    try {
      const img = document.getElementById ? document.getElementById('speaker-portrait') : null;
      if (!img) return;
      const id = img.dataset ? img.dataset.character : null;
      const state = (img.dataset && img.dataset.state) || 'neutral';
      startTalking(img, id, state);
    } catch (e) { /* best-effort */ }
  };
  window.duolibeeSpeechEnd = function () {
    try { stopTalking(); } catch (e) { /* best-effort */ }
  };

  // ---- Render: host card on the learn screen, speaker card on sentence exercises ----
  const style = document.createElement('style');
  style.textContent = '.character-host,.character-speaker{display:flex;align-items:center;gap:10px;margin-bottom:12px}.character-host img,.character-speaker img{width:64px;height:64px;object-fit:contain;flex:0 0 auto}.character-host p{margin:2px 0 0}';
  if (document.head) document.head.appendChild(style);
  const originalRender = renderExercise;
  renderExercise = function () {
    try { stopTalking(); } catch (e) { /* best-effort */ }
    originalRender();
    try {
      const ex = session && session.exercises && session.exercises[index];
      if (!ex) return;
      const card = app.querySelector('.card');
      if (!card) return;
      let html = '';
      if (ex.type === 'learn' && session.host) html = hostCardHTML(session);
      else if (ex.speaker && (ex.type === 'build' || ex.type === 'speak')) html = speakerCardHTML(ex);
      if (!html) return;
      const div = document.createElement('div');
      div.innerHTML = html;
      card.prepend(div);
      fillPortraits();
    } catch (e) { /* rendering the lesson must never break */ }
  };

  // Exposed for tests.
  window.duolibeeCharacters = {
    ready, characterById, displayName, artFor, portraitFor,
    hostCardHTML, speakerCardHTML, fillPortraits, startTalking, stopTalking,
    registry: () => REGISTRY,
  };
})();
