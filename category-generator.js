(() => {
  buildLessons = function(data) {
    if(!data || !(data.total>0) || !Array.isArray(data.themes) || !data.themes.length)throw Error('Invalid catalog.');
    THEMES=data.themes;
    ALL=THEMES.flatMap(th=>th.items.map(it=>Object.assign({},it,{theme:th.name})));
    ITEM_BY_KEY={};ALL.forEach(it=>{ITEM_BY_KEY[srsKey(it.theme,it.t)]=it;});
    LESSONS=[];
    THEMES.forEach((th,categoryIndex)=>{
      if(!th.items.length)throw Error('Empty category: '+th.name);
      const count=Math.max(0,Math.floor((data.total-1-categoryIndex)/THEMES.length)+1);
      for(let local=0;local<count;local++){
        const id=categoryIndex+1+local*THEMES.length;
        const items=[0,1,2,3].map(k=>Object.assign({},th.items[(id*3+k)%th.items.length],{theme:th.name}));
        const order=LESSONS.length+1;
        const kinds=['choice','translate','match','build','audio'];
        const shift=(id-1)%kinds.length;
        const exercises=[{type:'learn',items}].concat(kinds.slice(shift).concat(kinds.slice(0,shift)).map((type,ei)=>{
          const seed=id*100+ei;
          const choice=(it,prompt)=>{const options=seededShuffle([...new Set([it.e,...distractors(it)])],seed);return{type:'choice',prompt,options,answer:options.indexOf(it.e)};};
          if(type==='choice')return choice(items[0],'What does “'+items[0].t+'” mean?');
          if(type==='translate')return{type,prompt:'Translate: '+items[1].e,item:items[1]};
          if(type==='match')return{type,pairs:items.map(it=>({t:it.t,e:it.e}))};
          if(type==='build')return items[2].s?{type,prompt:'Build: '+items[2].se,words:items[2].s.split(' '),answer:items[2].s,seed}:choice(items[2],'Choose the English for “'+items[2].t+'”');
          return{type:'audio',item:items[3],options:seededShuffle([...new Set([items[3].e,...distractors(items[3])])],seed)};
        }));
        LESSONS.push({id,order,category:th.name,icon:th.icon,difficulty:1+(id%5),title:items[0].t+' • Lesson '+order,items,exercises});
      }
    });
    return LESSONS;
  };
  if(LESSONS.length){buildLessons({total:LESSONS.length,themes:THEMES});migrateSrs();save();if(view==='home')go('home');}
})();
