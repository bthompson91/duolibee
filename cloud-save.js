/* v0.21.0: account-scoped cloud reset with generation protection. */
(()=>{
const CLIENT='953505436719-p73hfncc6p39481s6jaedj975l2a9rul.apps.googleusercontent.com',SCOPE='openid email https://www.googleapis.com/auth/drive.appdata',NAME='duolibee-progress-v1.json',AUTH_API='https://158-179-30-201.sslip.io/duolibee/chat/auth';
let id='',who=null,access='',expires=0,busy=false,paused=false,running=false,timer,oauth,initialised=false,message='Sign in once. Cloud backup is automatic when authorised and online.';
state.xp=Math.max(0,Number(state.xp)||0);
let operation=0,connecting=false;
let resets;try{resets=JSON.parse(localStorage.getItem('duolibee-reset-generations-v1')||'{}');}catch(_){resets={};}
let meta;try{meta=JSON.parse(localStorage.getItem('duolibee-cloud-meta-v1')||'{}');}catch(_){meta={};}
const copy=x=>JSON.parse(JSON.stringify(x)),validId=()=>who&&Date.now()<who.exp*1000-30000?id:'',usable=()=>access&&Date.now()<expires;
const record=()=>meta[who.sub]||(meta[who.sub]={fileId:'',synced:'',lastSync:0});
function status(s){message=s;const p=document.getElementById('cloud-status');if(p)p.textContent=s;}
function changed(){window.dispatchEvent(new CustomEvent('duolibee-account'));}
function disconnect(){connecting=false;try{sessionStorage.setItem('duolibee-google-explicit-signout','true');}catch(_){}window.google?.accounts?.id?.cancel();operation++;clearTimeout(timer);id='';who=null;access='';busy=false;window.google?.accounts?.id?.disableAutoSelect();status('Signed out. Progress is safe locally; backup awaits sign-in.');changed();if(view==='settings')renderSettings();}
window.duolibeeAccount={getIdToken:validId,getProfile:()=>validId()?{sub:who.sub,email:who.email}:null,disconnect};window.duolibeeGetTranslationIdToken=validId;
async function api(url,options={}){if(!usable())throw Error('Renew Google backup permission.');const token=access,op=operation,c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(url,{...options,signal:c.signal,headers:{Authorization:'Bearer '+token,...options.headers}});if(options.method==='DELETE'&&r.status===404){if(token!==access||op!==operation)throw Error('Account connection changed.');return{};}if(!r.ok){if(r.status===401)access='';throw Error('Drive request failed: '+r.status);}const data=r.status===204?{}:await r.json();if(token!==access||op!==operation)throw Error('Account connection changed.');return data;}finally{clearTimeout(t);}}
function validate(d){if(d?.app!=='DUOLIBEE'||d.version!==1||!d.state||Array.isArray(d.state))throw Error('Invalid cloud snapshot.');for(const k of ['completed','srs','settings'])if(!d.state[k]||typeof d.state[k]!=='object'||Array.isArray(d.state[k]))throw Error('Invalid progress.');if(!Number.isFinite(d.state.xp)||d.state.xp<0)throw Error('Invalid XP.');function walk(x){if(x&&typeof x==='object')for(const k of Object.keys(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Unsafe cloud key.');walk(x[k]);}}walk(d);const a=d.state.activeLesson;if(a&&(!a.session||typeof a.session.id!=='number'||!Array.isArray(a.session.exercises)||a.session.exercises.length>5000||!Number.isInteger(a.index)||a.index<0||a.index>=a.session.exercises.length||!Number.isFinite(a.correct)||a.session.exercises.some(e=>!['learn','choice','translate','match','build','audio'].includes(e.type))))throw Error('Invalid saved lesson.');return d.state;}
function advancement(s){return LESSONS.reduce((n,l,i)=>s.completed?.[l.id]?Math.max(n,l.order||i+1):n,0);}
function merge(a,b){const winner=advancement(a)>=advancement(b)?a:b,srs={...b.srs},completed={...b.completed};for(const[k,v]of Object.entries(a.srs||{})){const old=srs[k];if(!old||v.streak>old.streak||(v.streak===old.streak&&(v.due||0)>=(old.due||0)))srs[k]=v;}for(const[k,v]of Object.entries(a.completed||{}))if(!completed[k]||(v.last||0)>=(completed[k].last||0))completed[k]=v;return{...copy(winner),completed:copy(completed),srs,xp:Math.max(a.xp||0,b.xp||0),gems:Math.max(a.gems||0,b.gems||0),streak:Math.max(a.streak||0,b.streak||0),settings:copy(a.settings||{}),openThemes:{...b.openThemes,...a.openThemes}};}
function failure(e){status((e.name==='AbortError'?'Drive timed out.':e.message)+' Saved locally; backup pending.');}
function schedule(){clearTimeout(timer);if(!paused&&usable()&&!resets[who?.sub]?.pending)timer=setTimeout(()=>sync().catch(failure),3000);}
async function reconcile(){const generation=await currentGeneration();if((resets[who.sub]?.generation||'legacy')!==generation){emptyLocal();resets[who.sub]={generation};writeResets();}const q=new URLSearchParams({spaces:'appDataFolder',q:"name = '"+NAME+"' and trashed = false"+(generation==='legacy'?'':" and appProperties has { key='resetGeneration' and value='"+generation+"' }"),fields:'files(id)',orderBy:'createdTime desc',pageSize:'1'}),remote=(await api('https://www.googleapis.com/drive/v3/files?'+q)).files?.[0];let remoteText='';if(remote){const snapshot=await api('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(remote.id)+'?alt=media');if((snapshot.resetGeneration||'legacy')!==generation)throw Error('Cloud reset generation mismatch. Reload and retry.');const other=validate(snapshot);remoteText=JSON.stringify(other);const meaningful=Object.keys(state.completed||{}).length||Object.keys(state.srs||{}).length||state.xp>0||state.dailyChallenge||state.activeLesson;const merged=meaningful?merge(state,other):other;if(JSON.stringify(merged)!==JSON.stringify(state)){localStorage.setItem('duolibee-before-cloud-restore',JSON.stringify(state));paused=true;try{running=false;state={...copy(DEFAULTS),...copy(merged)};state.settings={...DEFAULTS.settings,...state.settings};migrateSrs();save();document.body.classList.toggle('dark',!!state.settings.dark);go('home');}finally{paused=false;}}}
const text=JSON.stringify(state);let file=remote;if(text!==remoteText){file=await writeJSON(NAME,{app:'DUOLIBEE',version:1,resetGeneration:generation,savedAt:new Date().toISOString(),parent:remote?.id||null,state:JSON.parse(text)},{resetGeneration:generation});}if(await currentGeneration()!==generation)throw Error('Cloud was reset during backup. Retry.');Object.assign(record(),{fileId:file.id,synced:text,lastSync:Date.now()});localStorage.setItem('duolibee-cloud-meta-v1',JSON.stringify(meta));status('Cloud backup saved · '+new Date().toLocaleTimeString());if(JSON.stringify(state)!==text)schedule();}
async function sync(){if(busy)return;if(!who||!usable()){if(who&&!connecting){const op=operation,subject=who.sub,pending=!!resets[who.sub]?.pending;connecting=true;status('Signed in. Renewing Google sync permission…');if(requestDriveToken(op,subject,false,()=>{if(op!==operation)return;connecting=false;status(pending?'Reset incomplete. Use Erase learning progress again to finish; backup is paused.':'Backup pending: renew Google permission.');if(view==='settings')renderSettings();}))return;connecting=false;status(pending?'Reset incomplete. Use Erase learning progress again to finish; backup is paused.':'Backup pending: renew Google permission.');}return;}
// The token is renewed even while a reset is pending (its expiry is what
// left erasure stuck: nothing renews it while backup is paused, and the
// erase guard then refuses to run). A pending reset still blocks the
// reconcile below — only the token is renewed, so Erase can run again.
if(resets[who?.sub]?.pending){status('Reset incomplete. Use Erase learning progress again to finish; backup is paused.');return;}if(!navigator.onLine){status('Offline; backup pending. Progress is saved locally.');return;}busy=true;status('Backing up…');try{await reconcile();}finally{busy=false;}}
async function drive(r,op=operation,subject=who?.sub){
  if(op!==operation||subject!==who?.sub)return;
  connecting=false;
  if(r.error||typeof r.access_token!=='string'){status('Signed in. Google sync permission was not completed; use Finish connecting to continue.');if(view==='settings')renderSettings();return;}
  const granted=String(r.scope||'').split(/\s+/);
  if(!granted.includes('https://www.googleapis.com/auth/drive.appdata')){status('Signed in. Drive backup permission was not granted; local progress is safe.');if(view==='settings')renderSettings();return;}
  access=r.access_token;expires=Date.now()+Number(r.expires_in||3600)*1000-60000;
  try{
    const u=await api('https://openidconnect.googleapis.com/v1/userinfo');
    if(op!==operation||u.sub!==subject||who?.sub!==subject){access='';throw Error('Google account mismatch. Reconnect using the same account.');}
    status('Signed in · Sync connected. Backing up…');await sync();
  }catch(e){failure(e);}
  if(view==='settings')renderSettings();
}
async function refreshViaBackend(){
  // Silent: ask the server for a fresh access token from the stored
  // refresh token. No Google prompt, no navigation. Returns the token
  // response ({access_token, expires_in, scope}) or null.
  const token=validId();
  if(!token)return null;
  try{
    const r=await fetch(AUTH_API+'/refresh',{method:'POST',headers:{Authorization:'Bearer '+token}});
    if(!r.ok)return null;
    const data=await r.json().catch(()=>null);
    if(!data||typeof data.access_token!=='string')return null;
    return data;
  }catch(_){return null;}
}
function startCodeFlow(op,subject,onExhausted){
  // Popup code flow: Google returns a one-time code; the code is POSTed
  // to the server, which exchanges it for an access token + refresh
  // token. access_type offline + prompt consent make Google issue a
  // refresh token. Only ever runs when the user asked to connect.
  let codeClient;
  const fail=()=>{if(op===operation)onExhausted();};
  try{
    codeClient=google.accounts.oauth2.initCodeClient({client_id:CLIENT,scope:SCOPE,ux_mode:'popup',access_type:'offline',prompt:'consent',callback:async (resp)=>{
      if(op!==operation)return;
      if(!resp||typeof resp.code!=='string'){fail();return;}
      try{
        const r=await fetch(AUTH_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XmlHttpRequest',Authorization:'Bearer '+validId()},body:JSON.stringify({code:resp.code})});
        const data=await r.json().catch(()=>({}));
        if(!r.ok||typeof data.access_token!=='string'){fail();return;}
        drive({access_token:data.access_token,scope:data.scope||SCOPE,expires_in:data.expires_in||3600},op,subject);
      }catch(_){fail();}
    },error_callback:fail});
  }catch(_){fail();return;}
  try{codeClient.requestCode();}catch(_){fail();}
}
function requestDriveToken(op,subject,allowPopup,onExhausted){
  if(!window.google?.accounts?.oauth2)return false;
  // 1. Silent first: the server mints a fresh token from the stored
  //    refresh token, so the backup stays connected without a login.
  refreshViaBackend().then((data)=>{
    if(op!==operation)return;
    if(data){drive({access_token:data.access_token,scope:data.scope||SCOPE,expires_in:data.expires_in||3600},op,subject);return;}
    if(!allowPopup){onExhausted();return;}
    // 2. No usable refresh token: pop the Google code flow so the user
    //    can reconnect. Only runs when connecting was asked for.
    startCodeFlow(op,subject,onExhausted);
  }).catch(()=>{if(op===operation)onExhausted();});
  return true;
}
function connect(){
  if(!validId()||busy||connecting)return;
  if(!window.google?.accounts?.oauth2){status('Google is still loading. Please retry.');return;}
  connecting=true;status('Signed in. Continuing to Google sync permission…');
  const op=operation,subject=who.sub;
  const blocked=()=>{if(op!==operation)return;connecting=false;status('Signed in. Your browser needs a click to finish Google sync; use Finish connecting.');if(view==='settings')renderSettings();};
  if(!requestDriveToken(op,subject,true,blocked)){connecting=false;status('Google is still loading. Please retry.');}
}
function identity(r){
  if(busy)return;
  try{
    const p=r.credential.split('.')[1];
    const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(p.length/4)*4,'=')),x=>x.charCodeAt(0))));
    if(typeof claims.sub!=='string'||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw Error('Invalid Google identity.');
    const same=who?.sub===claims.sub&&usable();
    operation++;clearTimeout(timer);connecting=false;
    if(!same){access='';expires=0;}
    id=r.credential;who={sub:claims.sub,email:String(claims.email||''),exp:claims.exp};
    try{sessionStorage.removeItem('duolibee-google-explicit-signout');}catch(_){}
    changed();
    if(same){status('Signed in · Sync connected.');sync().catch(failure);}
    // A returning user whose Drive permission expired: do NOT pop the
    // Google prompt here. identity() fires on app load (One Tap
    // auto-select), and if a speaking question is asking for the
    // microphone at the same time, the Google page navigates away and
    // the mic request comes back denied, so the question flips to a
    // written one. The background sync retries the token silently
    // instead; reconnect from Settings ("Finish connecting") when
    // convenient. Only a first-time Drive connection (no sync record
    // for this account yet) still auto-connects, so setup stays one
    // tap.
    else if(meta[who.sub]&&(meta[who.sub].fileId||meta[who.sub].lastSync)){status('Signed in · Sync needs permission');}
    else connect();
    if(view==='settings')renderSettings();
  }catch(e){connecting=false;failure(e);}
}
function initialiseGoogle(){
  if(initialised||!window.google?.accounts?.id)return;
  google.accounts.id.initialize({client_id:CLIENT,callback:identity,auto_select:true});initialised=true;
}
const settings=renderSettings;renderSettings=function(){
  settings();
  const c=document.createElement('section');c.className='card';c.id='cloud-card';
  const h=document.createElement('h2');h.textContent='Google sign-in & sync';
  const p=document.createElement('p');p.id='cloud-status';p.setAttribute('role','status');
  p.textContent=message;c.append(h,p);
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.className='ghost';b.disabled=busy||connecting;b.onclick=fn;c.append(b);}
  if(validId()){
    const a=document.createElement('p');a.textContent=who.email+' · '+(usable()?'Signed in · Sync connected':connecting?'Connecting sync…':'Signed in · Sync needs permission');c.append(a);
    if(!usable()&&!connecting)button('Finish connecting Google & sync',connect);
    if(usable())button('Back up now',()=>sync().catch(failure));
    button('Sign out',disconnect);
  }else{
    const explanation=document.createElement('p');explanation.textContent='Continue with Google to sign in and connect automatic backup. Google may show account and Drive permission screens; follow them to finish connecting.';c.append(explanation);
    const n=document.createElement('div');c.append(n);
    setTimeout(()=>{if(!n.isConnected)return;if(!window.google?.accounts?.id){n.textContent='Google is loading; reopen Settings.';return;}initialiseGoogle();google.accounts.id.renderButton(n,{theme:'outline',size:'large',text:'continue_with'});},0);
  }
  const note=document.createElement('a');note.href='reset-privacy.html';note.textContent='Local and Google progress erasure';c.append(note);app.prepend(c);
  const resetButton=app.querySelector('button[onclick="resetProgress()"]');if(resetButton)resetButton.textContent='Erase learning progress here and in Google Drive';
};
const persist=save;save=function(){if(running&&session&&typeof session.id==='number'){if(index<session.exercises.length)state.activeLesson={session:copy(session),index,correct};else delete state.activeLesson;}persist();schedule();};
for(const name of ['renderExercise','feedback','pickMatch','next']){const original=window[name];window[name]=function(...args){const r=original(...args);if(name==='renderExercise')running=!!session&&typeof session.id==='number';if(name==='next'&&running&&index>=session.exercises.length){delete state.activeLesson;running=false;save();}else if(running)save();return r;};}
const oldGo=go;go=function(...args){running=false;return oldGo(...args);};
function resumeCard(){if(view!=='home'||!state.activeLesson||!app.querySelector('.hero')||document.getElementById('cloud-resume-card'))return;const c=document.createElement('section');c.id='cloud-resume-card';c.className='card';const b=document.createElement('button');b.className='primary';b.textContent='Resume saved lesson';b.onclick=()=>{const a=state.activeLesson;if(!a||!LESSONS.some(l=>l.id===a.session.id))return;session=copy(a.session);index=a.index;correct=a.correct;running=true;if(session._settledIndex===index)next();else renderExercise();};c.append(b);app.querySelector('.hero').after(c);}
new MutationObserver(resumeCard).observe(app,{childList:true,subtree:true});for(const e of ['online','focus'])window.addEventListener(e,()=>sync().catch(failure));document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)save();});const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>{
  initialiseGoogle();
  let signedOut=false;try{signedOut=sessionStorage.getItem('duolibee-google-explicit-signout')==='true';}catch(_){}
  if(!validId()&&!signedOut){try{google.accounts.id.prompt();}catch(_){}}
  if(view==='settings')renderSettings();
};script.onerror=()=>status('Google unavailable; progress is saved locally.');document.head.append(script);resumeCard();

