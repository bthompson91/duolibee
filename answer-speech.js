(() => {
  const tagalogTerms = new Set();
  function indexTerms() {
    tagalogTerms.clear();
    Object.values(ITEM_BY_KEY || {}).forEach(item => {
      if (item && item.t) tagalogTerms.add(norm(item.t));
    });
    (THEMES || []).forEach(theme => {
      (theme.sentences || []).forEach(sentence => {
        if (sentence && sentence.t) tagalogTerms.add(norm(sentence.t));
      });
    });
  }
  function isTagalogText(text) {
    if (!tagalogTerms.size) indexTerms();
    return tagalogTerms.has(norm(text));
  }
  function speakAnswer(text, tagalog) {
    if (!window.speechSynthesis || !text) return;
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (tagalog) {
        const picked = pickVoice();
        utterance.text = tagalogSpeechText(text, picked.native);
        utterance.lang = picked.voice ? picked.voice.lang : 'fil-PH';
        if (picked.voice) utterance.voice = picked.voice;
        utterance.rate = Number(state.settings.rate) || 0.9;
      } else {
        const voices = speechSynthesis.getVoices();
        const english = voices.find(v => /^en/i.test(v.lang) && v.default) || voices.find(v => /^en/i.test(v.lang));
        utterance.lang = english ? english.lang : 'en-AU';
        if (english) utterance.voice = english;
        utterance.rate = 1;
      }
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error(error);
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button.option, button.token, button.match');
    if (!button) return;
    const text = button.textContent.trim();
    if (!text) return;
    const tagalog = button.classList.contains('token') || isTagalogText(text);
    speakAnswer(text, tagalog);
  }, true);
  const originalCheckBuild = checkBuild;
  checkBuild = function() {
    const exercise = session.exercises[index];
    const correctBefore = correct;
    originalCheckBuild();
    if (correct > correctBefore) speakAnswer(exercise.answer, true);
  };
})();