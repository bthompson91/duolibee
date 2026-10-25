/* v0.35.0: account-scoped, device-local unread and new-practice indicators. */
(()=>{
  const API='https://158-179-30-201.sslip.io/duolibee/chat';
  const math={available:n=>Math.min(100,Math.max(1,n+1)),unlocked:(completed,seen)=>Math.min(100,Math.max(1,completed+1))>seen};
  if(typeof module!=='undefined'&&module.exports){module.exports=math;return;}
  const profile=()=>window.duolibeeAccount?.getProfile();
  const subject=()=>profile()?.sub||'';
  const token=()=>window.duolibeeAccount?.getIdToken()||'';
  let unread=0,active='',polling=false,pollEpoch=0;
  const storeKey=()=>`duolibee-chat-read-v1:${subject()}`;
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(storeKey())||'{}');return {event:Math.max(0,Number(x.event)||0),lesson:Math.max(0,Number(x.lesson)||0)};}catch(_){return {event:0,lesson:0};}};
  function completed(){try{return Math.min(100,Math.max(0,...Object.keys(state.completed||{}).map(k=>parseInt(String(k).replace(/[^0-9]/g,''),10)).filter(Number.isFinite)));}catch(_){return 0;}}
  function enabled(){try{return localStorage.getItem('duolibee-chat-enabled-v1')==='true';}catch(_){return false;}}
  const style=document.createElement('style');style.textContent='.bee-chat-badge{display:inline-flex;align-items:center;justify-content:center;min-width:1.15em;height:1.15em;margin-left:6px;padding:2px 4px;border-radius:999px;background:#b51e28;color:#fff;font:700 12px system-ui;vertical-align:middle}.bee-chat-badge[hidden]{display:none}';document.head.append(style);
  function render(){
    const tab=document.getElementById('tab-chat');if(!tab)return;
    let badge=document.getElementById('bee-chat-badge');
    if(!badge){badge=document.createElement('span');badge.id='bee-chat-badge';badge.className='bee-chat-badge';badge.setAttribute('aria-hidden','true');tab.append(badge);}
    const fresh=!!subject()&&enabled()&&math.unlocked(completed(),read().lesson);
    const count=subject()&&enabled()?unread:0;
    badge.hidden=!fresh&&!count;badge.textContent=count?(count>99?'99+':String(count)):'•';
    const descriptions=[];if(count)descriptions.push(count+' unread Bee messages');if(fresh)descriptions.push('new practice available');
    tab.setAttribute('aria-label','Chat'+(descriptions.length?' — '+descriptions.join('; '):''));
    badge.title=descriptions.join('; ');
  }
  function seen(event){
    if(view!=='chat'||document.hidden||!subject()||event.detail?.subject!==subject())return;
    const previous=read(),id=Number(event.detail?.lastEventId)||0;
    try{localStorage.setItem(storeKey(),JSON.stringify({event:Math.max(previous.event,id),lesson:math.available(completed())}));}catch(_){}
    unread=0;render();
  }
  async function poll(){
    if(polling||document.hidden||!subject()||!token()||!enabled())return;
    const who=subject(),e=pollEpoch,cursor=read().event;polling=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(API+'/thread/notifications?since='+cursor,{credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token()},signal:controller.signal});
      if(!response.ok)return;
      const data=await response.json();if(who!==subject()||e!==pollEpoch||read().event!==cursor)return;
      unread=Number.isInteger(data.unread)?Math.max(0,data.unread):0;render();
    }catch(_){}finally{clearTimeout(timer);polling=false;}
  }
  const tabs=renderTabs;renderTabs=function(...args){const result=tabs(...args);render();return result;};
  const saveProgress=save;save=function(...args){const result=saveProgress(...args);render();return result;};
  window.addEventListener('duolibee-thread-viewed',seen);
  window.addEventListener('duolibee-account',()=>{if(active!==subject()){active=subject();pollEpoch++;unread=0;}render();poll();});
  window.addEventListener('focus',()=>{render();poll();});
  window.addEventListener('storage',event=>{if(event.key===storeKey()||event.key==='duolibee-chat-enabled-v1'){unread=0;render();poll();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();poll();}});
  setInterval(poll,60000);active=subject();render();poll();
})();
