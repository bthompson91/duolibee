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
  function play(text, english = false, slow = false) {
    if (!text || state.settings.muted) return;
    if (!window.speechSynthesis) return status('Device speech is unavailable.');
    const selected = route(english);
    active = null; speechSynthesis.cancel();
    if (!english && !selected.voice) return status('Tagalog audio unavailable: no Tagalog/Filipino or Malay voice is available.');
    const u = new SpeechSynthesisUtterance(selected.malay ? tagalogSpeechText(text, false) : String(text));
    active = u;
    if (selected.voice) u.voice = selected.voice;
    u.lang = selected.voice ? selected.voice.lang : selected.lang;
    u.rate = slow ? .62 : english ? 1 : Number(state.settings.rate) || .9;
    u.onstart = () => { if (active === u) status('Playing: ' + (english ? 'English' : selected.malay ? 'Malay fallback' : 'Tagalog/Filipino')); };
    u.onend = () => { if (active === u) { active = null; status('Playback complete.'); } };
    u.onerror = e => { if (active === u) { active = null; status('Speech error: ' + e.error + '. Tap Play to retry.'); } };
    try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch (e) { active = null; status('Speech could not start: ' + e.message); }
  }
  speak = (text, slow) => play(text, false, slow);
  testVoice = () => play('Magandang araw! Ako si DUOLIBEE.');
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
    p.textContent = 'Tagalog audio: ' + (selected.native ? 'system Tagalog/Filipino voice' : selected.malay ? 'system Malay voice (fallback)' : 'unavailable — no Tagalog/Filipino or Malay voice') + '. English audio: system English voice.';
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
