const app = document.getElementById('app');
const DEFAULTS = {
  xp: 0, gems: 50, hearts: 5, heartUpdatedAt: Date.now(),
  streak: 0, freezes: 0, lastActiveDay: null, dailyGoal: 50,
  completed: {}, review: {}, achievements: {}, weeklyXp: {},
  quests: { date: null, xp: 0, lessons: 0, reviews: 0, claimed: {} },
  settings: { sound: true, speechRate: 0.85, dark: false },
  boostUntil: 0, stats: { lessons: 0, reviews: 0, correct: 0, answers: 0 }
};
let state = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('duolibee-v2') || '{}'));
state.settings = Object.assign({}, DEFAULTS.settings, state.settings);
state.quests = Object.assign({}, DEFAULTS.quests, state.quests);
state.stats = Object.assign({}, DEFAULTS.stats, state.stats);

const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const weekKey = () => { const d = new Date(); const onejan = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${Math.ceil((((d - onejan) / 864e5) + onejan.getDay() + 1) / 7)}`; };

function save(){ localStorage.setItem('duolibee-v2', JSON.stringify(state)); renderStats(); }

function rollover(){
  const today = day();
  if (state.lastActiveDay === today) return;
  const yesterday = day(-1);
  if (state.lastActiveDay && state.lastActiveDay !== yesterday) {
    if (state.freezes > 0) { state.freezes--; showToast('🧊 Streak Freeze used!'); }
    else state.streak = 0;
  }
  if (state.lastActiveDay !== today) {
    state.quests = { date: today, xp: 0, lessons: 0, reviews: 0, claimed: {} };
  }
  state.lastActiveDay = today;
  save();
}

function regenHearts(){
  const elapsed = Date.now() - state.heartUpdatedAt;
  const gained = Math.floor(elapsed / (30 * 60 * 1000));
  if (gained > 0 && state.hearts < 5) {
    state.hearts = Math.min(5, state.hearts + gained);
    state.heartUpdatedAt = Date.now();
    save();
  }
}
setInterval(() => { regenHearts(); updateBoost(); }, 30000);

let tagalogVoice = null;
function pickVoice(){
  const voices = speechSynthesis.getVoices();
  tagalogVoice = voices.find(v => /^fil(-|_|$)/i.test(v.lang)) || voices.find(v => /^tl(-|_|$)/i.test(v.lang)) || voices.find(v => /filipino|tagalog/i.test(v.name)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function speak(text){
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tagalogVoice?.lang || 'fil-PH';
  if (tagalogVoice) u.voice = tagalogVoice;
  u.rate = Number(state.settings.speechRate) || 0.85;
  speechSynthesis.speak(u);
}

let audioContext;
function beep(good = true){
  if (!state.settings.sound) return;
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.connect(gain); gain.connect(audioContext.destination);
  osc.frequency.value = good ? 740 : 220;
  gain.gain.setValueAtTime(.08, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .25);
  osc.start(); osc.stop(audioContext.currentTime + .25);
}

function showToast(message){
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function confetti(){
  const box = document.getElementById('confetti');
  box.innerHTML = '';
  for (let i = 0; i < 35; i++) {
    const s = document.createElement('span');
    s.textContent = ['🎉','✨','🐝','⭐','💎'][i % 5];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = Math.random() * .6 + 's';
    box.appendChild(s);
  }
  setTimeout(() => box.innerHTML = '', 2600);
}

function renderStats(){
  document.getElementById('streak').textContent = state.streak;
  document.getElementById('gems').textContent = state.gems;
  document.getElementById('hearts').textContent = state.hearts;
  const boost = Date.now() < state.boostUntil;
  document.getElementById('boost-stat').style.display = boost ? 'inline-flex' : 'none';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const active = document.getElementById('tab-' + (view || 'learn'));
  if (active) active.classList.add('active');
}

let view = 'learn';
function go(next){
  view = next;
  rollover(); regenHearts(); renderStats();
  ({ learn: renderLearn, practice: renderPractice, quests: renderQuests, profile: renderProfile, settings: renderSettings }[next] || renderLearn)();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLearn(){
  const done = Object.keys(state.completed).length;
  const goalPct = Math.min(100, Math.round(state.quests.xp / state.dailyGoal * 100));
  app.innerHTML = `
    <section class="hero">
      <h1>Learn Tagalog with DUOLIBEE 🐝</h1>
      <p>${done}/${LESSONS.length} lessons • ${state.streak}-day streak</p>
      <div class="goal"><div style="width:${goalPct}%"></div></div>
      <small>Daily goal: ${state.quests.xp}/${state.dailyGoal} XP</small>
    </section>
    ${UNITS.map((name, u) => `
      <section class="unit">
        <h2>Unit ${u + 1}: ${name}</h2>
        <p>Lessons ${u * 5 + 1}–${u * 5 + 5}</p>
        <div class="lessons">
          ${LESSONS.filter(l => l.unit === u).map(l => {
            const crowns = state.completed[l.id]?.crowns || 0;
            return `<button class="lesson-btn ${crowns ? 'done' : ''}" onclick="startLesson(${l.id})">
              <span class="num">Lesson ${l.id} ${'👑'.repeat(crowns)}</span>${l.icon} ${l.title}
            </button>`;
          }).join('')}
        </div>
      </section>`).join('')}`;
}

function dueLessons(){
  const today = day();
  return Object.entries(state.review).filter(([, due]) => due <= today).map(([id]) => LESSONS.find(l => l.id == id)).filter(Boolean);
}

function renderPractice(){
  const due = dueLessons();
  app.innerHTML = `
    <section class="card">
      <h2>🔁 Practice Hub</h2>
      <p>Review lessons at the right time so Tagalog sticks.</p>
      <div class="tile-grid">
        <button class="tile" onclick="startReview()"><span>🧠</span><strong>Review ${due.length} due</strong><small>Spaced repetition</small></button>
        <button class="tile" onclick="startSession('listening')"><span>🎧</span><strong>Listening</strong><small>Train your ear</small></button>
        <button class="tile" onclick="startSession('bank')"><span>🧩</span><strong>Sentence Builder</strong><small>Word bank</small></button>
        <button class="tile" onclick="startSession('match')"><span>🔗</span><strong>Matching</strong><small>Connect pairs</small></button>
      </div>
    </section>`;
}

function renderQuests(){
  const quests = [
    { id: 'xp', icon: '⚡', text: `Earn ${state.dailyGoal} XP`, progress: state.quests.xp, target: state.dailyGoal, reward: 25 },
    { id: 'lessons', icon: '📚', text: 'Complete 3 lessons', progress: state.quests.lessons, target: 3, reward: 30 },
    { id: 'reviews', icon: '🧠', text: 'Finish 1 review session', progress: state.quests.reviews, target: 1, reward: 20 }
  ];
  app.innerHTML = `
    <section class="card">
      <h2>🎯 Daily Quests</h2>
      ${quests.map(q => {
        const complete = q.progress >= q.target;
        const claimed = state.quests.claimed[q.id];
        return `<div class="quest">
          <div class="quest-icon">${q.icon}</div>
          <div class="quest-body"><strong>${q.text}</strong>
            <div class="mini-progress"><div style="width:${Math.min(100, q.progress / q.target * 100)}%"></div></div>
            <small>${Math.min(q.progress, q.target)}/${q.target}</small></div>
          <button class="primary ${complete && !claimed ? '' : 'disabled'}" ${complete && !claimed ? `onclick="claimQuest('${q.id}', ${q.reward})"` : 'disabled'}>${claimed ? '✓' : `💎${q.reward}`}</button>
        </div>`;
      }).join('')}
    </section>
    <section class="card">
      <h2>🏆 Achievements</h2>
      ${achievements().map(a => `<div class="achievement ${state.achievements[a.id] ? 'unlocked' : ''}"><span>${a.icon}</span><div><strong>${a.name}</strong><small>${a.description}</small></div>${state.achievements[a.id] ? '<span>✓</span>' : ''}</div>`).join('')}
    </section>`;
}

function achievements(){
  const lessons = Object.keys(state.completed).length;
  return [
    { id: 'first', icon: '🌱', name: 'First Flight', description: 'Complete your first lesson', test: lessons >= 1 },
    { id: 'ten', icon: '📚', name: 'Bookworm', description: 'Complete 10 lessons', test: lessons >= 10 },
    { id: 'half', icon: '🇵🇭', name: 'Halfway There', description: 'Complete 30 lessons', test: lessons >= 30 },
    { id: 'all', icon: '👑', name: 'DUOLIBEE Master', description: 'Complete all 60 lessons', test: lessons >= 60 },
    { id: 'streak7', icon: '🔥', name: 'Week Warrior', description: 'Reach a 7-day streak', test: state.streak >= 7 },
    { id: 'xp500', icon: '⚡', name: 'XP Collector', description: 'Earn 500 XP', test: state.xp >= 500 },
    { id: 'review10', icon: '🧠', name: 'Memory Bee', description: 'Complete 10 review sessions', test: state.stats.reviews >= 10 }
  ];
}

function checkAchievements(){
  achievements().forEach(a => {
    if (!state.achievements[a.id] && a.test) { state.achievements[a.id] = true; showToast(`🏆 Achievement: ${a.name}`); state.gems += 20; }
  });
}

function claimQuest(id, reward){
  if (state.quests.claimed[id]) return;
  state.quests.claimed[id] = true;
  state.gems += reward;
  beep(true); confetti(); showToast(`💎 +${reward} gems`);
  save(); renderQuests();
}

function renderProfile(){
  const lessons = Object.keys(state.completed).length;
  const weekXp = state.weeklyXp[weekKey()] || 0;
  const goalPct = Math.min(100, Math.round(state.quests.xp / state.dailyGoal * 100));
  app.innerHTML = `
    <section class="card profile">
      <div class="avatar">🐝</div>
      <h2>Your DUOLIBEE Profile</h2>
      <div class="stat-grid">
        <div><strong>${state.streak}</strong><small>Day streak</small></div>
        <div><strong>${state.xp}</strong><small>Total XP</small></div>
        <div><strong>${lessons}</strong><small>Lessons</small></div>
        <div><strong>${state.gems}</strong><small>Gems</small></div>
        <div><strong>${state.stats.reviews}</strong><small>Reviews</small></div>
        <div><strong>${state.stats.answers ? Math.round(state.stats.correct / state.stats.answers * 100) : 0}%</strong><small>Accuracy</small></div>
      </div>
    </section>
    <section class="card">
      <h2>📅 This Week</h2>
      <p>Your personal progress for this week.</p>
      <div class="stat-grid">
        <div><strong>${weekXp}</strong><small>XP this week</small></div>
        <div><strong>${state.quests.xp}/${state.dailyGoal}</strong><small>Today’s goal</small></div>
        <div><strong>${state.streak}</strong><small>Current streak</small></div>
        <div><strong>${lessons}</strong><small>Lessons started</small></div>
      </div>
      <div class="progress"><div style="width:${goalPct}%"></div></div>
      <small>Daily goal progress</small>
    </section>
    <section class="card">
      <h2>🛒 Shop</h2>
      <div class="tile-grid">
        <button class="tile" onclick="buy('refill')"><span>❤️</span><strong>Refill Hearts</strong><small>💎350</small></button>
        <button class="tile" onclick="buy('freeze')"><span>🧊</span><strong>Streak Freeze</strong><small>💎200 • You have ${state.freezes}</small></button>
        <button class="tile" onclick="buy('boost')"><span>⚡</span><strong>XP Boost</strong><small>💎100 • 15 min 2x XP</small></button>
      </div>
    </section>`;
}

function buy(item){
  const costs = { refill: 350, freeze: 200, boost: 100 };
  if (state.gems < costs[item]) return showToast('Not enough gems—complete quests to earn more!');
  state.gems -= costs[item];
  if (item === 'refill') { state.hearts = 5; state.heartUpdatedAt = Date.now(); showToast('❤️ Hearts refilled!'); }
  if (item === 'freeze') { state.freezes++; showToast('🧊 Streak Freeze purchased!'); }
  if (item === 'boost') { state.boostUntil = Date.now() + 15 * 60 * 1000; showToast('⚡ 2x XP Boost active!'); }
  beep(true); save(); renderProfile(); updateBoost();
}

function updateBoost(){
  const boost = Date.now() < state.boostUntil;
  document.getElementById('boost-stat').style.display = boost ? 'inline-flex' : 'none';
}

function renderSettings(){
  app.innerHTML = `
    <section class="card">
      <h2>⚙️ Settings</h2>
      <label class="setting"><span>Daily XP goal</span>
        <select onchange="state.dailyGoal=Number(this.value);save()">
          ${[20, 50, 100, 200].map(g => `<option value="${g}" ${state.dailyGoal === g ? 'selected' : ''}>${g} XP</option>`).join('')}
        </select></label>
      <label class="setting"><span>Speech rate</span>
        <input type="range" min="0.6" max="1.2" step="0.05" value="${state.settings.speechRate}" oninput="state.settings.speechRate=Number(this.value);save()"></label>
      <label class="setting"><span>Sound effects</span>
        <input type="checkbox" ${state.settings.sound ? 'checked' : ''} onchange="state.settings.sound=this.checked;save()"></label>
      <label class="setting"><span>Dark mode</span>
        <input type="checkbox" ${state.settings.dark ? 'checked' : ''} onchange="state.settings.dark=this.checked;save();applyTheme()"></label>
      <button class="ghost danger" onclick="resetProgress()">Reset all progress</button>
    </section>`;
}

function applyTheme(){ document.body.classList.toggle('dark', state.settings.dark); }
function resetProgress(){
  if (!confirm('Reset all DUOLIBEE progress?')) return;
  localStorage.removeItem('duolibee-v2');
  state = JSON.parse(JSON.stringify(DEFAULTS));
  save(); go('learn');
}

let session = null, index = 0, correct = 0;
function startLesson(id){
  const lesson = LESSONS.find(l => l.id === id);
  session = { kind: 'lesson', lesson, exercises: shuffle(lesson.exercises).slice(0, 5) };
  index = 0; correct = 0;
  renderExercise();
}

function startReview(){
  const due = dueLessons();
  if (!due.length) return showToast('No reviews due yet—complete a lesson first!');
  const exercises = due.flatMap(l => l.exercises).slice(0, 8);
  session = { kind: 'review', exercises };
  index = 0; correct = 0;
  renderExercise();
}

function startSession(kind){
  const generators = { listening: makeListening, bank: makeWordBank, match: makeMatch };
  session = { kind, exercises: Array.from({ length: 6 }, generators[kind]) };
  index = 0; correct = 0;
  renderExercise();
}

function renderExercise(){
  const ex = session.exercises[index];
  const pct = Math.round(index / session.exercises.length * 100);
  let body = '';
  if (ex.type === 'choice' || ex.type === 'listen') {
    body = `<div class="options">${ex.options.map((o, i) => `
      <div class="option-row">
        <button class="option" onclick="answerChoice(${i})">${o}</button>
        ${ex.type === 'choice' ? `<button class="speak-btn" onclick="event.stopPropagation();speak('${o.replace(/'/g, "\\'")}')">🔊</button>` : ''}
      </div>`).join('')}</div>`;
    if (ex.type === 'listen') setTimeout(() => speak(ex.audio), 350);
  } else if (ex.type === 'translate') {
    body = `<input id="answer" class="input" placeholder="Type your answer in Tagalog" autocomplete="off">
      <div class="actions"><button id="check" class="primary" onclick="answerTranslate()">Check</button></div>`;
  } else if (ex.type === 'bank') {
    body = `<div id="built" class="built"></div><div id="bank" class="bank">${ex.tokens.map((t, i) => `<button class="token" onclick="addToken(${i})">${t}</button>`).join('')}</div>
      <div class="actions"><button id="check" class="primary" onclick="checkBank()">Check</button></div>`;
  } else if (ex.type === 'match') {
    const left = shuffle(ex.pairs.map(p => p.en));
    const right = shuffle(ex.pairs.map(p => p.tl));
    body = `<div class="match-grid"><div>${left.map(x => `<button class="match" data-en="${x}" onclick="pickMatch(this,'en')">${x}</button>`).join('')}</div><div>${right.map(x => `<button class="match" data-tl="${x}" onclick="pickMatch(this,'tl')">${x}</button>`).join('')}</div></div>`;
  }
  app.innerHTML = `
    <button class="ghost back" onclick="go('learn')">← Exit</button>
    <section class="card">
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div><strong>${session.kind === 'lesson' ? session.lesson.icon + ' ' + session.lesson.title : session.kind.toUpperCase()}</strong> • ${index + 1}/${session.exercises.length}</div>
      <div class="prompt">${ex.prompt} ${ex.audio ? `<button class="speak-btn inline" onclick="speak('${ex.audio.replace(/'/g, "\\'")}')">🔊</button>` : ''}</div>
      ${body}
      <div id="feedback" class="feedback"></div>
      <div class="actions"><button id="next" class="primary" style="display:none" onclick="next()">Continue</button></div>
    </section>`;
  if (ex.type === 'translate') {
    const input = document.getElementById('answer'); input.focus();
    input.addEventListener('keydown', e => e.key === 'Enter' && answerTranslate());
  }
}

const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
let selected = { en: null, tl: null }, matched = 0, built = [];

function showFeedback(good, message, spoken){
  beep(good);
  state.stats.answers++; if (good) state.stats.correct++;
  const box = document.getElementById('feedback');
  box.className = 'feedback ' + (good ? 'good' : 'bad');
  box.innerHTML = `${message} ${spoken ? `<button class="speak-btn inline" onclick="speak('${spoken.replace(/'/g, "\\'")}')">🔊</button>` : ''}`;
  document.getElementById('next').style.display = 'inline-block';
  document.querySelectorAll('.option,.token,.match,.speak-btn:not(.inline)').forEach(b => b.disabled = true);
  const check = document.getElementById('check'); if (check) check.disabled = true;
  if (spoken) speak(spoken);
}

function answerChoice(i){
  const ex = session.exercises[index];
  const buttons = document.querySelectorAll('.option');
  const good = i === ex.answer;
  buttons[ex.answer].classList.add('correct');
  if (!good) buttons[i].classList.add('wrong');
  if (good) correct++;
  showFeedback(good, good ? 'Magaling! Correct!' : `Correct answer: ${ex.options[ex.answer]}`, ex.audio || ex.options[ex.answer]);
}

function answerTranslate(){
  const ex = session.exercises[index];
  const value = normalize(document.getElementById('answer').value);
  const good = ex.answers.some(a => normalize(a) === value);
  if (good) correct++;
  showFeedback(good, good ? 'Tama! Correct!' : `Correct answer: ${ex.answers[0]}`, ex.answers[0]);
}

function addToken(i){
  const ex = session.exercises[index];
  built.push(ex.tokens[i]);
  document.getElementById('built').textContent = built.join(' ');
  event.target.disabled = true;
}

function checkBank(){
  const ex = session.exercises[index];
  const good = normalize(built.join(' ')) === normalize(ex.answer);
  if (good) correct++;
  showFeedback(good, good ? 'Magaling! Correct!' : `Correct answer: ${ex.answer}`, ex.answer);
}

function pickMatch(btn, side){
  selected[side] = btn;
  btn.classList.add('selected');
  if (selected.en && selected.tl) {
    const ex = session.exercises[index];
    const good = ex.pairs.some(p => p.en === selected.en.dataset.en && p.tl === selected.tl.dataset.tl);
    if (good) {
      selected.en.classList.add('correct'); selected.tl.classList.add('correct');
      selected.en.disabled = selected.tl.disabled = true;
      matched++; correct++;
      beep(true);
      if (matched === ex.pairs.length) showFeedback(true, 'Magaling! All pairs matched!');
    } else {
      selected.en.classList.add('wrong'); selected.tl.classList.add('wrong');
      beep(false);
      setTimeout(() => { selected.en?.classList.remove('wrong','selected'); selected.tl?.classList.remove('wrong','selected'); }, 550);
    }
    selected = { en: null, tl: null };
  }
}

function next(){
  index++; built = []; matched = 0; selected = { en: null, tl: null };
  if (index < session.exercises.length) return renderExercise();
  finishSession();
}

function finishSession(){
  const accuracy = Math.round(correct / session.exercises.length * 100);
  let xp = Math.max(5, Math.round(session.exercises.length * 4 * (Date.now() < state.boostUntil ? 2 : 1)));
  let gems = 2;
  if (session.kind === 'lesson') {
    const id = session.lesson.id;
    const prior = state.completed[id]?.crowns || 0;
    const crowns = Math.min(5, prior + 1);
    state.completed[id] = { crowns, last: day() };
    state.stats.lessons++;
    state.quests.lessons++;
    state.review[id] = day(crowns === 1 ? 1 : crowns === 2 ? 3 : 7);
    xp += crowns === 1 ? 10 : 5;
    confetti();
  } else {
    state.stats.reviews++;
    state.quests.reviews++;
    if (session.kind === 'review') Object.keys(state.review).forEach(id => { if (dueLessons().some(l => l.id == id)) state.review[id] = day(3); });
    confetti();
  }
  state.xp += xp; state.gems += gems; state.quests.xp += xp;
  state.weeklyXp[weekKey()] = (state.weeklyXp[weekKey()] || 0) + xp;
  if (state.quests.xp >= state.dailyGoal && state.streak === 0) state.streak = 1;
  checkAchievements(); save();
  app.innerHTML = `
    <section class="card center">
      <div class="big">🎉</div>
      <h2>Session complete!</h2>
      <p>${correct}/${session.exercises.length} correct • ${accuracy}% accuracy</p>
      <div class="reward-row"><span>⚡ +${xp} XP</span><span>💎 +${gems}</span></div>
      <button class="primary" onclick="go('learn')">Continue</button>
    </section>`;
}

applyTheme(); rollover(); regenHearts(); renderStats(); go('learn');
