/* DUOLIBEE — Experimental Classic Rhymes mode */
(function(){
  if(!document.getElementById('tab-rhymes'))return;
  state.settings.classicRhymes=!!state.settings.classicRhymes;
  let RHYMES=[],rhymeSession=null;
  const style=document.createElement('style');
  style.textContent=`.rhyme-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:12px}.rhyme-card{border:1px solid #888;border-radius:12px;padding:12px;text-align:left;background:transparent;color:inherit}.rhyme-line{margin:6px 0;line-height:2}.rhyme-blank{width:130px;padding:6px;border-radius:8px;border:1px solid #888;background:transparent;color:inherit;font:inherit}.rhyme-blank.good{border-color:#58cc02}.rhyme-blank.bad{border-color:#ff4b4b}`;
  document.head.appendChild(style);
  fetch('data/rhymes.json?v=0.7.3',{cache:'no-store'}).then(r=>r.json()).then(d=>{RHYMES=d.songs||[];if(view==='rhymes')renderClassicRhymes();}).catch(e=>console.error(e));
  function shuffle(a){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
  const originalGo=go;
  go=function(n){if(n==='rhymes'&&!state.settings.classicRhymes)n='home';originalGo(n);if(n==='rhymes')renderClassicRhymes();};
  const originalTabs=renderTabs;
  renderTabs=function(){originalTabs();const b=document.getElementById('tab-rhymes');if(b){b.style.display=state.settings.classicRhymes?'':'none';b.classList.toggle('active',view==='rhymes')}};
  const originalSettings=renderSettings;
  renderSettings=function(){originalSettings();const card=app.querySelector('.card');if(!card)return;const hr=card.querySelector('hr');const label=document.createElement('label');label.className='setting-row';label.innerHTML=`<input type='checkbox' ${state.settings.classicRhymes?'checked':''} onchange="setSetting('classicRhymes',this.checked)"> Classic Rhymes experimental mode`;if(hr)card.insertBefore(label,hr);else card.appendChild(label)};
  const originalSetSetting=setSetting;
  setSetting=function(k,v){originalSetSetting(k,v);if(k==='classicRhymes'){renderTabs();if(view==='rhymes'&&!v)go('home')}};
  function renderClassicRhymes(){
    app.innerHTML=`<section class='card'><h2>🎵 Classic Rhymes</h2><p>Experimental lyric-recall practice using traditional public-domain rhymes and songs. About half of the translatable English words are shown in Tagalog. Type the original English words.</p>`+(RHYMES.length?`<div class='rhyme-list'>`+RHYMES.map((s,i)=>`<button class='rhyme-card' onclick='startRhyme(${i})'><strong>${esc(s.title)}</strong><br><small>${s.lines.flat().filter(x=>x.t).length} practice words</small></button>`).join('')+`</div>`:`<p>Loading rhymes…</p>`)+`</section>`;
  }
  window.startRhyme=function(i){
    const song=RHYMES[i];if(!song)return;
    const candidates=[];song.lines.forEach((line,li)=>line.forEach((tok,ti)=>{if(tok.t)candidates.push({tok,li,ti})}));
    const picked=shuffle(candidates).slice(0,Math.max(1,Math.round(candidates.length/2)));
    const blankSet=new Set(picked.map(x=>x.li+':'+x.ti));
    rhymeSession={song,blanks:picked.map((x,n)=>({answer:x.tok.t,id:n}))};
    const body=song.lines.map((line,li)=>`<div class='rhyme-line'>`+line.map((tok,ti)=>{const key=li+':'+ti;if(!blankSet.has(key))return esc((tok.e||'')+(tok.p||''));const n=picked.findIndex(x=>x.li===li&&x.ti===ti);return `<input class='rhyme-blank' id='blank-${n}' data-answer='${esc(tok.t)}' placeholder='${esc(tok.t)}' autocomplete='off'>`+(tok.p||'')}).join(' ')+`</div>`).join('');
    app.innerHTML=`<button class='ghost back' onclick='go("rhymes")'>← All rhymes</button><section class='card'><h2>🎵 ${esc(song.title)}</h2><p>Restore the English words shown in Tagalog.</p>${body}<div id='rhyme-feedback' class='feedback'></div><div class='actions'><button class='primary' onclick='checkRhyme()'>Check answers</button><button class='ghost' onclick='startRhyme(${i})'>New words</button></div></section>`;
  };
  window.checkRhyme=function(){
    if(!rhymeSession)return;let correct=0;
    rhymeSession.blanks.forEach((b,n)=>{const el=document.getElementById('blank-'+n);if(!el)return;const ok=norm(el.value)===norm(b.answer);el.classList.toggle('good',ok);el.classList.toggle('bad',!ok);if(ok)correct++});
    const total=rhymeSession.blanks.length,e=document.getElementById('rhyme-feedback');e.className='feedback '+(correct===total?'good':'bad');e.textContent=`${correct}/${total} correct.`;
  };
  renderTabs();
})();
