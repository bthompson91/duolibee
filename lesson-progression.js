/* v0.20.0: displayed-order frontier; stable completion IDs are unchanged. */
(()=>{
function frontier(){const list=LESSONS.slice().sort((a,b)=>a.order-b.order||a.id-b.id);let last=-1;list.forEach((l,i)=>{if(state.completed[l.id])last=i;});const end=Math.min(last+1,list.length-1);return{list,end,done:list.length>0&&list.every(l=>!!state.completed[l.id])};}
nextLesson=function(){const p=frontier();return p.done?undefined:p.list[p.end];};
startLesson=function(id){const p=frontier(),i=p.list.findIndex(l=>l.id===id);if(i<0||i>p.end)return;const lesson=p.list[i];delete lesson._answeredIndex;session=lesson;index=0;correct=0;renderExercise();};
const home=renderHome;renderHome=function(){home();const p=frontier(),open=new Set(p.list.slice(0,p.end+1).map(l=>l.id)),next=nextLesson();app.querySelectorAll('[data-lesson-id]').forEach(b=>{const id=Number(b.dataset.lessonId),l=p.list.find(x=>x.id===id);if(!l)return;b.disabled=!open.has(id);b.classList.toggle('locked',b.disabled);b.classList.toggle('current',l===next);const n=b.querySelector('.num');if(n)n.textContent='Lesson '+l.order+(b.disabled?' 🔒':'');});if(next&&state.completed[next.id]){const c=app.querySelector('.next-lesson');if(c){c.querySelector('h2').textContent='Furthest unlocked lesson';c.querySelector('button').textContent='Revisit Lesson '+next.order;}}};
const badge=document.querySelector('.brand .ver');if(badge)badge.textContent='v0.20.0';
})();
