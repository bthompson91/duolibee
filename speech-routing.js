// DUOLIBEE speech: reliable Filipino-first TTS with fallback diagnostics
(() => {
  function isNative(v) {
    return !!v && (/^(fil|tl|tgl)([-_]|$)/i.test(v.lang || '') || /filipino|tagalog/i.test(v.name || ''));
  }

  function pickVoice() {
    const list = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    return (
      list.find(isNative) ||
      list.find(v => v.name === state.settings.voice) ||
      list.find(v => /^ms([-_]|$)/i.test(v.lang || '')) ||
      list.find(v => v.default) ||
      list[0] ||
      null
    );
  }

  speak = function (text, slow) {
    if (!window.speechSynthesis) {
      alert('Device speech is unavailable.');
      return;
    }

    try {
      const voice = pickVoice();
      const usePhonetics = !voice || !isNative(voice);
      const input = usePhonetics ? transliterateAbakada(String(text)) : String(text);
      const utterance = new SpeechSynthesisUtterance(input);

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'fil-PH';
      }

      utterance.rate = slow ? 0.62 : (Number(state.settings.rate) || 0.9);
      utterance.onerror = event => console.error('DUOLIBEE speech error', event);

      speechSynthesis.cancel();
      setTimeout(() => speechSynthesis.speak(utterance), 60);

      console.info('DUOLIBEE speech', {
        voice: voice ? voice.name + ' (' + voice.lang + ')' : 'Browser fil-PH selection',
        phonetics: usePhonetics,
        text: input
      });
    } catch (e) {
      console.error('DUOLIBEE speech failure', e);
    }
  };

  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => console.info('DUOLIBEE voices', speechSynthesis.getVoices().map(v => v.name + ' / ' + v.lang));
  }
})();
