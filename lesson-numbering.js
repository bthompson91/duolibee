/* v0.25.0: canonical displayed lesson IDs and versioned progress migration. */
(()=>{
'use strict';
const VERSION='display-v2',oldIds=Array.from({length:25},(_,c)=>Array.from({length:4},(_,k)=>c+1+k*25)).flat(),mapping=new Map(oldIds.map((id,i)=>[id,i+1]));
function normalize(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid progress state.');
 if(input.lessonNumbering===VERSION)return input;
 if(input.lessonNumbering)throw Error('Unsupported lesson numbering. Progress was not changed.');
 const s=JSON.parse(JSON.stringify(input)),done={};
 for(const [key,value] of Object.entries(s.completed||{})){if(!/^[1-9][0-9]*$/.test(key)||!mapping.has(Number(key)))throw Error('Unrecognised completed lesson ID. Progress was not changed.');done[mapping.get(Number(key))]=value;}
 s.completed=done;
 const a=s.activeLesson;if(a?.session&&typeof a.session.id==='number'){const id=mapping.get(a.session.id);if(!id)throw Error('Unrecognised active lesson ID.');a.session.legacyId=a.session.id;a.session.id=id;a.session.order=id;a.session.title=String(a.session.title||'Lesson').replace(/Lesson \d+/g,'Lesson '+id);}
 s.lessonNumbering=VERSION;return s;
}
window.duolibeeMigrateLessonState=normalize;
try{
 if(state.lessonNumbering!==VERSION&&localStorage.getItem('duolibee-before-numbering-v2')===null)localStorage.setItem('duolibee-before-numbering-v2',JSON.stringify(state));
 state=normalize(state);DEFAULTS.lessonNumbering=VERSION;
 const build=buildLessons;
 function renumber(){for(const lesson of LESSONS){if(lesson.numberingVersion===VERSION)continue;const id=mapping.get(lesson.id);if(!id)throw Error('Lesson catalog numbering mismatch.');lesson.legacyId=lesson.id;lesson.id=id;lesson.order=id;lesson.numberingVersion=VERSION;lesson.title=String(lesson.title).replace(/Lesson \d+/g,'Lesson '+id);}LESSONS.sort((a,b)=>a.id-b.id);}
 buildLessons=function(...args){build(...args);renumber();return LESSONS;};renumber();
 const persist=save;save=function(...args){state=normalize(state);return persist(...args);};save();
 const originalFetch=window.fetch.bind(window);
 function progress(){const ids=Object.keys(state.completed||{}).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=100&&state.completed[n]);const through=ids.length?Math.max(...ids):0;return{numberingVersion:VERSION,missionId:'lesson-'+String(Math.min(through+1,100)).padStart(3,'0'),vocabularyThroughLesson:through};}
 const chatOrigin='https://158-179-30-201.sslip.io',chatPath='/duolibee/chat/sessions';
 window.fetch=async function(resource,options){
  const url=new URL(typeof resource==='string'?resource:resource.url,location.href);let init=options;
  const isChat=url.origin===chatOrigin&&url.pathname===chatPath;
  if(isChat&&String(options?.method||'GET').toUpperCase()==='POST'&&typeof options.body==='string'){
   const body=JSON.parse(options.body);if(body&&typeof body.missionId==='string'){init={...options,body:JSON.stringify({...body,...progress()})};}
  }
  let response=await originalFetch(resource,init);
  if(url.origin===chatOrigin&&/^\/duolibee\/chat\/sessions\/[^/]+$/.test(url.pathname)&&String(options?.method||'GET').toUpperCase()==='GET'&&response.status===404){
   if(window.duolibeeAccount?.getIdToken())response=await originalFetch(chatOrigin+chatPath,{...options,method:'POST',body:JSON.stringify(progress()),headers:{...options?.headers,'Content-Type':'application/json'}});
  }
  if(url.origin==='https://www.googleapis.com'&&/^\/drive\/v3\/files\/[^/]+$/.test(url.pathname)&&url.searchParams.get('alt')==='media'&&response.ok){
   const read=response.json.bind(response);response.json=async()=>{const d=await read();if(d?.app==='DUOLIBEE'&&d.version===1&&d.state)return{...d,state:normalize(d.state)};return d;};
  }
  return response;
 };
 if(LESSONS.length&&view==='home')go('home');
 const badge=document.querySelector('.brand .ver');if(badge)badge.textContent='v0.25.0';
}catch(error){console.error(error);app.replaceChildren();const section=document.createElement('section');section.className='card';const title=document.createElement('h2');title.textContent='Progress migration stopped safely';const message=document.createElement('p');message.textContent=error.message+' Do not reset or clear browser storage.';section.append(title,message);app.append(section);}
})();
