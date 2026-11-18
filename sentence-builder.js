(() => {
  function srsKeysFor(lesson, ex) {
    const key = (it) => srsKey(it.theme || lesson.category, it.t);
    if (ex.type === 'speak' && ex.sentence) return []; // a sentence speak tests a sentence, not one vocab item
    if (ex.type === 'translate' || ex.type === 'audio' || ex.type === 'speak') return ex.item ? [key(ex.item)] : [];
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
      if (!sentences.length || !graded.length) return;
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
