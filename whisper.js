// DUOLIBEE on-device transcription (Whisper), opt-in.
//
// The model (whisper-tiny, ~40 MB) is downloaded only when the learner
// switches it on in Settings — enabling it starts the download, and the
// browser caches the files afterwards, so it is a one-time cost. It runs
// in a module Web Worker (transformers.js) so the lesson UI stays
// responsive while the model loads and runs. Audio never leaves the
// device; only the model files are downloaded, from Hugging Face and
// jsDelivr. If the model cannot load, the speaking exercise falls back to
// a written question as usual.
(() => {
  const WORKER_URL = 'whisper-worker.js?v=0.38.4';
  let worker = null;
  let nextId = 0;
  const pending = new Map();
  const progressListeners = new Set();
  // idle: not loaded this session (the model may already be cached).
  // loading: the download / model load is in progress.
  // ready: the model is loaded and can transcribe.
  // failed: the last load attempt failed; enabling again retries.
  let loadState = 'idle';
  let loadProgress = '';
  let loadPromise = null;

  function reportProgress(text) {
    loadProgress = text;
    for (const fn of progressListeners) {
      try { fn(text); } catch (e) { /* ignore */ }
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = (event) => {
      const msg = (event && event.data) || {};
      const entry = pending.get(msg.id);
      if (!entry) return;
      if (typeof msg.progress === 'string') {
        reportProgress(msg.progress);
        return;
      }
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.text || '');
      else entry.reject(new Error(msg.error || 'Whisper failed.'));
    };
    worker.onerror = () => {
      const err = new Error('Whisper worker failed to load.');
      for (const entry of pending.values()) entry.reject(err);
      pending.clear();
      worker = null;
      loadState = 'failed';
      loadPromise = null;
    };
    return worker;
  }

  function send(type, audio) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        const w = ensureWorker();
        if (audio) w.postMessage({ id, type, audio }, [audio.buffer]);
        else w.postMessage({ id, type });
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  }

  // Loads the model (downloading it on first use) and reports progress
  // text such as 'Downloading… 42%'. Resolves when it is ready; rejects
  // on failure. Concurrent callers share one load.
  function ensureLoaded(onProgress) {
    if (loadState === 'ready') return Promise.resolve();
    if (onProgress) progressListeners.add(onProgress);
    if (loadPromise) {
      if (onProgress) loadPromise.then(() => progressListeners.delete(onProgress), () => progressListeners.delete(onProgress));
      return loadPromise;
    }
    loadState = 'loading';
    loadProgress = 'Starting download…';
    if (onProgress) { try { onProgress(loadProgress); } catch (e) { /* ignore */ } }
    loadPromise = send('load').then(() => {
      loadState = 'ready';
      loadProgress = 'Ready.';
      if (onProgress) progressListeners.delete(onProgress);
    }).catch((e) => {
      loadState = 'failed';
      loadProgress = '';
      loadPromise = null;
      if (onProgress) progressListeners.delete(onProgress);
      throw e;
    });
    return loadPromise;
  }

  // Transcribes 16 kHz mono audio (a Float32Array) and resolves with the
  // text, or '' if nothing was heard.
  async function transcribe(audio) {
    await ensureLoaded();
    return send('transcribe', audio);
  }

  window.duolibeeWhisper = {
    ensureLoaded,
    transcribe,
    get status() { return loadState; },
    get progress() { return loadProgress; },
  };

  function whisperStatusText() {
    if (state.settings.whisper !== true) return 'Off — the model stays downloaded on this device.';
    if (loadState === 'ready') return 'Ready — stored on this device (~40 MB).';
    if (loadState === 'loading') return loadProgress || 'Downloading…';
    if (loadState === 'failed') return 'Download failed — check your connection and try again.';
    return 'Not downloaded yet — turning it on downloads the model (~40 MB, once).';
  }

  // Turning it on starts the download; turning it off only stops using
  // it, so the model stays cached for next time. On failure the setting
  // reverts and the learner can retry.
  async function setWhisperEnabled(on) {
    state.settings.whisper = !!on;
    save();
    const status = document.getElementById('whisper-status');
    const box = document.getElementById('whisper-setting-box');
    if (!on) {
      if (status) status.textContent = 'Off — the model stays downloaded on this device.';
      return;
    }
    if (status) status.textContent = 'Starting download…';
    try {
      await window.duolibeeWhisper.ensureLoaded((text) => { if (status) status.textContent = text; });
      if (status) status.textContent = 'Ready — stored on this device (~40 MB).';
    } catch (e) {
      state.settings.whisper = false;
      save();
      if (box) box.checked = false;
      if (status) status.textContent = 'Download failed — check your connection and try again.';
    }
  }
  window.setWhisperEnabled = setWhisperEnabled;

  // Settings toggle, next to the speaking toggle. The checkbox is the
  // only way the model is ever downloaded.
  const originalSettings = renderSettings;
  renderSettings = function () {
    originalSettings();
    if (document.getElementById('whisper-setting')) return;
    const label = document.createElement('label');
    label.className = 'setting-row';
    label.id = 'whisper-setting';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'whisper-setting-box';
    box.checked = state.settings.whisper === true;
    box.onchange = () => { setWhisperEnabled(box.checked); };
    label.append(box, document.createTextNode(' On-device transcription (Whisper)'));
    const status = document.createElement('span');
    status.id = 'whisper-status';
    status.className = 'setting-note';
    status.textContent = whisperStatusText();
    label.append(status);
    const card = app.querySelector('.card');
    if (card) card.append(label);
  };
})();
