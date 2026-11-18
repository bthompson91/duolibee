(() => {
  function srsKeysFor(lesson, ex) {
    const key = (it) => srsKey(it.theme || lesson.category, it.t);
    if (ex.type === 'speak' && ex.sentence) return []; // a sentence speak tests a sentence, not one vocab item
    if (ex.type === 'translate' || ex.type === 'reverse' || ex.type === 'audio' || ex.type === 'speak') return ex.item ? [key(ex.item)] : [];
    if (ex.type === 'match') return (ex.pairs || []).map((pr) => srsKey(lesson.category, pr.t));
    if (ex.type === 'build') return []; // a sentence build tests a sentence, not one vocab item
    if (ex.type === 'choice') {
      const m = /“(.+?)”/.exec(ex.prompt || '');
      const it = m && (lesson.items || []).find((x) => x.t === m[1]);
      if (it) return [key(it)];
      if (lesson.items && lesson.items[0]) return [key(lesson.items[0])];
    }
    return [];
  }
  const originalBuild = buildLessons;
  buildLessons = function(data) {
    const lessons = originalBuild(data);
    lessons.forEach((lesson) => { lesson.exercises.forEach((ex) => { if (ex.type !== 'learn') ex.srsKeys = srsKeysFor(lesson, ex); }); });
    const sentencesByTheme = {};
    (data.themes || []).forEach(theme => {
      sentencesByTheme[theme.name] = (theme.sentences || []).filter(s => s.t && s.e);
    });
    lessons.forEach(lesson => {
      const sentences = sentencesByTheme[lesson.category] || [];
      const graded = lesson.exercises.filter(ex => ex.type !== 'learn');
      if (!graded.length) return;
      const items = lesson.items || [];
      const keyOf = (it) => srsKey(it.theme || lesson.category, it.t);
      // The displayed lesson number is lesson.order, not lesson.id:
      // lesson-numbering.js remaps the theme-based ids to 1..100 after this
      // runs, and order already equals that displayed number (the push
      // position in theme-major order). The ramp must key by the displayed
      // number or it scrambles across the renumbering. The build target and
      // sentence rotation stay on the old id — they are just a rotation, and
      // keeping them on one id guarantees build/speak/speak-2 stay distinct.
      const displayId = lesson.order || lesson.id;
      if (sentences.length) {
        const target = graded[(lesson.id - 1) % graded.length];
        const sentence = sentences[(lesson.id - 1) % sentences.length];
        const words = sentence.t.split(' ');
        // A converted exercise must not keep stale fields from its old type:
        // a leftover options array made the retry logic read item.e of an
        // exercise that has no item, crashing a wrong first answer.
        delete target.options;
        delete target.pairs;
        delete target.item;
        Object.assign(target, {
          srsKeys: [],
          type: 'build',
          prompt: 'Build: ' + sentence.e,
          words: words,
          answer: sentence.t,
          seed: lesson.id * 977 + words.length
        });
        // Speak a DIFFERENT sentence from the same theme: the build uses
        // sentences[(id - 1) % n], so the speak takes the next one in the
        // cycle, sentences[id % n] — always a different sentence (each theme
        // has 3), so it tests transfer, not just recall of the one just built.
        // Reuses the speak UI and flow; no SRS key (sentences are practice).
        const speakSentence = sentences[lesson.id % sentences.length];
        const at = lesson.exercises.indexOf(target);
        if (at >= 0) lesson.exercises.splice(at + 1, 0, {
          type: 'speak', sentence: true, srsKeys: [],
          prompt: 'Say this aloud: ' + speakSentence.t,
          item: { t: speakSentence.t, e: speakSentence.e }
        });
      }
      // Ramp: longer lessons as the course progresses — one extra exercise
      // every 6 lessons, up to 5 (7 graded in lessons 1-6, 12 from lesson 31).
      // Each extra revisits a word in a new format, inserted right after its
      // sibling exercise so the second pass follows the first; if the sibling
      // was converted to the build, the extra goes at the end.
      const extraDefs = [];
      if (items[4]) extraDefs.push([(e) => e.type === 'translate', { type: 'reverse', prompt: 'Translate: ' + items[4].t, item: items[4], srsKeys: [keyOf(items[4])] }]);
      if (items[4]) {
        const audioOpts = seededShuffle([items[4].e, ...distractors(items[4])], lesson.id * 977 + 41);
        extraDefs.push([(e) => e.type === 'audio', { type: 'audio', item: items[4], options: audioOpts, srsKeys: [keyOf(items[4])] }]);
      }
      if (items[5]) extraDefs.push([(e) => e.type === 'speak' && !e.sentence, { type: 'speak', prompt: 'Say this aloud: ' + items[5].t, item: items[5], srsKeys: [keyOf(items[5])] }]);
      if (items[5]) {
        const choiceOpts = seededShuffle([items[5].e, ...distractors(items[5])], lesson.id * 977 + 43);
        extraDefs.push([(e) => e.type === 'choice', { type: 'choice', prompt: 'What does “' + items[5].t + '” mean?', options: choiceOpts, answer: choiceOpts.indexOf(items[5].e), srsKeys: [keyOf(items[5])] }]);
      }
      if (sentences.length) {
        const speak2Sentence = sentences[(lesson.id + 1) % sentences.length];
        extraDefs.push([(e) => e.sentence === true, { type: 'speak', sentence: true, srsKeys: [], prompt: 'Say this aloud: ' + speak2Sentence.t, item: { t: speak2Sentence.t, e: speak2Sentence.e } }]);
      }
      const extraCount = Math.min(5, Math.floor((displayId - 1) / 6));
      extraDefs.slice(0, extraCount).forEach(([pred, ex]) => {
        const i = lesson.exercises.findIndex(pred);
        if (i >= 0) lesson.exercises.splice(i + 1, 0, ex);
        else lesson.exercises.push(ex);
      });
    });
    return lessons;
  };
})();

// v0.11.0: shuffle the copy, never the source; never offer a solved word bank when a distinct order exists.
(() => {
  function unsolve(words, answer) {
    if (norm(words.join(' ')) !== norm(answer)) return words;
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        [words[i], words[j]] = [words[j], words[i]];
        if (norm(words.join(' ')) !== norm(answer)) return words;
        [words[i], words[j]] = [words[j], words[i]];
      }
    }
    return words;
  }
  const baseSeededShuffle = seededShuffle;
  seededShuffle = function(values, seed) {
    const shuffled = baseSeededShuffle(values, seed);
    const exercise = typeof session !== 'undefined' && session && session.exercises && session.exercises[index];
    if (exercise && exercise.type === 'build' && values === exercise.words) return unsolve(shuffled, exercise.answer);
    return shuffled;
  };
})();
