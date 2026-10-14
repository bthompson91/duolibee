// DUOLIBEE catalog compatibility: supports any positive lesson total and
// vocabulary items without sentence-builder data.
function buildLessons(d) {
  if (!d || !(d.total > 0) || !Array.isArray(d.themes)) throw Error('Invalid catalog.');
  THEMES = d.themes;
  ALL = d.themes.flatMap(x => x.items.map(y => Object.assign({ theme: x.name }, y)));
  ITEM_BY_KEY = {};
  ALL.forEach(it => { ITEM_BY_KEY[srsKey(it.theme, it.t)] = it; });
  const types = ['choice', 'translate', 'match', 'build', 'audio'];
  const lessons = [];
  for (let i = 1; i <= d.total; i++) {
    const th = d.themes[(i - 1) % d.themes.length];
    const off = (i * 3) % th.items.length;
    const items = [0, 1, 2, 3].map(k => th.items[(off + k) % th.items.length]);
    const order = types.slice((i - 1) % 5).concat(types.slice(0, (i - 1) % 5));
    const exercises = [{ type: 'learn', items: items }].concat(order.map((t, ei) => {
      const seed = i * 100 + ei;
      if (t === 'choice') {
        const opts = seededShuffle([items[0].e, ...distractors(items[0])], seed);
        return { type: 'choice', prompt: 'What does “' + items[0].t + '” mean?', options: opts, answer: opts.indexOf(items[0].e) };
      }
      if (t === 'translate') return { type: 'translate', prompt: 'Translate: ' + items[1].e, item: items[1] };
      if (t === 'match') return { type: 'match', pairs: items.map(x => ({ t: x.t, e: x.e })) };
      if (t === 'build' && items[2].s) return { type: 'build', prompt: 'Build: ' + items[2].se, words: items[2].s.split(' '), answer: items[2].s, seed: seed };
      if (t === 'build') {
        const opts = seededShuffle([items[2].e, ...distractors(items[2])], seed);
        return { type: 'choice', prompt: 'Choose the English for “' + items[2].t + '”', options: opts, answer: opts.indexOf(items[2].e) };
      }
      return { type: 'audio', item: items[3], options: seededShuffle([items[3].e, ...distractors(items[3])], seed) };
    }));
    lessons.push({ id: i, category: th.name, icon: th.icon, order: i, difficulty: 1 + (i % 5), title: th.name + ' • ' + items[0].t + ' • Lesson ' + i, items: items, exercises: exercises });
  }
  LESSONS = lessons;
  return lessons;
}
