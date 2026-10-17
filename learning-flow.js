// DUOLIBEE v0.13.0
(() => {
  const originalBuild=buildLessons;
  buildLessons=function(data){
    originalBuild(data);
    LESSONS.sort((a,b)=>THEMES.findIndex(t=>t.name===a.category)-THEMES.findIndex(t=>t.name===b.category)||a.id-b.id);
    LESSONS.forEach((l,i)=>{
      l.order=i+1;
      l.title=l.items[0].t+' • Lesson '+l.order;
      l.items=l.items.map(it=>Object.assign({},it,{theme:l.category}));
      l.exercises.forEach(ex=>{if(ex.type==='learn')ex.items=l.items;});
    });
    return LESSONS;
  };
  const originalMigration=migrateSrs;
  migrateSrs=function(){
    originalMigration();
    Object.keys(state.completed).forEach(id=>{
      const l=LESSONS.find(x=>String(x.id)===id);
      if(l)l.items.forEach(it=>{const k=srsKey(l.category,it.t);if(!state.srs[k])state.srs[k]={streak:0,interval:0,due:Date.now()};});
    });
    Object.keys(state.srs).forEach(k=>{
      if(ITEM_BY_KEY[k])return;
      const term=k.split('::').slice(1).join('::');
      const matches=Object.keys(ITEM_BY_KEY).filter(x=>x.endsWith('::'+term));
      if(matches.length===1){const target=matches[0];if(!state.srs[target])state.srs[target]=state.srs[k];delete state.srs[k];}
    });
  };
  nextLesson=function(){return LESSONS.find(l=>!state.completed[l.id]);};
  const originalFeedback=feedback;
  feedback=function(ok,msg){if(session.id==='review')session.results[index]=!!ok;originalFeedback(ok,msg);};
  ['answerChoice','answerTranslate','answerAudio','checkBuild'].forEach(name=>{
    const fn=window[name];window[name]=function(...args){if(session._answeredIndex===index)return;session._answeredIndex=index;return fn(...args);};
  });
  const originalStart=startLesson;
  startLesson=function(id){const l=LESSONS.find(x=>x.id===id);if(!l||(!state.completed[id]&&l!==nextLesson()))return;delete l._answeredIndex;originalStart(id);};

  // Render numbers and actions together. Never map visible positions to LESSONS.
  renderHome=function(){
    if(!LESSONS.length)return renderError('The lesson catalog is empty.');
    const next=nextLesson();
    const done=LESSONS.filter(l=>state.completed[l.id]).length;
    app.innerHTML=`<section class='hero hero-mascot'><div><h1>Magandang araw! 🐝</h1><p>${done}/${LESSONS.length} lessons • ${state.streak}-day streak</p></div></section>`+
      (next?`<section class='card next-lesson'><h2>Next lesson</h2><p><strong>${esc(next.icon)} ${esc(next.title)}</strong></p><button class='primary' data-lesson-id='${next.id}'>Start Lesson ${next.order}</button></section>`:`<section class='card'><h2>🎉 All caught up!</h2><p>You have completed every available lesson.</p></section>`)+
      `<section class='card'><h2>📚 Learn</h2>`+THEMES.map((th,themeIndex)=>{
        const lessons=LESSONS.filter(l=>l.category===th.name);
        const open=!!state.openThemes[th.name]||!!(next&&next.category===th.name);
        return `<div class='theme-block'><button class='theme-header' data-theme-index='${themeIndex}'><span>${esc(th.icon)} ${esc(th.name)}</span><span>${lessons.filter(l=>state.completed[l.id]).length}/${lessons.length} ${open?'▾':'▸'}</span></button>`+
          (open?`<div class='lessons'>`+lessons.map(l=>{
            const completed=!!state.completed[l.id],current=l===next,unlocked=completed||current;
            return `<button class='lesson-btn ${completed?'done':''} ${unlocked?'':'locked'} ${current?'current':''}' data-lesson-id='${l.id}' ${unlocked?'':'disabled'}><span class='num'>Lesson ${l.order}${unlocked?'':' 🔒'}</span>${esc(l.title)}</button>`;
          }).join('')+`</div>`:'')+`</div>`;
      }).join('')+`</section>`;
    app.querySelectorAll('[data-lesson-id]').forEach(button=>{
      button.onclick=()=>startLesson(Number(button.dataset.lessonId));
    });
    app.querySelectorAll('[data-theme-index]').forEach(button=>{
      button.onclick=()=>toggleTheme(THEMES[Number(button.dataset.themeIndex)].name);
    });
  };
  const badge=document.querySelector('.brand .ver');
  if(badge)badge.textContent='v0.13.0';
})();
