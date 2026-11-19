/* v0.39.1: MIDI-note answer sounds via Web Audio. No files, no libraries:
   correct = bright ascending arpeggio, wrong = low descending buzz.
   Respects the Sound effects setting and the global mute; silent when
   Web Audio is unavailable (e.g. tests) instead of throwing. */
(() => {
  'use strict';
  let ctx = null;
  function audio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        const c = new AC();
        // A context without oscillators/gain (e.g. a decode-only stub)
        // cannot play notes; treat it as no Web Audio. Never cache it.
        if (typeof c.createOscillator !== 'function' || typeof c.createGain !== 'function' || typeof c.currentTime !== 'number') return null;
        ctx = c;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (_) { return null; }
  }
  function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function tone(midi, when, dur, type, vol) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq(midi);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(when);
    o.stop(when + dur + 0.05);
  }
  function play(notes, type, vol, step, dur) {
    if (!audio()) return;
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((m, i) => tone(m, t0 + i * step, dur, type, vol));
  }
  function answerSound(ok) {
    // Best effort only: a sound effect must never break a lesson.
    try {
      if (typeof state !== 'undefined' && state && state.settings) {
        if (state.settings.sound === false) return;
        if (state.settings.muted) return;
      }
      if (ok) play([72, 76, 79, 84], 'triangle', 0.16, 0.09, 0.35);
      else play([57, 53], 'sawtooth', 0.1, 0.16, 0.3);
    } catch (_) { /* silent */ }
  }
  window.duolibeeAnswerSound = answerSound;
})();
