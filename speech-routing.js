(() => {
  function native(v) { return !!v && (/^(fil|tl|tgl)([-_]|$)/i.test(v.lang || '') || /filipino|tagalog/i.test(v.name || '')); }
  function route() {
    const list = speechSynthesis.getVoices();
    const filipino = list.find(native);
    if (filipino) return {voice:filipino, phonetic:false};
    const selected = list.find(v => v.name === state.settings.voice);
    const malay = list.find(v => /^ms([-_]|$)/i.test(v.lang || ''));
    return {voice:selected || malay || list.find(v => v.default) || null, phonetic:true};
  }
  speak = function(text, slow) {
    if (!window.speechSynthesis) return alert('Device speech is unavailable.');
    const r = route();
    const input = r.phonetic && r.voice ? transliterateAbakada(String(text)) : String(text);
    const u = new SpeechSynthesisUtterance(input);
    if (r.voice) { u.voice = r.voice; u.lang = r.voice.lang; } else { u.lang = 'fil-PH'; }
    u.rate = slow ? 0.62 : (Number(state.settings.rate) || 0.9);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    console.info('DUOLIBEE speech', {voice:r.voice ? r.voice.name : 'Browser fil-PH selection', language:u.lang, text:input});
  };
  const originalSettings = renderSettings;
  renderSettings = function() {
    originalSettings();
    const p = document.createElement('p');
    if (!window.speechSynthesis) p.textContent = 'Device speech is unavailable.';
    else {
      const r = route();
      p.textContent = 'Active speech: ' + (r.voice ? r.voice.name + ' (' + r.voice.lang + ')' : 'Browser fil-PH selection') + '. Input: ' + (r.phonetic && r.voice ? 'Fallback phonetics; no Filipino voice detected.' : 'Original Tagalog, unchanged.') + ' Native Filipino voices always take priority over saved overrides.';
    }
    app.prepend(p);
  };
})();
