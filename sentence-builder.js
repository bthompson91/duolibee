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