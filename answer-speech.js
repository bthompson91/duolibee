(() => {
  let active;
  function choose(list, pattern) { const matches = list.filter(v => pattern.test(v.lang || '')); return matches.find(v => v.default) || matches[0] || null; }
  function route(english) {
    const list = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    if (english) return {voice: choose(list, /^en([-_]|$)/i), lang: 'en'};
    const native = choose(list, /^(fil|tl|tgl)([-_]|$)/i);
    const voice = native || choose(list, /^ms([-_]|$)/i);
    return {voice, native: !!native, malay: !!voice && !native, lang: 'fil-PH'};
  }
  function status(text) {
    let el = document.getElementById('speech-status');
    if (!el) { el = document.createElement('p'); el.id = 'speech-status'; el.setAttribute('role', 'status'); app.append(el); }
    el.textContent = text;
  }
  pickVoice = () => route(false);
  fallbackVoice = () => route(false).voice;
  tagalogSpeechText = function(text, native) {
    if (native || !route(false).malay) return String(text);
    return String(text).replace(/\bmga\b/gi, 'manga').replace(/tso/gi, 'cho').replace(/\bng\b/gi, 'nung').replace(/dy/gi, 'j');
  };
  function hook(name) {
    try { const f = window[name]; if (typeof f === 'function') f(); } catch (e) { /* best-effort: never break speech */ }
  }
  // ---- Pre-recorded lesson audio ----
  // Every lesson phrase was synthesized once (tools/generate-audio.py) and
  // ships in assets/audio/. play() tries the file first and falls back to
  // the system voice when there is no file (or it fails to play). Words use
  // the lesson host's voice; sentences use their speaker's voice.
  let audioManifest = null;
  let audioManifestPromise = null;
  function loadAudioManifest() {
    if (audioManifest) return Promise.resolve(audioManifest);
    if (audioManifestPromise) return audioManifestPromise;
    audioManifestPromise = (typeof fetch === 'function'
      ? fetch('assets/audio/manifest.json', { cache: 'no-store' }).then(r => (r && r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null)).then(m => { audioManifest = m && m.entries ? m : null; if (!audioManifest) audioManifestPromise = null; return audioManifest; });
    return audioManifestPromise;
  }
  loadAudioManifest();
  // Pre-cache the current lesson's clips once the manifest arrives, in case
  // the lesson started before the manifest finished loading.
  loadAudioManifest().then(() => preloadLessonAudio());
  // Exposed for tests (mirrors characters.js exposing duolibeeCharacters).
  window.duolibeeLessonAudio = { load: loadAudioManifest, fileFor: audioFileFor, characterFor: audioCharacterFor, play, preload: preloadLessonAudio };
  // Pre-cache every clip a lesson needs (each word in Tagalog + English, each
  // sentence in Tagalog + English) so the first tap on any of them plays
  // instantly instead of waiting on a download. Fetches go through the
  // browser cache, so the Audio elements created later by play() reuse them.
  function preloadLessonAudio() {
    try {
      if (!audioManifest || !session || !session.items) return;
      const host = session.host || 'lumpy';
      const files = new Set();
      (session.items || []).forEach(it => {
        const f1 = audioFileWithFallback(it.t, host, false); if (f1) files.add(f1);
        const f2 = audioFileWithFallback(it.e, host, true); if (f2) files.add(f2);
      });
      const th = session.category ? (THEMES || []).find(t => t.name === session.category) : null;
      (session.exercises || []).forEach(ex => {
        if (!ex) return;
        const ch = ex.speaker || host;
        // The build exercise carries the sentence in ex.answer; the speak
        // exercises (word and sentence) carry their phrase in ex.item.
        if (ex.answer && typeof ex.answer === 'string') {
          const f = audioFileWithFallback(ex.answer, ch, false); if (f) files.add(f);
          if (th) {
            const s = (th.sentences || []).find(s => norm(s.t) === norm(ex.answer));
            if (s && s.e) { const fe = audioFileWithFallback(s.e, ch, true); if (fe) files.add(fe); }
          }
          // The build exercise shows the sentence as tappable word tokens;
          // pre-cache each word in the speaker's voice so the first tap
          // plays instantly. Tokens carry trailing punctuation ("ka?");
          // the lookup tries the raw token, then the normalized word.
          ex.answer.split(' ').forEach(w => {
            const fw = audioFileWithFallback(w, ch, false); if (fw) files.add(fw);
          });
        }
        if (ex.item && typeof ex.item.t === 'string') {
          const f = audioFileWithFallback(ex.item.t, ch, false); if (f) files.add(f);
          if (typeof ex.item.e === 'string') { const fe = audioFileWithFallback(ex.item.e, ch, true); if (fe) files.add(fe); }
        }
      });
      if (typeof fetch !== 'function') return;
      files.forEach(f => { try { fetch('assets/audio/' + f).catch(() => {}); } catch (e) { /* best-effort */ } });
    } catch (e) { /* pre-caching must never break a lesson */ }
  }
  // At lesson start, pre-cache that lesson's clips (the manifest load above
  // covers the case where the lesson was already in progress).
  if (typeof startLesson === 'function') {
    const _startLesson = startLesson;
    startLesson = function(id) { const r = _startLesson(id); preloadLessonAudio(); return r; };
  }
  function audioCharacterFor(text) {
    const value = norm(text);
    try {
      const ex = session && session.exercises && session.exercises[index];
      if (ex && ex.speaker) return ex.speaker;
      const th = session && session.category ? (THEMES || []).find(t => t.name === session.category) : null;
      if (th) {
        const s = (th.sentences || []).find(s => norm(s.t) === value);
        if (s && s.speaker) return s.speaker;
        // English text: the sentence whose translation this is.
        const se = (th.sentences || []).find(s => norm(s.e) === value);
        if (se && se.speaker) return se.speaker;
      }
      if (session && session.host) return session.host;
      const it = (ALL || []).find(x => norm(x.t) === value);
      if (it) {
        const t2 = (THEMES || []).find(t => t.name === it.theme);
        if (t2 && t2.host) return t2.host;
      }
      // English text outside a lesson: the word whose meaning this is.
      const itE = (ALL || []).find(x => norm(x.e) === value);
      if (itE) {
        const t3 = (THEMES || []).find(t => t.name === itE.theme);
        if (t3 && t3.host) return t3.host;
      }
    } catch (e) { /* fall through to Lumpy */ }
    return 'lumpy';
  }
  function audioFileFor(text, character, english) {
    if (!audioManifest) return null;
    const lang = english ? 'en' : 'tl';
    const e = audioManifest.entries;
    // v2 keys: character|lang|text (raw, then normalized). v1 manifests had
    // character|text with no language; try those too so an old manifest
    // still plays Tagalog instead of silently falling back to synthesis.
    return e[character + '|' + lang + '|' + text] || e[character + '|' + lang + '|' + norm(text)]
      || e[character + '|' + text] || e[character + '|' + norm(text)] || null;
  }
  // The speaker's clip for a word may be missing (a sentence edited after
  // the audio was generated, say); fall back to the lesson host's clip for
  // the same word, then to the word's own theme host, before giving up and
  // letting play() use the system voice — on a phone with no Tagalog voice
  // that fallback is silence.
  function audioFileWithFallback(text, character, english) {
    const tried = new Set();
    const tryChar = (ch) => {
      if (!ch || tried.has(ch)) return null;
      tried.add(ch);
      return audioFileFor(text, ch, english);
    };
    let file = tryChar(character);
    if (file) return file;
    if (session && session.host) { file = tryChar(session.host); if (file) return file; }
    const value = norm(text);
    const it = (ALL || []).find(x => norm(x.t) === value) || (ALL || []).find(x => norm(x.e) === value);
    if (it) {
      const t2 = (THEMES || []).find(t => t.name === it.theme);
      if (t2 && t2.host) { file = tryChar(t2.host); if (file) return file; }
    }
    return null;
  }
  let activeAudio = null;
  function stopAudioFile() {
    try { if (activeAudio) { activeAudio.pause(); activeAudio = null; } } catch (e) { activeAudio = null; }
  }
  function playAudioFile(file, slow) {
    try {
      stopAudioFile();
      if (window.speechSynthesis) speechSynthesis.cancel();
      const a = new Audio('assets/audio/' + file);
      activeAudio = a;
      if (slow) a.playbackRate = 0.62;
      a.onplaying = () => { if (activeAudio === a) { hook('duolibeeSpeechStart'); status('Playing recorded audio.'); } };
      a.onended = () => { if (activeAudio === a) { activeAudio = null; hook('duolibeeSpeechEnd'); status('Playback complete.'); } };
      a.onerror = () => { if (activeAudio === a) { activeAudio = null; hook('duolibeeSpeechEnd'); status('Recorded audio failed to play.'); } };
      hook('duolibeeSpeechStart');
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => { if (activeAudio === a) { activeAudio = null; hook('duolibeeSpeechEnd'); } });
      return true;
    } catch (e) {
      activeAudio = null;
      return false;
    }
  }
  function play(text, english = false, slow = false, character) {
    if (!text || state.settings.muted) return;
    // Recorded clips first, in both languages; system voice is the fallback.
    if (!audioManifest) loadAudioManifest();
    const file = audioFileWithFallback(text, character || audioCharacterFor(text), english);
    if (file && playAudioFile(file, slow)) return;
    if (!window.speechSynthesis) return status('Device speech is unavailable.');
    const selected = route(english);
    active = null; stopAudioFile(); speechSynthesis.cancel();
    if (!english && !selected.voice) return status('Tagalog audio unavailable: no Tagalog/Filipino or Malay voice is available.');
    const u = new SpeechSynthesisUtterance(selected.malay ? tagalogSpeechText(text, false) : String(text));
    active = u;
    if (selected.voice) u.voice = selected.voice;
    u.lang = selected.voice ? selected.voice.lang : selected.lang;
    u.rate = slow ? .62 : english ? 1 : Number(state.settings.rate) || .9;
    u.onstart = () => { if (active === u) { hook('duolibeeSpeechStart'); status('Playing: ' + (english ? 'English' : selected.malay ? 'Malay fallback' : 'Tagalog/Filipino')); } };
    u.onend = () => { if (active === u) { active = null; hook('duolibeeSpeechEnd'); status('Playback complete.'); } };
    u.onerror = e => { if (active === u) { active = null; hook('duolibeeSpeechEnd'); status('Speech error: ' + e.error + '. Tap Play to retry.'); } };
    // Start the talking animation here as well as on onstart: iOS often
    // never fires the utterance events, and the portrait must move while
    // the line plays. Starting twice is harmless (startTalking restarts).
    try { speechSynthesis.resume(); hook('duolibeeSpeechStart'); speechSynthesis.speak(u); } catch (e) { active = null; hook('duolibeeSpeechEnd'); status('Speech could not start: ' + e.message); }
  }
  speak = (text, slow) => play(text, false, slow);
  testVoice = () => play('Magandang araw! Ako si Lumpy.');
  const settings = renderSettings;
  renderSettings = function() {
    settings();
    app.querySelectorAll('select').forEach(select => {
      if (/voiceMode|setSetting\(["']voice["']/.test(select.getAttribute('onchange') || '')) (select.closest('label') || select).remove();
    });
    Array.from(app.children).forEach(el => { if (el.tagName === 'P' && el.textContent.startsWith('Speech voice:')) el.remove(); });
    app.querySelectorAll('button').forEach(button => {
      if (button.textContent.trim() === 'Test system voice' || /testVoice\(true\)/.test(button.getAttribute('onclick') || '')) button.remove();
      else if (/testVoice/.test(button.getAttribute('onclick') || '')) { button.textContent = '🔊 Test audio'; button.onclick = testVoice; }
    });
    const selected = route(false), p = document.createElement('p');
    p.textContent = 'Tagalog audio: ' + (selected.native ? 'system Tagalog/Filipino voice' : selected.malay ? 'system Malay voice (fallback)' : 'unavailable — no Tagalog/Filipino or Malay voice') + '. English audio: recorded clips where available, otherwise system English voice.';
    app.prepend(p);
    const test = document.createElement('button'); test.className = 'ghost'; test.textContent = 'Test English audio'; test.onclick = () => play('Audio test.', true); app.append(test);
  };
  function isTagalog(text) {
    const value = norm(text);
    return Object.values(ITEM_BY_KEY || {}).some(it => it && norm(it.t) === value) || (THEMES || []).some(th => (th.sentences || []).some(s => norm(s.t) === value));
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button.option, button.token, button.match');
    if (!button) return;
    const text = button.textContent.trim(); if (!text) return;
    let tagalog = button.classList.contains('token') || isTagalog(text);
    if (/^ml\d+$/.test(button.id)) tagalog = true;
    if (/^mr\d+$/.test(button.id)) tagalog = false;
    if (button.classList.contains('option') && session && session.exercises[index]) {
      const ex = session.exercises[index];
      if (ex.type === 'audio' || /^(Select the English|What does|Choose the English)/i.test(ex.prompt || '')) tagalog = false;
      else if (/^Select the Tagalog/i.test(ex.prompt || '')) tagalog = true;
    }
    play(text, !tagalog);
  }, true);
  const check = checkBuild;
  checkBuild = function() { const ex = session.exercises[index], before = correct; check(); if (correct > before) play(ex.answer); };
  addToken = function(i) {
    const position = session.built.indexOf(i);
    if (position !== -1) session.built.splice(position, 1); else session.built.push(i);
    const built = document.getElementById('built'); if (built) built.textContent = session.built.map(i => session.bank[i]).join(' ');
  };
})();
