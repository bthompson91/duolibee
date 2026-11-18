// DUOLIBEE speaking exercises.
//
// One 'speak' exercise per lesson: the learner hears the model (or reads the
// Tagalog), taps the microphone, says it, and taps Check. Grading uses the
// browser's own speech recognition (fil-PH) with generous matching, because
// recognition is imperfect — especially for learners. Nothing is graded
// until the learner taps Check, so a bad recognition pass can be re-tried.
// If recognition is unavailable or the microphone is denied, the exercise
// can be swapped for a written question with no penalty, like the audio
// exercises already do. Speaking can also be switched off in Settings,
// in which case speak exercises become written questions at render time.
//
// Audio never leaves the device except to the browser's speech-recognition
// service, if the browser uses one. No recording is stored by DUOLIBEE.
(() => {
  function recognitionClass() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function speakSupported() {
    return !!recognitionClass();
  }
  function levenshtein(a, b) {
    const x = String(a), y = String(b);
    if (x === y) return 0;
    if (!x.length) return y.length;
    if (!y.length) return x.length;
    let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i++) {
      const cur = [i];
      for (let j = 1; j <= y.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[y.length];
  }
  function speakSimilarity(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  }
  // Accept an exact match, a listed variant, or a close match. The tolerance
  // grows with the length of the target so short words stay strict.
  function speakAccepted(heard, item) {
    if (!heard || !item) return false;
    if (accepted(item, heard)) return true;
    const target = norm(item.t);
    if (!target) return false;
    const heardNorm = norm(heard);
    const tolerance = Math.max(1, Math.floor(target.length / 4));
    return levenshtein(heardNorm, target) <= tolerance || speakSimilarity(heard, item.t) >= 0.8;
  }
  function setStatus(text) {
    const el = document.getElementById('speak-status');
    if (el) el.textContent = text;
  }
  function setHeard(text) {
    const el = document.getElementById('speak-heard');
    if (el) el.textContent = text ? 'I heard: \u201c' + text + '\u201d' : '';
  }
  let recognizer = null;
  startSpeaking = function () {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak') return;
    if (session._answeredIndex === index) return;
    const Recog = recognitionClass();
    if (!Recog) {
      setStatus('Speaking is not supported in this browser. Use a written question instead.');
      return;
    }
    try { if (recognizer) recognizer.abort(); } catch (e) { /* already stopped */ }
    const rec = new Recog();
    recognizer = rec;
    rec.lang = 'fil-PH';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    setStatus('Listening\u2026 say it now.');
    rec.onresult = (event) => {
      const result = event.results && event.results[0];
      const best = result && result[0];
      const text = best ? best.transcript : '';
      session.speakHeard = text;
      setHeard(text);
      setStatus(text ? 'Tap \u201cCheck my pronunciation\u201d when you are ready.' : 'Didn\u2019t catch that \u2014 tap the microphone and try again.');
    };
    rec.onerror = (event) => {
      setStatus(event.error === 'not-allowed'
        ? 'Microphone access was denied. Allow the microphone, or use a written question instead.'
        : 'Speech recognition had a problem (' + event.error + '). Try again, or use a written question instead.');
    };
    rec.onend = () => {
      if (!session.speakHeard) setStatus('Didn\u2019t catch that \u2014 tap the microphone and try again.');
    };
    try { rec.start(); } catch (e) { setStatus('Could not start listening: ' + e.message); }
  };
  checkSpeaking = function () {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak') return;
    if (session._answeredIndex === index) return;
    if (!session.speakHeard) {
      setStatus('Tap the microphone and say it first.');
      return;
    }
    session._answeredIndex = index;
    const ok = speakAccepted(session.speakHeard, ex.item);
    if (ok) correct++;
    feedback(ok, ok ? 'Tama! Well spoken!' : 'I heard \u201c' + session.speakHeard + '\u201d. Correct: ' + ex.item.t);
  };
  function writtenQuestionFor(ex) {
    const options = seededShuffle([...new Set([ex.item.e, ...distractors(ex.item)])], index + 201);
    return { type: 'choice', prompt: 'What does \u201c' + ex.item.t + '\u201d mean?', options, answer: options.indexOf(ex.item.e), srsKeys: ex.srsKeys };
  }
  replaceSpeakWithChoice = function () {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak' || session._answeredIndex === index) return;
    session.exercises[index] = writtenQuestionFor(ex);
    renderExercise();
    setStatus('Speaking question replaced with a written question. No penalty.');
  };
  // Settings toggle: speaking defaults to on. Switching it off swaps speak
  // exercises for written questions at render time, like muting does audio.
  const originalSettings = renderSettings;
  renderSettings = function () {
    originalSettings();
    if (document.getElementById('speaking-setting')) return;
    const label = document.createElement('label');
    label.className = 'setting-row';
    label.id = 'speaking-setting';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.settings.speaking !== false;
    box.onchange = () => { state.settings.speaking = box.checked; save(); };
    label.append(box, document.createTextNode(' Speaking exercises'));
    const card = app.querySelector('.card');
    if (card) card.append(label);
  };
  const originalRender = renderExercise;
  renderExercise = function () {
    const ex = session && session.exercises && session.exercises[index];
    if (ex && ex.type === 'speak' && state.settings.speaking === false) {
      session.exercises[index] = writtenQuestionFor(ex);
    }
    originalRender();
  };
  // Exposed for tests and for other tools that need the matcher.
  window.speakAccepted = speakAccepted;
  window.speakSimilarity = speakSimilarity;
  window.speakSupported = speakSupported;
})();
