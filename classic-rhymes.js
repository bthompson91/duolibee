/* DUOLIBEE — Experimental Classic Rhymes mode */
(function(){
  if(!document.getElementById('tab-rhymes'))return;
  state.settings.classicRhymes=!!state.settings.classicRhymes;
  let RHYMES=[],rhymeSession=null,loadError='';
  const style=document.createElement('style');
  style.textContent=`.rhyme-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:12px}.rhyme-card{border:1px solid #888;border-radius:12px;padding:12px;text-align:left;background:transparent;color:inherit}.rhyme-line{margin:12px 0;line-height:2.2}.rhyme-field{display:inline-flex;flex-direction:column;vertical-align:middle;max-width:100%;margin:4px}.rhyme-hint,.rhyme-correction{font-size:.8em;line-height:1.5}.rhyme-blank{box-sizing:border-box;width:150px;max-width:100%;padding:8px;border-radius:8px;border:1px solid #888;background:transparent;color:inherit;font:inherit}.rhyme-blank.good{border-color:#58cc02}.rhyme-blank.bad{border-color:#ff4b4b}.rhyme-correction{min-height:1.5em}`;
  document.head.appendChild(style);
  fetch('data/rhymes.json?v=0.7.3',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Could not load rhymes ('+r.status+').');return r.json()}).then(d=>{if(!Array.isArray(d.songs))throw Error('Invalid rhyme dataset.');RHYMES=d.songs;if(view==='rhymes')renderClassicRhymes()}).catch(e=>{loadError=e.message;if(view==='rhymes')renderClassicRhymes()});
  function shuffle(a){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
  const originalGo=go;
  go=function(n){if(n==='rhymes'&&!state.settings.classicRhymes)n='home';originalGo(n);if(n==='rhymes')renderClassicRhymes()};
  const originalTabs=renderTabs;
  renderTabs=function(){originalTabs();const b=document.getElementById('tab-rhymes');if(b){b.style.display=state.settings.classicRhymes?'':'none';b.classList.toggle('active',view==='rhymes')}};
  const originalSettings=renderSettings;
  renderSettings=function(){originalSettings();const card=app.querySelector('.card');if(!card)return;const label=document.createElement('label');label.className='setting-row';const input=document.createElement('input');input.type='checkbox';input.checked=state.settings.classicRhymes;input.onchange=()=>setSetting('classicRhymes',input.checked);label.append(input,document.createTextNode(' Classic Rhymes experimental mode'));const hr=card.querySelector('hr');if(hr)card.insertBefore(label,hr);else card.appendChild(label)};
  const originalSetSetting=setSetting;
  setSetting=function(k,v){originalSetSetting(k,v);if(k==='classicRhymes'){renderTabs();if(view==='rhymes'&&!v)go('home')}};
  function renderClassicRhymes(){
    rhymeSession=null;
    app.innerHTML=`<section class='card'><h2>🎵 Classic Rhymes</h2><p>Restore the original English words using the Tagalog vocabulary hints. These mixed-language prompts are vocabulary exercises, not grammatical Tagalog translations.</p>`+(RHYMES.length?`<div class='rhyme-list'>`+RHYMES.map((s,i)=>`<button class='rhyme-card' onclick='startRhyme(${i})'>${esc(s.title)}</button>`).join('')+`</div>`:`<p>${esc(loadError||'Loading rhymes…')}</p>`)+`</section>`;
  }
  window.startRhyme=function(i){
    if(!state.settings.classicRhymes)return;
    const song=RHYMES[i];if(!song)return;
    const candidates=[];song.lines.forEach((line,li)=>line.forEach((tok,ti)=>{if(tok.t&&tok.e)candidates.push({tok,li,ti})}));
    const picked=shuffle(candidates).slice(0,Math.ceil(candidates.length/2));
    const blanks=new Map(picked.map((x,n)=>[x.li+':'+x.ti,n]));
    rhymeSession={song,blanks:picked.map(x=>({answer:x.tok.e}))};
    const body=song.lines.map((line,li)=>`<div class='rhyme-line'>`+line.map((tok,ti)=>{const key=li+':'+ti;if(!blanks.has(key))return esc((tok.e||'')+(tok.p||''));const n=blanks.get(key);return `<span class='rhyme-field'><label class='rhyme-hint' for='blank-${n}'>${esc(tok.t)}</label><input class='rhyme-blank' id='blank-${n}' placeholder='English word(s)' autocomplete='off' spellcheck='false' aria-describedby='correction-${n}'><span class='rhyme-correction' id='correction-${n}'></span></span>${esc(tok.p||'')}`}).join(' ')+`</div>`).join('');
    app.innerHTML=`<button class='ghost back' onclick='go("rhymes")'>← All rhymes</button><section class='card'><h2>🎵 ${esc(song.title)}</h2><p>Restore the English words shown in Tagalog.</p>${body}<div id='rhyme-feedback' class='feedback' role='status' aria-live='polite'></div><div class='actions'><button class='primary' onclick='checkRhyme()'>Check answers</button><button class='ghost' onclick='startRhyme(${i})'>New words</button></div><details><summary>Reveal original excerpt</summary>${song.lines.map(line=>`<p>${esc(line.map(tok=>tok.e+(tok.p||'')).join(' '))}</p>`).join('')}</details></section>`;
    app.querySelectorAll('.rhyme-blank').forEach(el=>el.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();checkRhyme()}}));
  };
  window.checkRhyme=function(){
    if(!rhymeSession||view!=='rhymes')return;let correct=0;
    rhymeSession.blanks.forEach((b,n)=>{const el=document.getElementById('blank-'+n);if(!el)return;const ok=norm(el.value)===norm(b.answer);el.classList.toggle('good',ok);el.classList.toggle('bad',!ok);el.setAttribute('aria-invalid',String(!ok));document.getElementById('correction-'+n).textContent=ok?'✓ Correct':'Answer: '+b.answer;if(ok)correct++});
    const total=rhymeSession.blanks.length,e=document.getElementById('rhyme-feedback');e.className='feedback '+(correct===total?'good':'bad');e.textContent=`${correct}/${total} correct.`;
  };
  renderTabs();
})();
