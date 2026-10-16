(() => {
  const RELEASE_NOTES = [
    {
      version: 'v0.7.7',
      items: [
        'Added a global mute button in the top bar.',
        'While muted, audio-recognition questions become text multiple-choice questions.',
        'Mute now silences speaker buttons, tapped answers, and sentence playback.',
        'Added release notes to Settings.'
      ]
    },
    {
      version: 'v0.7.6',
      items: [
        'Sentence-builder words can be tapped again to remove them.',
        'Wrong sentence builds can be edited and resubmitted.',
        'Correct sentence builds speak the complete Tagalog sentence.',
        'Answer choices, matching pairs, and word tokens are spoken when tapped.',
        'Speech uses original Tagalog text, with mga → manga, tso → cho, standalone ng → nung, and dy → j.'
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