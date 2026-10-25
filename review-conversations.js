/* v0.34.0: one durable Bee thread; automatic lesson transitions. */
(() => {
  'use strict';
  const API='https://158-179-30-201.sslip.io/duolibee/chat';
  const PREF='duolibee-chat-enabled-v1';
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const account=()=>window.duolibeeAccount;
  const token=()=>account()?.getIdToken()||'';
  const owner=()=>account()?.getProfile()?.sub||account()?.getProfile()?.email||'';
  let enabled=false;
  try{enabled=localStorage.getItem(PREF)==='true';}catch(_){}
  let snapshot=null,messages=[],hasOlder=false,draft='',pending=null,busy=false,failed=false,notice='',epoch=0,activeOwner=owner();
  let olderAnchor=null;
  const requests=new Set();
  const storageKey=()=>`duolibee-thread-draft-v1:${owner()}`;
  function persist(){if(!owner())return;try{sessionStorage.setItem(storageKey(),JSON.stringify({draft,pending}));}catch(_){}}
  function restore(){if(!owner())return;try{const s=JSON.parse(sessionStorage.getItem(storageKey())||'{}');draft=typeof s.draft==='string'?s.draft.slice(0,500):'';pending=s.pending&&typeof s.pending==='object'?s.pending:null;}catch(_){}}
  restore();
  function scope(){try{const n=Object.keys(state.completed||{}).map(k=>parseInt(String(k).replace(/[^0-9]/g,''),10)).filter(Number.isFinite);return Math.min(100,Math.max(0,...n));}catch(_){return 0;}}
  function cancel(){epoch++;requests.forEach(c=>c.abort());snapshot=null;messages=[];hasOlder=false;pending=null;draft='';busy=false;failed=false;notice='';}
  async function api(path,method='GET',body){
    if(!enabled||!token())throw Error('Enable Chat and sign in in Settings.');
    const controller=new AbortController(),e=epoch;
    const timer=setTimeout(()=>controller.abort(),100000);requests.add(controller);
    try{
      const r=await fetch(API+path,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
        headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      let data;try{data=await r.json();}catch(_){data={};}
      if(e!==epoch)throw new DOMException('Account changed','AbortError');
      if(!r.ok){
        const provider={quota_or_rate_limit:'Google Gemini has reached a provider quota or rate limit. Try later.',invalid_assessment:'Bee’s response could not be validated. Your draft is safe; please retry.',connection_or_key_error:'Could not reach the assessment provider. Your draft is safe.'};
        const error=Error(r.status===401?'Please reconnect your Google account in Settings.':r.status===404?'The continuous-chat backend is not installed yet. Run voila after updating.':provider[data.error]||data.error||'Chat could not connect. Please retry.');
        error.code=r.status;throw error;
      }
      return data;
    }finally{clearTimeout(timer);requests.delete(controller);}
  }
  function accept(data,older=false){
    if(!data||!Array.isArray(data.messages))throw Error('Unexpected chat response.');
    const first=!snapshot;
    const merged=new Map(messages.map(m=>[m.eventId,m]));
    data.messages.forEach(m=>merged.set(m.eventId,m));
    messages=[...merged.values()].sort((a,b)=>a.eventId-b.eventId);
    if(first||older)hasOlder=!!data.hasOlder;
    if(!older)snapshot=data;
  }
  async function openThread(){accept(await api('/thread/open','POST',{lesson:Math.min(scope()+1,100),vocabularyThroughLesson:scope()}));}
  async function run(fn){
    if(busy)return;
    const e=epoch;busy=true;notice='';draw();
    try{await fn();if(e===epoch)failed=false;}
    catch(error){if(e===epoch){failed=true;notice=error.name==='AbortError'?'Connection interrupted. Your draft is preserved.':error.message;}}
    finally{if(e===epoch){busy=false;draw();}}
  }
  async function retry(){
    if(!pending)return;
    const p=pending;
    try{
      const data=await api('/thread/'+p.kind,'POST',p.body);accept(data);
      if(p.kind==='messages')draft='';
      pending=null;persist();
    }catch(error){
      if(error.code===409){pending=null;persist();await openThread();throw Error('Chat was updated elsewhere. Check the latest messages, then send your draft again.');}
      throw error;
    }
  }
  function act(kind){return run(async()=>{
    if(!snapshot)throw Error('Reconnect to Bee first.');
    if(pending)throw Error('Retry the pending action first.');
    const body={requestId:crypto.randomUUID(),expectedRevision:snapshot.revision};
    if(kind==='messages'){if(!draft.trim()||draft.trim().length>500)throw Error('Use 1–500 characters.');body.text=draft.trim();}
    pending={kind,body};persist();await retry();
  });}
  function button(parent,label,fn,disabled=false){const b=node('button',label);b.type='button';b.disabled=busy||disabled;b.onclick=fn;parent.append(b);return b;}
  function bubble(parent,m){if(!String(m.text||'').trim())return;const row=node('div');row.className='im-row '+(m.role==='learner'?'mine':'bee');if(m.kind==='feedback')row.classList.add('im-feedback');const b=node('div',m.text);b.className='im-bubble';b.setAttribute('aria-label',m.role==='learner'?'You':'Bee');row.append(b);parent.append(row);}
  function gate(){
    const c=node('section');c.id='chat-preference';c.className='card';c.append(node('h2','Chat'));
    const label=node('label'),check=node('input');check.type='checkbox';check.checked=enabled;
    check.onchange=()=>{enabled=check.checked;try{localStorage.setItem(PREF,String(enabled));}catch(_){}if(!enabled){persist();cancel();if(view==='chat')go('settings');}else{failed=false;restore();}renderTabs();refresh();};
    label.append(check,document.createTextNode(' I confirm that I am a legal adult and agree to Google’s policies stated '));
    const terms=node('a','here');terms.href='https://ai.google.dev/gemini-api/terms';terms.target='_blank';terms.rel='noopener';label.append(terms,document.createTextNode('.'));
    const privacy=node('a','DUOLIBEE’s chat data-use notice');privacy.href='chat-privacy.html';
    c.append(label,node('p','Chat uses Google Gemini. It is not available in the European Economic Area, Switzerland, or the United Kingdom under the current free service. Use fictional details only.'),privacy,node('p','Your continuous chat history is stored on the chat server for your account. You can erase this thread from Chat. Older legacy conversations remain separate stored records; erasing the thread does not delete those original records or backups. Unticking Chat hides it without erasing history.'));
    return c;
  }
  function draw(){
    if(view!=='chat')return;
    if(!enabled){go('settings');return;}
    const c=node('section');c.className='im-shell im-thread';
    const header=node('header');header.className='im-header';header.append(node('h2','🐝 Bee'),node('small','Tagalog practice · one ongoing conversation'));c.append(header);
    if(notice){const status=node('p',notice);status.setAttribute('role','status');c.append(status);}
    if(!token()){c.append(node('p','Sign in in Settings and Bee will start chatting here.'));button(c,'Settings',()=>go('settings'));app.replaceChildren(c);return;}
    const log=node('div');log.className='im-log';log.setAttribute('aria-label','Conversation with Bee');
    if(hasOlder&&messages.length)button(log,'Earlier messages',()=>run(async()=>{
      const previous=app.querySelector('.im-log')?.scrollHeight||log.scrollHeight;
      accept(await api('/thread/history?before='+messages[0].eventId),true);
      olderAnchor=previous;
    }));
    messages.forEach(m=>bubble(log,m));
    if(busy){const status=node('p',pending?.kind==='messages'?'Bee is replying…':'Connecting to Bee…');status.setAttribute('role','status');log.append(status);}
    c.append(log);
    if(snapshot){
      const form=node('form');form.className='im-composer';const input=node('textarea');input.rows=2;input.maxLength=500;input.value=draft;input.placeholder='Message Bee in Tagalog or Taglish…';input.setAttribute('aria-label','Message Bee');input.disabled=busy||!!pending;
      input.oninput=()=>{draft=input.value;persist();};form.append(input);
      button(form,'Send',()=>act('messages'),!!pending).className='primary';
      button(form,'Help me',()=>act('hint'),!!pending);
      form.onsubmit=e=>{e.preventDefault();act('messages');};c.append(form);
      const options=node('details');options.append(node('summary','Chat controls'));
      button(options,'Finish this practice',()=>act('end'),!!pending);
      button(options,'Reconnect',()=>run(openThread),!!pending);
      button(options,'Erase this thread',()=>{
        if(!confirm('Erase this continuous transcript and its current practice from the live server? Imported legacy originals, backups and provider records are separate.'))return;
        run(async()=>{await api('/thread','DELETE');snapshot=null;messages=[];hasOlder=false;pending=null;draft='';persist();await openThread();});
      },!!pending);c.append(options);
    }
    if(pending)button(c,'Retry sending',()=>run(retry));
    else if(failed)button(c,'Reconnect to Bee',()=>run(openThread));
    app.replaceChildren(c);log.scrollTop=olderAnchor===null?log.scrollHeight:Math.max(0,log.scrollHeight-olderAnchor);olderAnchor=null;
    if(!snapshot&&!busy&&!failed)queueMicrotask(()=>{if(view==='chat'&&!snapshot&&!busy&&!failed)run(async()=>{await openThread();if(pending)await retry();});});
  }
  function refresh(){if(view==='chat')draw();if(view==='settings'){document.getElementById('chat-preference')?.remove();app.append(gate());}}
  const oldTabs=renderTabs;renderTabs=function(){oldTabs();document.getElementById('tab-chat')?.classList.toggle('active',view==='chat');document.getElementById('tab-profile')?.remove();};
  const oldGo=go;go=function(n,...args){if(n==='profile')n='practice';if(n!=='chat')return oldGo(n,...args);if(!enabled)return oldGo('settings');oldGo('practice');view='chat';failed=false;renderTabs();draw();};
  const oldSettings=renderSettings;renderSettings=function(){oldSettings();app.append(gate());};
  const oldPractice=renderPractice;renderPractice=function(){oldPractice();const c=node('section');c.className='card';c.append(node('h2','Your progress'),node('p',Object.keys(state.completed||{}).length+' lessons · '+Object.keys(state.srs||{}).length+' review items · '+(state.streak||0)+' day streak · '+(state.xp||0)+' XP'));app.prepend(c);};
  window.addEventListener('duolibee-account',()=>{const next=owner();if(next!==activeOwner){cancel();activeOwner=next;restore();}else failed=false;refresh();});
  window.addEventListener('storage',event=>{if(event.key===PREF){enabled=event.newValue==='true';if(!enabled){cancel();if(view==='chat')go('settings');}else{failed=false;restore();}renderTabs();refresh();}});
  renderTabs();refresh();
})();
