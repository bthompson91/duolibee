// DUOLIBEE — practice every completed item on demand
function startAllPractice() {
  try {
    const learned = Object.keys(state.srs)
      .filter(k => state.srs[k] && state.srs[k].streak > 0)
      .map(k => ({ key: k, item: ITEM_BY_KEY[k] }))
      .filter(x => x.item);

    if (!learned.length) {
      alert('Finish a lesson first—then its words become available for practice.');
      return;
    }

    const picked = seededShuffle(learned, Date.now()).slice(0, 20);
    session = {
      id: 'practice-all',
      category: 'Practice',
      icon: '🔁',
      title: 'Completed-item Practice',
      items: picked.map(x => x.item),
      exercises: picked.map((x, i) => {
        const it = x.item;
        const kinds = ['choice', 'translate', 'audio'];
        const k = kinds[i % 3];
        if (k === 'choice') {
          const opts = seededShuffle([it.e, ...distractors(it)], i + 41);
          return { type: 'choice', prompt: 'What does “' + it.t + '” mean?', options: opts, answer: opts.indexOf(it.e) };
        }
        if (k === 'translate') return { type: 'translate', prompt: 'Translate: ' + it.e, item: it };
        return { type: 'audio', item: it, options: seededShuffle([it.e, ...distractors(it)], i + 59) };
      })
    };
    index = 0;
    correct = 0;
    renderExercise();
  } catch (e) {
    console.error('DUOLIBEE practice-all error', e);
    alert('Practice could not start: ' + e.message);
  }
}

renderPractice = function () {
  const box = inboxItems();
  const learnedCount = Object.keys(state.srs).filter(k => state.srs[k] && state.srs[k].streak > 0).length;
  app.innerHTML = `
    <section class='card'>
      <h2>🔁 Practice Hub</h2>
      <p>${box.overdue.length} item(s) are due for review.</p>
      <button class='primary' onclick='startReview()' ${box.overdue.length ? '' : 'disabled'}>Start review</button>
      <button class='ghost' onclick='startAllPractice()' ${learnedCount ? '' : 'disabled'}>Practice all completed (${learnedCount})</button>
      <p><small>Completed-item practice chooses up to 20 items you have already learned.</small></p>
    </section>
  `;
};

window.startAllPractice = startAllPractice;
