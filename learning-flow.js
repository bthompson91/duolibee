(() => {
  const originalBuild = buildLessons;
  buildLessons = function(data) {
    originalBuild(data);
    LESSONS.sort((a,b) => THEMES.findIndex(t=>t.name===a.category)-THEMES.findIndex(t=>t.name===b.category) || a.id-b.id);
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
  function rows(){return Object.entries(ITEM_BY_KEY).map(([key,item])=>({key,item}));}
  nextLesson=function(){return LESSONS.find(l=>!state.completed[l.id]);};
  const originalFeedback=feedback;
  feedback=function(ok,msg){if(session.id==='review')session.results[index]=!!ok;originalFeedback(ok,msg);};
  ['answerChoice','answerTranslate','answerAudio','checkBuild'].forEach(name=>{
    const fn=window[name];window[name]=function(...args){if(session._answeredIndex===index)return;session._answeredIndex=index;return fn(...args);};
  });
  const originalStart=startLesson;
  startLesson=function(id){const l=LESSONS.find(x=>x.id===id);if(!l||(!state.completed[id]&&l!==nextLesson()))return;delete l._answeredIndex;originalStart(id);};
  const originalNext=next;
  next=function(){originalNext();};
})();

// v0.12.0: one visible sequence; persistent IDs remain unchanged.
(() => {
  const originalHome=renderHome;
  renderHome=function(){
    originalHome();
    const next=nextLesson();
    const start=app.querySelector('.next-lesson button');
    if(start&&next)start.textContent='Start Lesson '+next.order;
    const ordered=THEMES.flatMap(th=>LESSONS.filter(l=>l.category===th.name));
    app.querySelectorAll('.lesson-btn').forEach((button,i)=>{
      const lesson=ordered[i];
      if(!lesson)return;
      const unlocked=!!state.completed[lesson.id]||lesson===next;
      button.disabled=!unlocked;
      button.classList.toggle('locked',!unlocked);
      button.classList.toggle('current',lesson===next);
      button.onclick=unlocked?()=>startLesson(lesson.id):null;
      const number=button.querySelector('.num');
      if(number)number.textContent='Lesson '+lesson.order+(unlocked?'':' 🔒');
    });
  };
  const badge=document.querySelector('.brand .ver');
  if(badge)badge.textContent='v0.12.0';
})();