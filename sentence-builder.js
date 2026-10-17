(() => {
  const originalBuild = buildLessons;
  buildLessons = function(data) {
    const lessons = originalBuild(data);
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
      Object.assign(target, {
        type: 'build',
        prompt: 'Build: ' + sentence.e,
        words: words,
        answer: sentence.t,
        seed: lesson.id * 977 + words.length
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
  seededShuffle = function(values, seed) {
    const shuffled = values.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const exercise = typeof session !== 'undefined' && session && session.exercises && session.exercises[index];
    if (exercise && exercise.type === 'build' && values === exercise.words) return unsolve(shuffled, exercise.answer);
    return shuffled;
  };
})();
