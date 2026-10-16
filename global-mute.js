(() => {
  function muted() {
    return !!(state.settings && state.settings.muted);
  }
  function renderMuteButton() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    let button = document.getElementById('global-mute');
    if (!button) {
      button = document.createElement('button');
      button.id = 'global-mute';
      button.className = 'stat';
      const stats = topbar.querySelector('.stats');
      if (stats) topbar.insertBefore(button, stats);
      else topbar.appendChild(button);
      button.onclick = toggleMute;
    }
    button.textContent = muted() ? '🔇 Muted' : '🔊 Sound';
    button.title = muted() ? 'Turn sound on' : 'Mute all pronunciation';
  }
  function toggleMute() {
    state.settings.muted = !muted();
    save();
    if (muted() && window.speechSynthesis) speechSynthesis.cancel();
    renderMuteButton();
    if (view === 'home') renderHome();
  }
  const originalSpeak = speak;
  speak = function(text, slow) {
    if (muted()) return;
    return originalSpeak(text, slow);
  };
  const originalRenderExercise = renderExercise;
  renderExercise = function() {
    const exercise = session.exercises[index];
    if (muted() && exercise && exercise.type === 'audio' && exercise.item) {
      const options = seededShuffle([...new Set([exercise.item.e, ...distractors(exercise.item)])], index + 101);
      session.exercises[index] = {
        type: 'choice',
        prompt: 'What does “' + exercise.item.t + '” mean?',
        options: options,
        answer: options.indexOf(exercise.item.e)
      };
    }
    originalRenderExercise();
  };
  renderMuteButton();
})();