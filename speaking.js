// DUOLIBEE speaking exercises.
//
// One 'speak' exercise per lesson: the learner hears the model (or reads the
// Tagalog), taps the microphone, says it, and taps Check. Grading uses the
// browser's own speech recognition with generous matching, because
// recognition is imperfect — especially for learners. Nothing is graded
// until the learner taps Check, so a bad recognition pass can be re-tried.
//
// The recognition service belongs to the browser/device, not to DUOLIBEE,
// so when it cannot start the app tries to fix the cause before giving up:
//   1. In-app browsers on iPhones run in a plain webview that does not
//      offer the service at all. The app detects that and says so plainly
//      (open the site in Safari), instead of offering a microphone that
//      can never work.
//   2. On iPhones, speech recognition sometimes needs the microphone
//      permission granted first, as a separate permission from the speech
//      prompt. On iOS the app requests the microphone via getUserMedia
//      before starting recognition (desktop browsers skip this step).
//   3. If the service rejects the language tag, the app retries once
//      with the other Tagalog tag ('fil-PH', then 'tl-PH').
// Only when those are exhausted does the exercise become a written
// question, with no penalty. Some failures are terminal and retrying
// cannot help, so they are not presented as "try again":
//   - 'service-not-allowed': the service is unavailable in this browser
//     on this device (Siri off, in-app browser, or a browser policy).
//     Later speak exercises in the same session become written questions
//     too, so the lesson never dead-ends. Reloading gives speaking
//     another chance.
//   - 'not-allowed' (microphone denied) and 'audio-capture' (no mic):
//     this exercise becomes a written question; the next speak exercise
//     still offers the microphone, in case the permission is fixed.
//   - 'network' and 'no-speech': retryable — the learner is asked to
//     try the microphone again.
// Speaking can also be switched off in Settings, in which case speak
// exercises become written questions at render time.
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
  function userAgent() {
    return (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  }
  function isIOS() {
    const ua = userAgent();
    return /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandaloneWebApp() {
    // iOS only: true when the site was launched from a Home Screen icon.
    return typeof navigator !== 'undefined' && navigator.standalone === true;
  }
  function isInAppBrowser() {
    // On iOS every browser uses WebKit, but only Safari itself offers the
    // speech recognition service. In-app browsers run in a plain webview:
    // their user agent has no "Safari/" token, or names another browser
    // (Chrome, Firefox and Edge on iOS are all webviews too).
    if (!isIOS()) return false;
    const ua = userAgent();
    return !/Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line|Twitter/.test(ua);
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
    if (el) el.textContent = text ? 'I heard: “' + text + '”' : '';
  }
  // Set once a terminal service failure happens; in-memory only, so reloading
  // the page gives speaking another chance (for example after Siri is turned
  // on or the browser is changed).
  let speechUnavailable = false;
  let recognizer = null;
  const SPEAK_LANGS = ['fil-PH', 'tl-PH'];
  function writtenQuestionFor(ex) {
    const options = seededShuffle([...new Set([ex.item.e, ...distractors(ex.item)])], index + 201);
    return { type: 'choice', prompt: 'What does “' + ex.item.t + '” mean?', options, answer: options.indexOf(ex.item.e), srsKeys: ex.srsKeys };
  }
  // Swap the current speak exercise for a written question and explain why.
  // The note is added after rendering: the speak UI (and its status line)
  // is gone once the exercise is a choice question.
  function swapToWritten(message) {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak' || session._answeredIndex === index) return false;
    session.exercises[index] = writtenQuestionFor(ex);
    renderExercise();
    if (message) {
      const card = app.querySelector('.card');
      if (card) {
        const note = document.createElement('p');
        note.className = 'speak-note';
        note.setAttribute('role', 'status');
        note.textContent = message;
        card.prepend(note);
      }
    }
    return true;
  }
  // On iOS, ask for the microphone first: speech recognition sometimes
  // needs that permission granted separately before it will start. If the
  // microphone is denied, the normal error path explains it; any other
  // microphone problem still lets recognition have a try.
  function primeMicThen(next) {
    const media = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!media) { next(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; next(); } };
    try {
      const p = navigator.mediaDevices.getUserMedia({ audio: true });
      if (p && typeof p.then === 'function') {
        p.then((stream) => {
          try { (stream.getTracks ? stream.getTracks() : []).forEach((tr) => { if (tr.stop) tr.stop(); }); } catch (e) { /* ignore */ }
          finish();
        }, (err) => {
          if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
            swapToWritten('Microphone access was denied, so this became a written question. No penalty — allow the microphone in your browser settings and the next speaking question will offer the microphone again.');
          } else {
            finish();
          }
        });
      } else {
        finish();
      }
    } catch (e) {
      finish();
    }
  }
  function attemptRecognition(langIndex) {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak' || session._answeredIndex === index) return;
    const Recog = recognitionClass();
    if (!Recog) {
      speechUnavailable = true;
      swapToWritten('Speaking isn’t supported in this browser, so this became a written question. No penalty.');
      return;
    }
    try { if (recognizer) recognizer.abort(); } catch (e) { /* already stopped */ }
    const rec = new Recog();
    recognizer = rec;
    rec.lang = SPEAK_LANGS[langIndex] || SPEAK_LANGS[0];
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let attemptFailed = false;
    setStatus('Listening… say it now.');
    rec.onresult = (event) => {
      const result = event.results && event.results[0];
      const best = result && result[0];
      const text = best ? best.transcript : '';
      session.speakHeard = text;
      setHeard(text);
      setStatus(text ? 'Tap “Check my pronunciation” when you are ready.' : 'Didn’t catch that — tap the microphone and try again.');
    };
    rec.onerror = (event) => {
      attemptFailed = true;
      const err = (event && event.error) || '';
      if ((err === 'service-not-allowed' || err === 'language-not-supported') && langIndex + 1 < SPEAK_LANGS.length) {
        // The service may know the language under its other tag; try once.
        attemptRecognition(langIndex + 1);
      } else if (err === 'service-not-allowed' || err === 'language-not-supported') {
        speechUnavailable = true;
        swapToWritten(isIOS()
          ? 'Speech recognition isn’t available in this browser on this device. On iPhones it needs Siri turned on (Settings → Siri) and the microphone allowed for Safari. This became a written question instead. No penalty.'
          : 'Speech recognition isn’t available in this browser on this device. This became a written question instead. No penalty.');
      } else if (err === 'not-allowed') {
        swapToWritten('Microphone access was denied, so this became a written question. No penalty — allow the microphone in your browser settings and the next speaking question will offer the microphone again.');
      } else if (err === 'audio-capture') {
        swapToWritten('No microphone was found, so this became a written question. No penalty.');
      } else if (err === 'network') {
        setStatus('Couldn’t reach the speech recognition service — check your connection and tap the microphone to try again.');
      } else {
        setStatus('Speech recognition had a problem (' + err + '). Tap the microphone to try again, or use a written question instead.');
      }
    };
    rec.onend = () => {
      if (!attemptFailed && !session.speakHeard) setStatus('Didn’t catch that — tap the microphone and try again.');
    };
    try { rec.start(); } catch (e) { setStatus('Could not start listening: ' + e.message); }
  }
  startSpeaking = function () {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak') return;
    if (session._answeredIndex === index) return;
    if (!recognitionClass()) {
      speechUnavailable = true;
      swapToWritten('Speaking isn’t supported in this browser, so this became a written question. No penalty.');
      return;
    }
    if (isStandaloneWebApp()) {
      // A Home Screen app runs in a Safari view, not in Safari itself,
      // and the speech service is not offered there — even though the
      // microphone permission works. Say so plainly instead of offering
      // a microphone that can never work in this context.
      speechUnavailable = true;
      swapToWritten('You’re using duolibee from the Home Screen, which runs it in a Safari view that doesn’t offer speech recognition. Open duolibee in the Safari app itself to use speaking — this became a written question instead. No penalty.');
      return;
    }
    if (isInAppBrowser()) {
      // No code can enable the service in a plain webview; say so plainly
      // instead of offering a microphone that can never work.
      speechUnavailable = true;
      swapToWritten('This looks like an in-app browser, which doesn’t offer speech recognition on iPhones. Open duolibee in Safari to use speaking — this became a written question instead. No penalty.');
      return;
    }
    if (isIOS()) {
      primeMicThen(() => attemptRecognition(0));
    } else {
      attemptRecognition(0);
    }
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
    feedback(ok, ok ? 'Tama! Well spoken!' : 'I heard “' + session.speakHeard + '”. Correct: ' + ex.item.t);
  };
  replaceSpeakWithChoice = function () {
    swapToWritten('Speaking question replaced with a written question. No penalty.');
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
    if (ex && ex.type === 'speak' && (state.settings.speaking === false || speechUnavailable)) {
      session.exercises[index] = writtenQuestionFor(ex);
    }
    originalRender();
  };
  // Exposed for tests: the matcher, and the environment detection that
  // decides whether speaking can work at all in this browser context.
  window.duolibeeSpeakingEnv = { isIOS, isInAppBrowser, isStandaloneWebApp };
  window.speakAccepted = speakAccepted;
  window.speakSimilarity = speakSimilarity;
  window.speakSupported = speakSupported;
})();