const RESET='duolibee-progress-reset-v1.json';
function writeResets(){localStorage.setItem('duolibee-reset-generations-v1',JSON.stringify(resets));}
async function filesNamed(name){let token='',all=[];do{const q=new URLSearchParams({spaces:'appDataFolder',q:"name = '"+name+"' and trashed = false",fields:'nextPageToken,files(id)',orderBy:'createdTime desc',pageSize:'1000',...(token?{pageToken:token}:{})});const page=await api('https://www.googleapis.com/drive/v3/files?'+q);all.push(...(page.files||[]));token=page.nextPageToken||'';}while(token);return all;}
async function currentGeneration(){const files=await filesNamed(RESET);if(!files.length)return'legacy';const marker=await api('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(files[0].id)+'?alt=media');if(marker.app!=='DUOLIBEE'||marker.kind!=='reset'||!/^[0-9a-f-]{36}$/i.test(marker.generation))throw Error('Invalid cloud reset marker; backup stopped.');return marker.generation;}
async function writeJSON(name,data,properties={}){const boundary='bee_'+crypto.randomUUID(),payload=JSON.stringify(data);if(payload.length>5000000)throw Error('Backup too large.');const body='--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify({name,mimeType:'application/json',parents:['appDataFolder'],appProperties:properties})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+payload+'\r\n--'+boundary+'--';return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});}
function emptyLocal(){const previous=paused;paused=true;try{clearTimeout(timer);running=false;session=null;index=0;correct=0;const settings=copy(state.settings||DEFAULTS.settings);state={...copy(DEFAULTS),completed:{},srs:{},xp:0,settings,openThemes:{}};meta={};localStorage.removeItem('duolibee-before-cloud-restore');localStorage.removeItem('duolibee-cloud-meta-v1');localStorage.removeItem('duolibee-v2');save();go('home');}finally{paused=previous;}}
resetProgress=async function(){if(busy){alert('A backup is running. Wait for it to finish, then retry erasure.');return;}if(!navigator.onLine){alert('You are offline. Reconnect, then retry erasure. Nothing has been erased.');return;}if(!who||!validId()){alert('Sign in and complete Google backup permission while online to erase progress both here and in Google Drive. Nothing has been erased.');return;}if(!usable()){
// The Drive permission lasts about an hour, so after a reset failed
// partway (and paused backup) it is usually expired by the time erasure
// is retried — and the old guard just refused to run, leaving the wipe
// stuck. Renew it now (silent first, then the Google prompt) and ask
// the user to tap Erase again once it says Sync connected.
connect();alert('Google sync permission needs renewing first — follow the Google prompt, then tap Erase learning progress again. Nothing has been erased yet.');return;}busy=true;paused=true;clearTimeout(timer);const subject=who.sub;let started=false;try{const u=await api('https://openidconnect.googleapis.com/v1/userinfo');if(u.sub!==subject||who?.sub!==subject)throw Error('Google account mismatch. Nothing erased.');if(!confirm('Permanently erase Lumpia Lingo learning progress on this device and every Lumpia Lingo progress snapshot in Google Drive for '+String(u.email||who.email)+'?\n\nClose other devices first. Ordinary Drive files, app preferences and Chat conversations are not deleted. A reset marker and a new empty backup will remain.'))return;
started=true;operation++;const generation=crypto.randomUUID();resets[subject]={generation,pending:true};writeResets();await writeJSON(RESET,{app:'DUOLIBEE',kind:'reset',generation,resetAt:new Date().toISOString()});emptyLocal();for(let pass=0;pass<3;pass++){const files=await filesNamed(NAME);if(!files.length)break;for(const f of files)await api('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(f.id),{method:'DELETE'});}if((await filesNamed(NAME)).length)throw Error('Another device is still uploading. Close it and retry erasure.');if(await currentGeneration()!==generation)throw Error('Another reset occurred. Retry to finish safely.');await reconcile();if(await currentGeneration()!==generation)throw Error('Another reset occurred. Retry to finish safely.');resets[subject]={generation};writeResets();status('Learning progress erased locally and in Google Drive.');alert('Learning progress erased on this device and in Google Drive. Reload older app versions on other devices before using them.');location.reload();
}catch(e){status((started?'Reset incomplete: ':'Reset not started: ')+e.message+(started?' Automatic backup remains paused until you retry erasure for this account.':''));alert((started?'Reset incomplete. Some deletions may already have succeeded. ':'Erasure could not start. ')+e.message+' Do not clear browser storage; sign in to the same account and retry the button.');}finally{busy=false;paused=!!resets[who?.sub]?.pending;if(!paused)schedule();}};
const version=document.querySelector('.brand .ver');if(version)version.textContent='v'+(document.documentElement.dataset.appVersion||'0.39.6');
})();
