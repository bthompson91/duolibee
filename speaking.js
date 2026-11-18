// DUOLIBEE speaking exercises.
//
// One 'speak' exercise per lesson: the learner hears the model (or reads the
// Tagalog), taps the microphone, says it, and taps Check. Grading uses
// generous matching, because recognition is imperfect — especially for
// learners. Nothing is graded until the learner taps Check, so a bad
// recognition pass can be re-tried.
//
// Speaking is tried in this order, and the exercise only becomes a written
// question when every path is exhausted:
//   1. The browser's own speech recognition (fil-PH, then tl-PH, then
//      en-US). Free and instant where it works. On iPhones it needs the
//      microphone primed first, and it is not offered at all in Home
//      Screen apps or in-app browsers, or for a language the phone does
//      not ship as a dictation language (Apple does not ship Filipino
//      dictation, so the Tagalog tags can never work on an iPhone).
//   2. Server transcription: the browser records a few seconds of audio
//      (MediaRecorder — works wherever the microphone works, including
//      the Home Screen app) and the backend transcribes it with Gemini.
//      The audio is never stored. If the backend cannot be reached, or
//      has not been deployed yet, this step is skipped silently.
//   3. On-device Whisper, only when the learner switched it on in
//      Settings (enabling it downloads the ~40 MB model, once). The same
//      recording is decoded to 16 kHz mono and transcribed on the device.
//   4. A written question, with no penalty.
//
// Audio never leaves the device except to the browser's speech-recognition
// service or to the duolibee backend for transcription, if the browser uses
// one. No recording is stored by DUOLIBEE.
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
  function setMicLabel(text) {
    const el = document.getElementById('speak-mic');
    if (el) el.textContent = text;
  }
  // Set once the browser's own recognition has terminally failed; in-memory
  // only, so reloading the page gives it another chance. It does not swap
  // the exercise any more: the record paths below still work.
  let browserSpeechDead = false;
  let recognizer = null;
  // Tried in order. 'en-US' is a last resort: if Filipino is not set up as
  // a dictation language on the device, both Tagalog tags are rejected, and
  // an English model transcribing the word phonetically can still pass the
  // generous matcher. It is only reached after both Tagalog tags fail.
  const SPEAK_LANGS = ['fil-PH', 'tl-PH', 'en-US'];
  // The backend's transcription endpoint (same host as the chat backend).
  // If it is not deployed yet, or cannot be reached, the call fails and the
  // next fallback runs — the lesson never depends on it.
  const TRANSCRIBE_API = 'https://158-179-30-201.sslip.io/duolibee/chat/transcribe';
  function writtenQuestionFor(ex) {
    // A sentence speak falls back to typing the sentence: a choice would
    // give the long English sentence away among single-word distractors.
    if (ex.sentence) return { type: 'translate', prompt: 'Translate: ' + ex.item.e, item: ex.item, srsKeys: ex.srsKeys, _origin: ex._origin, _retry: ex._retry };
    const options = seededShuffle([...new Set([ex.item.e, ...distractors(ex.item)])], index + 201);
    // Keep the exercise's identity: lesson-retries.js credits mastery by
    // _origin, so a replacement without it can never be credited and the
    // lesson can never finish. _retry keeps a swapped retry from counting
    // as a first attempt.
    return { type: 'choice', prompt: 'What does “' + ex.item.t + '” mean?', options, answer: options.indexOf(ex.item.e), srsKeys: ex.srsKeys, _origin: ex._origin, _retry: ex._retry };
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
    if (!Recog) { startRecording(); return; }
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
        // The browser service is dead for this session, but recording
        // still works — offer that instead of swapping the exercise.
        browserSpeechDead = true;
        setStatus(isIOS()
          ? 'Speech recognition isn’t available in this browser on this device — on iPhones it needs Siri turned on (Settings → Siri). Tap the microphone to record instead, and it will be transcribed for you.'
          : 'Speech recognition isn’t available in this browser on this device. Tap the microphone to record instead, and it will be transcribed for you.');
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
  // ---- Recording fallback: server transcription, then on-device Whisper ----
  let recorder = null;
  let recordChunks = null;
  let recordTimer = null;
  let recordMime = '';
  function stopTracks(stream) {
    try { (stream && stream.getTracks ? stream.getTracks() : []).forEach((tr) => { if (tr.stop) tr.stop(); }); } catch (e) { /* ignore */ }
  }
  async function startRecording() {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak' || session._answeredIndex === index) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      swapToWritten('Recording isn’t available in this browser, so this became a written question. No penalty.');
      return;
    }
    try { if (recognizer) recognizer.abort(); } catch (e) { /* already stopped */ }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      swapToWritten('Microphone access was denied, so this became a written question. No penalty — allow the microphone in your browser settings and the next speaking question will offer the microphone again.');
      return;
    }
    recordChunks = [];
    const rec = new MediaRecorder(stream);
    recorder = rec;
    recordMime = rec.mimeType || '';
    rec.ondataavailable = (event) => { if (event.data && event.data.size) recordChunks.push(event.data); };
    rec.onstop = () => {
      stopTracks(stream);
      recorder = null;
      setMicLabel('🎤 Tap to speak');
      finishRecording();
    };
    try {
      rec.start();
    } catch (e) {
      stopTracks(stream);
      recorder = null;
      setStatus('Could not start recording: ' + e.message);
      return;
    }
    setStatus('Recording… tap the microphone again to stop.');
    setMicLabel('⏹ Tap to stop');
    recordTimer = setTimeout(() => { stopRecording(); }, 8000);
  }
  function stopRecording() {
    if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
    if (recorder) {
      try { recorder.stop(); } catch (e) { recorder = null; }
    }
  }
  async function finishRecording() {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak' || session._answeredIndex === index) return;
    const chunks = recordChunks || [];
    recordChunks = null;
    if (!chunks.length) {
      setStatus('Nothing was recorded — tap the microphone and try again.');
      return;
    }
    const blob = new Blob(chunks, { type: recordMime || 'audio/mp4' });
    if (!blob.size) {
      setStatus('Nothing was recorded — tap the microphone and try again.');
      return;
    }
    setStatus('Checking what you said…');
    let text = await transcribeOnServer(blob);
    if (!text && state.settings.whisper && window.duolibeeWhisper) {
      text = await transcribeWithWhisper(blob);
    }
    if (text) {
      session.speakHeard = text;
      setHeard(text);
      setStatus('Tap “Check my pronunciation” when you are ready.');
    } else {
      swapToWritten('Couldn’t check what you said — the transcription service didn’t answer. This became a written question instead. No penalty.');
    }
  }
  // Server transcription. Returns the transcript, or '' on any failure —
  // the caller falls through to the next option. The backend never stores
  // the audio; it lives only in this request.
  async function transcribeOnServer(blob) {
    try {
      const res = await fetch(TRANSCRIBE_API, { method: 'POST', body: blob });
      if (!res.ok) return '';
      const data = await res.json();
      return typeof data.transcript === 'string' ? data.transcript.trim() : '';
    } catch (e) {
      return '';
    }
  }
  // On-device Whisper. Decodes the recording to 16 kHz mono first, because
  // that is what the model expects. Returns the transcript, or ''.
  async function transcribeWithWhisper(blob) {
    try {
      const audio = await decodeTo16k(blob);
      if (!audio || !window.duolibeeWhisper) return '';
      const text = await window.duolibeeWhisper.transcribe(audio);
      return (text || '').trim();
    } catch (e) {
      return '';
    }
  }
  async function decodeTo16k(blob) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const buf = await blob.arrayBuffer();
    const ctx = new AC();
    try {
      const decoded = await ctx.decodeAudioData(buf);
      return resampleTo16k(decoded.getChannelData(0), decoded.sampleRate);
    } finally {
      try { ctx.close(); } catch (e) { /* ignore */ }
    }
  }
  function resampleTo16k(data, rate) {
    if (!rate || rate === 16000) return data;
    const ratio = rate / 16000;
    const len = Math.floor(data.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const frac = pos - j;
      out[i] = data[j] * (1 - frac) + data[Math.min(j + 1, data.length - 1)] * frac;
    }
    return out;
  }
  startSpeaking = function () {
    const ex = session && session.exercises && session.exercises[index];
    if (!ex || ex.type !== 'speak') return;
    if (session._answeredIndex === index) return;
    if (recorder) { stopRecording(); return; }
    // Contexts where the browser's recognition service is never offered
    // go straight to recording: the microphone and the transcription
    // fallbacks work fine there.
    if (!recognitionClass() || browserSpeechDead || isStandaloneWebApp() || isInAppBrowser()) {
      if (isStandaloneWebApp()) setStatus('Recording — the Home Screen app can’t use the phone’s speech recognition, so this will be transcribed for you.');
      else if (isInAppBrowser()) setStatus('Recording — this browser doesn’t offer speech recognition, so this will be transcribed for you.');
      startRecording();
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
    if (ex && ex.type === 'speak' && state.settings.speaking === false) {
      session.exercises[index] = writtenQuestionFor(ex);
    }
    originalRender();
  };
  // Exposed for tests: the matcher, the environment detection, and the
  // recording path (so tests can drive it without a real microphone).
  window.duolibeeSpeakingEnv = { isIOS, isInAppBrowser, isStandaloneWebApp };
  window.duolibeeSpeaking = { startRecording, stopRecording, transcribeOnServer, transcribeWithWhisper, resampleTo16k };
  window.speakAccepted = speakAccepted;
  window.speakSimilarity = speakSimilarity;
  window.speakSupported = speakSupported;
})();
