(() => {
  const RELEASE_NOTES = [
    {
      version: 'v0.8.0',
      items: [
        'Removed the Learning Inbox.',
        'Practice everything uses unlocked vocabulary from completed lessons, the current lesson, and Daily Challenge words.',
        'Review uses only unlocked vocabulary that is due.',
        'Compact top-bar controls: 🔊/🔇 for sound and ⏰ plus a count for due reviews.'
      ]
    },
    {
      version: 'v0.7.9',
      items: [
        'Fixed the mute-button render loop that could blank the app.',
        'Made the mute button persist across screen updates.'
      ]
    },
    {
      version: 'v0.7.7',
      items: [
        'Added a global mute button in the top bar.',
        'While muted, audio-recognition questions become text multiple-choice questions.',
        'Added release notes to Settings.'
      ]
    }
  ];
  const originalRenderSettings = renderSettings;
  renderSettings = function() {
    originalRenderSettings();
    const settingsCard = app.querySelector('section.card');
    if (!settingsCard) return;
    const notes = document.createElement('section');
    notes.className = 'card';
    notes.innerHTML = '<h2>📋 Release notes</h2>' + RELEASE_NOTES.map(release =>
      '<div><strong>' + release.version + '</strong><ul>' +
      release.items.map(item => '<li>' + item + '</li>').join('') +
      '</ul></div>'
    ).join('');
    settingsCard.after(notes);
  };
})();