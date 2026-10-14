(() => {
  function native(v) { return !!v && (/^(fil|tl|tgl)([-_]|$)/i.test(v.lang || '') || /filipino|tagalog/i.test(v.name || '')); }
  function route() {
    const list = speechSynthesis.getVoices();
    return list.find(native) || list.find(v => v.name === state.settings.voice) || list.find(v => /^ms([-_]|$)/i.test(v.lang || '')) || list.find(v => v.default) || null;
  }
  speak = function(text, slow) {
    if (!window.speechSynthesis) return alert('Device speech is unavailable.');
    const v = route();
    const u = new SpeechSynthesisUtterance(String(text));
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'fil-PH'; }
    u.rate = slow ? 0.62 : (Number(state.settings.rate) || 0.9);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    console.info('DUOLIBEE speech', {voice:v ? v.name : 'Browser fil-PH selection', language:u.lang, text:u.text});
  };
  const originalSettings = renderSettings;
  renderSettings = function() {
    originalSettings();
    const p = document.createElement('p');
    const v = window.speechSynthesis ? route() : null;
    p.textContent = 'Active speech: ' + (v ? v.name + ' (' + v.lang + ')' : 'Browser fil-PH selection') + '. All voices receive original Tagalog unchanged. Pronunciation guides are visual only. Native Filipino voices take priority.';
    app.prepend(p);
  };
  function showMascot() {
    const hero = app.querySelector('.hero-mascot');
    if (!hero || hero.querySelector('img[data-bee]')) return;
    const img = document.createElement('img');
    img.dataset.bee = 'welcome';
    img.src = 'assets/mascot-welcome.png';
    img.alt = 'DUOLIBEE welcome bee';
    img.style.cssText = 'display:block!important;width:150px!important;max-width:40%!important;height:auto!important;object-fit:contain;flex-shrink:0;margin:12px auto;';
    hero.append(img);
  }
  const originalHome = renderHome;
  renderHome = function() { originalHome(); showMascot(); };
  showMascot();
})();
