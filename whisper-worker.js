// DUOLIBEE Whisper worker.
//
// Runs in a module Web Worker so model loading and transcription never
// block the lesson UI. Loads transformers.js from the CDN on first use,
// then the multilingual whisper-tiny model (onnx-community/whisper-tiny,
// ~40 MB), cached by the browser afterwards. WebGPU when the device
// offers it, WASM otherwise. Audio arrives as a Float32Array of 16 kHz
// mono samples and the transcript comes back as text.
//
// Messages in:  { id, type: 'load' } or { id, type: 'transcribe', audio }
// Messages out: { id, ok: true, text } / { id, ok: false, error } /
//                { id, progress: 'Downloading… 42%' }
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

let transcriberPromise = null;

async function pickDevice() {
  try {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch (e) { /* fall through to wasm */ }
  return 'wasm';
}

async function getTranscriber(onProgress) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const device = await pickDevice();
      // The documented Whisper recipe: the encoder is sensitive to
      // quantization, so it stays fp16 on WebGPU; q8 is the WASM build.
      const dtype = device === 'webgpu'
        ? { encoder_model: 'fp16', decoder_model_merged: 'q4' }
        : 'q8';
      return pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
        device,
        dtype,
        progress_callback: (p) => {
          if (!onProgress) return;
          if (p && p.status === 'progress' && typeof p.progress === 'number') {
            onProgress('Downloading… ' + Math.round(p.progress) + '%');
          } else if (p && p.status === 'done') {
            onProgress('Downloaded.');
          } else if (p && p.status === 'initiate') {
            onProgress('Starting download…');
          }
        },
      });
    })();
  }
  return transcriberPromise;
}

self.onmessage = async (event) => {
  const msg = (event && event.data) || {};
  const id = msg.id;
  try {
    if (msg.type === 'load') {
      await getTranscriber((text) => self.postMessage({ id, progress: text }));
      self.postMessage({ id, ok: true });
    } else if (msg.type === 'transcribe') {
      const transcriber = await getTranscriber();
      // 'tl' is Tagalog. Forcing the language matters: without it Whisper
      // can decide the speech is English and translate it instead of
      // transcribing it.
      const out = await transcriber(msg.audio, { language: 'tl', task: 'transcribe' });
      self.postMessage({ id, ok: true, text: (out && out.text) || '' });
    } else {
      self.postMessage({ id, ok: false, error: 'Unknown message type.' });
    }
  } catch (e) {
    // A failed load must be retryable, not cached as a dead promise.
    transcriberPromise = null;
    self.postMessage({ id, ok: false, error: String((e && e.message) || e) });
  }
};
