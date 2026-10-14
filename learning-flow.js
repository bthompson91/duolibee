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
  inboxItems=function(){
    const now=Date.now(),all=rows();
    return {new:all.filter(x=>!state.srs[x.key]),overdue:all.filter(x=>state.srs[x.key]&&Number(state.srs[x.key].due)<=now),learned:all.filter(x=>state.srs[x.key]&&Number(state.srs[x.key].due)>now)};
  };
  function header(){
    const box=inboxItems(),el=document.querySelector('.stats');
    if(el)el.innerHTML="<button class='stat' onclick='go(\"home\");setInbox(\"new\")'>📥 Inbox "+box.new.length+"</button><button class='stat' onclick='go(\"home\");setInbox(\"overdue\")'>⏰ Overdue "+box.overdue.length+"</button>";
  }
  const originalTabs=renderTabs;
  renderTabs=function(){originalTabs();header();};
  renderHome=function(){
    const n=nextLesson(),box=inboxItems(),active=box[inboxFilter]||[],done=LESSONS.filter(l=>state.completed[l.id]).length;
    app.innerHTML="<section class='hero hero-mascot'><div><h1>Magandang araw! 🐝</h1><p>"+done+"/"+LESSONS.length+" lessons</p></div><img src='assets/mascot-welcome.png' alt='DUOLIBEE welcome bee' style='display:block;width:150px;max-width:40%;height:auto;object-fit:contain'></section>"+
      (n?"<section class='card'><h2>Next lesson</h2><p>"+esc(n.category)+" — "+esc(n.title)+"</p><button class='primary' onclick='startLesson("+n.id+")'>Start Lesson "+n.order+"</button></section>":"<section class='card'><h2>All lessons completed!</h2></section>")+
      "<section class='card'><h2>📥 Learning Inbox</h2><div>"+['new','overdue','learned'].map(f=>"<button onclick='setInbox(\""+f+"\")'>"+f[0].toUpperCase()+f.slice(1)+" ("+box[f].length+")</button>").join('')+"</div>"+
      (inboxFilter==='overdue'&&active.length?"<button class='primary' onclick='startReview()'>Review overdue</button>":'')+
      active.slice(0,20).map(x=>"<div class='learn-row'><button data-say='"+esc(x.key)+"'>🔊</button><div><strong>"+esc(x.item.t)+"</strong> — "+esc(x.item.e)+"<div class='pron-guide'>"+guide(x.item.t)+"</div></div></div>").join('')+
      (!active.length?'<p>No items in this filter.</p>':'')+(active.length>20?'<p>Showing 20 of '+active.length+' items.</p>':'')+
      "</section><section class='card'><h2>📚 Learn</h2>"+THEMES.map((th,ti)=>{
        const ls=LESSONS.filter(l=>l.category===th.name),open=!!state.openThemes[th.name];
        return "<section><button class='theme-header' data-theme='"+ti+"'>"+esc(th.icon)+' '+(ti+1)+'. '+esc(th.name)+' — '+ls.filter(l=>state.completed[l.id]).length+'/'+ls.length+' '+(open?'▾':'▸')+'</button>'+
          (open?"<div class='lessons'>"+ls.map(l=>{const unlocked=!!state.completed[l.id]||l===n;return "<button class='lesson-btn "+(state.completed[l.id]?'done':l===n?'current':'locked')+"' "+(unlocked?"onclick='startLesson("+l.id+")'":'disabled')+"><span class='num'>Lesson "+l.order+(unlocked?'':' 🔒')+'</span>'+esc(l.items[0].t)+'</button>';}).join('')+'</div>':'')+'</section>';
      }).join('')+'</section>';
    app.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>toggleTheme(THEMES[Number(b.dataset.theme)].name));
    app.querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>speak(ITEM_BY_KEY[b.dataset.say].t));
    header();
  };
  renderPractice=function(){
    const all=rows(),box=inboxItems();
    app.innerHTML="<section class='card'><h2>🔁 Practice</h2><p>"+all.length+' vocabulary items • '+box.overdue.length+" overdue</p><button class='primary' id='practice-all'>Practice everything</button><button class='primary' onclick='startReview()' "+(box.overdue.length?'':'disabled')+">Review overdue ("+box.overdue.length+")</button><p>Practice everything samples up to 10 items from the full catalog, including new vocabulary.</p></section>";
    document.getElementById('practice-all').onclick=()=>review(all);
    header();
  };
  function review(pool){
    if(!pool.length)return;
    const picked=shufflePool(pool).slice(0,10);
    session={id:'review',icon:'🔁',title:'Vocabulary practice',items:picked.map(x=>x.item),reviewKeys:picked.map(x=>x.key),results:[],exercises:picked.map(x=>{const options=shufflePool([...new Set([x.item.e,...distractors(x.item)])]);return{type:'choice',prompt:'What does “'+x.item.t+'” mean?',options,answer:options.indexOf(x.item.e)};})};
    index=0;correct=0;renderExercise();
  }
  function shufflePool(pool){const a=pool.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  startReview=function(){review(inboxItems().overdue);};
  const originalFeedback=feedback;
  feedback=function(ok,msg){if(session.id==='review')session.results[index]=!!ok;originalFeedback(ok,msg);};
  ['answerChoice','answerTranslate','answerAudio','checkBuild'].forEach(name=>{
    const fn=window[name];window[name]=function(...args){if(session._answeredIndex===index)return;session._answeredIndex=index;return fn(...args);};
  });
  const originalStart=startLesson;
  startLesson=function(id){const l=LESSONS.find(x=>x.id===id);if(!l||(!state.completed[id]&&l!==nextLesson()))return;delete l._answeredIndex;originalStart(id);};
  const originalNext=next;
  next=function(){originalNext();header();};
})();
