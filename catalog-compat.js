// DUOLIBEE catalog compatibility: orders lessons sequentially by theme,
// supports any positive lesson total, and handles items without sentence data.
function buildLessons(d) {
  if (!d || !(d.total > 0) || !Array.isArray(d.themes)) throw Error('Invalid catalog.');
  THEMES = d.themes;
  ALL = d.themes.flatMap(x => x.items.map(y => Object.assign({ theme: x.name }, y)));
  ITEM_BY_KEY = {};
  ALL.forEach(it => { ITEM_BY_KEY[srsKey(it.theme, it.t)] = it; });

  const types = ['choice', 'translate', 'match', 'build', 'audio'];
  const lessons = [];
  let lessonId = 1;

  d.themes.forEach(theme => {
    for (let start = 0; start < theme.items.length; start += 3) {
      const items = theme.items.slice(start, start + 3);
      if (!items.length) continue;

      const typeOffset = (lessonId - 1) % types.length;
      const order = types.slice(typeOffset).concat(types.slice(0, typeOffset));

      const exercises = [{ type: 'learn', items: items }].concat(order.map((type, ei) => {
        const seed = lessonId * 100 + ei;
        if (type === 'choice') {
          const opts = seededShuffle([items[0].e, ...distractors(items[0])], seed);
          return { type: 'choice', prompt: 'What does “' + items[0].t + '” mean?', options: opts, answer: opts.indexOf(items[0].e) };
        }
        if (type === 'translate') return { type: 'translate', prompt: 'Translate: ' + items[1].e, item: items[1] };
        if (type === 'match') return { type: 'match', pairs: items.map(x => ({ t: x.t, e: x.e })) };
        if (type === 'build' && items[2].s) return { type: 'build', prompt: 'Build: ' + items[2].se, words: items[2].s.split(' '), answer: items[2].s, seed: seed };
        if (type === 'build') {
          const opts = seededShuffle([items[2].e, ...distractors(items[2])], seed);
          return { type: 'choice', prompt: 'Choose the English for “' + items[2].t + '”', options: opts, answer: opts.indexOf(items[2].e) };
        }
        return { type: 'audio', item: items[3] || items[0], options: seededShuffle([(items[3] || items[0]).e, ...distractors(items[3] || items[0])], seed) };
      }));

      lessons.push({
        id: lessonId++,
        category: theme.name,
        icon: theme.icon,
        order: lessonId,
        difficulty: 1 + ((lessonId - 1) % 5),
        title: theme.name + ' • ' + items.map(x => x.t).join(' • '),
        items: items,
        exercises: exercises
      });
    }
  });

  LESSONS = lessons;
  return lessons;
}
