const app = document.getElementById('app');
const state = JSON.parse(localStorage.getItem('duolibee') || '{}');
state.xp ??= 0;
state.completed ??= {};
state.streak ??= 0;
state.lastDay ??= null;
state.hearts ??= 3;

const today = new Date().toISOString().slice(0, 10);
if (state.lastDay !== today) {
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak = state.lastDay === yesterday ? state.streak : 0;
  state.hearts = 3;
  state.lastDay = today;
  save();
}

function save(){ localStorage.setItem('duolibee', JSON.stringify(state)); renderStats(); }
function renderStats(){
  document.getElementById('xp').textContent = state.xp;
  document.getElementById('streak').textContent = state.streak;
  document.getElementById('hearts').textContent = state.hearts;
}

let tagalogVoice = null;
function pickVoice(){
  const voices = speechSynthesis.getVoices();
  tagalogVoice = voices.find(v => /^fil(-|_|$)/i.test(v.lang)) ||
                  voices.find(v => /^tl(-|_|$)/i.test(v.lang)) ||
                  voices.find(v => /filipino|tagalog/i.test(v.name)) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text){
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = tagalogVoice?.lang || 'fil-PH';
  if (tagalogVoice) utterance.voice = tagalogVoice;
  utterance.rate = 0.85;
  speechSynthesis.speak(utterance);
}

function home(){
  const done = Object.keys(state.completed).length;
  app.innerHTML = `
    <section class="hero">
      <h1>Learn Tagalog with DUOLIBEE 🐝</h1>
      <p>${done} of ${LESSONS.length} lessons complete • Keep your streak alive!</p>
    </section>
    ${UNITS.map((name, u) => `
      <section class="unit">
        <h2>Unit ${u + 1}: ${name}</h2>
        <p>Lessons ${u * 5 + 1}–${u * 5 + 5}</p>
        <div class="lessons">
          ${LESSONS.filter(l => l.unit === u).map(l => `
            <button class="lesson-btn ${state.completed[l.id] ? 'done' : ''}" onclick="startLesson(${l.id})">
              <span class="num">Lesson ${l.id}</span>${l.icon} ${l.title}
            </button>`).join('')}
        </div>
      </section>`).join('')}`;
}

let current = null, index = 0, correctCount = 0;

function startLesson(id){
  current = LESSONS.find(l => l.id === id);
  index = 0; correctCount = 0;
  renderExercise();
}

function renderExercise(){
  const ex = current.exercises[index];
  const pct = Math.round(index / current.exercises.length * 100);
  app.innerHTML = `
    <button class="ghost back" onclick="home()">← Back</button>
    <section class="card">
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div><strong>${current.icon} ${current.title}</strong> • Question ${index + 1}/${current.exercises.length}</div>
      <div class="prompt">${ex.prompt}</div>
      ${ex.type === 'choice'
        ? `<div class="options">${ex.options.map((o, i) => `
            <div class="option-row">
              <button class="option" onclick="answerChoice(${i})">${o}</button>
              <button class="speak-btn" title="Listen in Tagalog" onclick="event.stopPropagation(); speak('${o.replace(/'/g, "\\'")}')">🔊</button>
            </div>`).join('')}</div>`
        : `<input id="answer" class="input" placeholder="Type your answer in Tagalog" autocomplete="off">
           <div class="actions"><button id="check" class="primary" onclick="answerTranslate()">Check</button></div>`}
      <div id="feedback" class="feedback"></div>
      <div class="actions"><button id="next" class="primary" style="display:none" onclick="next()">Continue</button></div>
    </section>`;
  if (ex.type === 'translate') {
    const input = document.getElementById('answer');
    input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Enter') answerTranslate(); });
  }
}

function normalize(s){
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function showFeedback(good, message, spoken){
  const box = document.getElementById('feedback');
  box.className = 'feedback ' + (good ? 'good' : 'bad');
  box.innerHTML = `${message} ${spoken ? `<button class="speak-btn inline" onclick="speak('${spoken.replace(/'/g, "\\'")}')">🔊 Listen</button>` : ''}`;
  document.getElementById('next').style.display = 'inline-block';
  document.querySelectorAll('.option').forEach(b => b.disabled = true);
  document.querySelectorAll('.speak-btn:not(.inline)').forEach(b => b.disabled = true);
  const check = document.getElementById('check');
  if (check) check.disabled = true;
  if (spoken) speak(spoken);
}

function answerChoice(i){
  const ex = current.exercises[index];
  const buttons = document.querySelectorAll('.option');
  const good = i === ex.answer;
  buttons[ex.answer].classList.add('correct');
  if (!good) buttons[i].classList.add('wrong');
  if (good) correctCount++; else loseHeart();
  showFeedback(good, good ? 'Magaling! Correct!' : `Correct answer: ${ex.options[ex.answer]}`, ex.options[ex.answer]);
}

function answerTranslate(){
  const ex = current.exercises[index];
  const value = normalize(document.getElementById('answer').value);
  const good = ex.answers.some(a => normalize(a) === value);
  if (good) correctCount++; else loseHeart();
  showFeedback(good, good ? 'Tama! Correct!' : `Correct answer: ${ex.answers[0]}`, ex.answers[0]);
}

function loseHeart(){
  state.hearts = Math.max(0, state.hearts - 1);
  save();
}

function next(){
  if (state.hearts === 0) {
    app.innerHTML = `
      <section class="card" style="text-align:center">
        <div class="big">💔</div>
        <h2>Out of hearts!</h2>
        <p>Take a short break, then try ${current.title} again.</p>
        <button class="primary" onclick="startLesson(${current.id})">Try again</button>
        <button class="ghost" onclick="home()">Back to lessons</button>
      </section>`;
    return;
  }
  index++;
  if (index < current.exercises.length) return renderExercise();
  const first = !state.completed[current.id];
  state.completed[current.id] = true;
  state.xp += first ? 20 : 5;
  state.streak = Math.max(1, state.streak);
  save();
  app.innerHTML = `
    <section class="card" style="text-align:center">
      <div class="big">🎉</div>
      <h2>Lesson complete!</h2>
      <p>You got ${correctCount}/${current.exercises.length} correct in <strong>${current.title}</strong>.</p>
      <p><strong>+${first ? 20 : 5} XP</strong></p>
      <button class="primary" onclick="home()">Continue</button>
    </section>`;
}

renderStats();
home();
