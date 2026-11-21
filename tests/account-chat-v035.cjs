const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const dir=process.argv[2]||'.';
const source=fs.readFileSync(path.join(dir,'cloud-save.js'),'utf8');
const start=source.indexOf('async function drive('),end=source.indexOf('const settings=renderSettings;',start);
assert(start>=0&&end>start);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let syncs=0,events=0;const statusLog=[];
let fetchCalls=[];let refreshResult=null;let exchangeResult=null;
let codeConfig=null,codeRequests=0;
const c={console,TextDecoder,Uint8Array,atob,Date,setTimeout,clearTimeout,
  CLIENT:'test-client',SCOPE:'openid email https://www.googleapis.com/auth/drive.appdata',AUTH_API:'https://test.invalid/duolibee/chat/auth',
  id:'old-id',who:{sub:'alice',email:'alice@example.test',exp:Math.floor(Date.now()/1000)+3600},access:'existing-access',expires:Date.now()+3600000,
  operation:1,busy:false,running:false,connecting:false,initialised:false,oauth:null,timer:null,view:'home',meta:{},
  validId:()=>c.id,usable:()=>!!c.access&&Date.now()<c.expires,
  status:s=>statusLog.push(s),changed:()=>events++,renderSettings(){},
  failure:e=>{throw e},api:async()=>({sub:c.who.sub}),sync:async()=>{syncs++},
  sessionStorage:{removeItem(){}},
  fetch:async (url,opts)=>{
    fetchCalls.push({url,opts});
    if(String(url).endsWith('/auth/refresh')){
      if(!refreshResult)return {ok:false,status:401,json:async()=>({error:'no stored permission'})};
      return {ok:true,status:200,json:async()=>refreshResult};
    }
    if(String(url).endsWith('/auth/exchange')){
      if(!exchangeResult)return {ok:false,status:400,json:async()=>({error:'bad code'})};
      return {ok:true,status:200,json:async()=>exchangeResult};
    }
    return {ok:false,status:404,json:async()=>({})};
  },
  window:{google:{accounts:{oauth2:{}}}},google:{accounts:{id:{initialize(){}},oauth2:{initCodeClient:config=>{codeConfig=config;return {requestCode(){codeRequests++;if(config.callback)config.callback({code:'test-auth-code'});}};}}}}
};
c.window.google=c.google;
vm.createContext(c);vm.runInContext(source.slice(start,end),c);
function credential(sub){return {credential:'header.'+Buffer.from(JSON.stringify({sub,email:sub+'@example.test',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature'};}
(async()=>{
  // Same account, token usable: syncs, no re-auth, no backend call.
  c.identity(credential('alice'));await sleep(10);
  assert.equal(c.access,'existing-access');assert.equal(fetchCalls.length,0);assert.equal(syncs,1);
  // New user bob, no sync record: identity -> connect -> backend refresh
  // fails (no stored token) -> code flow popup -> exchange -> drive -> sync.
  refreshResult=null;exchangeResult={access_token:'at-bob',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/drive.appdata'};
  fetchCalls=[];codeRequests=0;
  c.identity(credential('bob'));await sleep(30);
  assert.equal(c.access,'at-bob');assert.equal(codeRequests,1);assert.equal(syncs,2);
  assert.ok(fetchCalls.some(f=>String(f.url).endsWith('/auth/refresh')),'new user must try the backend refresh first');
  assert.ok(fetchCalls.some(f=>String(f.url).endsWith('/auth/exchange')),'new user must exchange the code');
  assert.equal(c.connecting,false);assert.equal(c.who.sub,'bob');
  // Returning user (a sync record exists) whose token expired: identity
  // must NOT auto-connect and must not pop the Google prompt.
  c.meta={bob:{fileId:'file-1',synced:'{}',lastSync:Date.now()}};
  c.access='';c.expires=0;fetchCalls=[];codeRequests=0;
  c.identity(credential('bob'));await sleep(10);
  assert.equal(fetchCalls.length,0);assert.equal(codeRequests,0);assert.equal(c.connecting,false);
  assert.equal(statusLog[statusLog.length-1],'Signed in · Sync needs permission');
  // Expired token + backend refresh succeeds: silent, no popup, syncs.
  refreshResult={access_token:'at-bob-2',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/drive.appdata'};
  c.access='';c.expires=0;fetchCalls=[];codeRequests=0;
  const syncsBeforeRefresh=syncs;
  c.requestDriveToken(c.operation,'bob',false,()=>{c.connecting=false;});
  await sleep(30);
  assert.equal(c.access,'at-bob-2');assert.equal(codeRequests,0);
  assert.ok(fetchCalls.some(f=>String(f.url).endsWith('/auth/refresh')));
  assert.equal(syncs,syncsBeforeRefresh+1);
  // Expired token + backend refresh fails + no popup allowed: exhausted, no code flow.
  refreshResult=null;c.access='';c.expires=0;fetchCalls=[];codeRequests=0;
  let exhausted=false;
  c.requestDriveToken(c.operation,'bob',false,()=>{exhausted=true;c.connecting=false;});
  await sleep(30);
  assert.equal(exhausted,true);assert.equal(codeRequests,0);assert.equal(c.access,'');
  // drive() still rejects stale callbacks, missing scope, and keeps a good token.
  const before=c.operation;await c.drive({access_token:'stale',scope:'https://www.googleapis.com/auth/drive.appdata'},before-1,'alice');assert.equal(c.access,'');
  await c.drive({access_token:'missing-scope',scope:'openid email'},c.operation,'bob');assert.equal(c.access,'');assert(c.id);
  const syncsBeforeGood=syncs;
  await c.drive({access_token:'good',scope:'openid email https://www.googleapis.com/auth/drive.appdata',expires_in:3600},c.operation,'bob');assert.equal(c.access,'good');assert.equal(syncs,syncsBeforeGood+1);
  const math=require(path.resolve(dir,'chat-notifications.js'));
  assert.equal(math.available(0),1);assert.equal(math.available(100),100);
  assert.equal(math.unlocked(5,5),true);assert.equal(math.unlocked(5,6),false);
  // Pending reset + expired Drive token: sync() must still renew the
  // token (silent, via the backend) so Erase can run again, and must not reconcile.
  const syncStart=source.indexOf('async function sync()');
  const syncEnd=source.indexOf('async function drive(',syncStart);
  assert(syncStart>=0&&syncEnd>syncStart);
  let reconcileCalls=0;
  c.reconcile=async()=>{reconcileCalls++;};
  let generationResult='g1';
  c.currentGeneration=async()=>generationResult;
  c.writeResets=()=>{};
  c.resets={};c.navigator={onLine:true};
  vm.runInContext(source.slice(syncStart,syncEnd),c);
  c.resets={bob:{generation:'g1',pending:true}};
  c.access='';c.expires=0;c.connecting=false;
  refreshResult={access_token:'at-bob-3',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/drive.appdata'};
  fetchCalls=[];codeRequests=0;
  await c.sync();await sleep(30);
  assert.ok(fetchCalls.some(f=>String(f.url).endsWith('/auth/refresh')),'sync with a pending reset and expired token must attempt silent backend renewal');
  assert.equal(codeRequests,0,'sync must never pop the Google prompt');
  assert.equal(reconcileCalls,0,'sync with a pending reset must not reconcile');
  assert.equal(statusLog[statusLog.length-1],'Reset incomplete. Use Erase learning progress again to finish; backup is paused.');
  // Pending reset + valid token: no renewal, no reconcile, still points at Erase.
  c.access='good';c.expires=Date.now()+3600000;c.connecting=false;
  fetchCalls=[];
  await c.sync();
  assert.equal(fetchCalls.length,0,'sync with a pending reset and valid token must not renew');
  assert.equal(reconcileCalls,0);
  assert.equal(statusLog[statusLog.length-1],'Reset incomplete. Use Erase learning progress again to finish; backup is paused.');
  // Abandoned reset: the Drive marker is gone (generation 'legacy') but a
  // stale local reset record remains — sync must clear it and reconcile,
  // not stay paused and not wipe local progress.
  c.resets={bob:{generation:'g1',pending:true}};
  generationResult='legacy';
  c.access='good';c.expires=Date.now()+3600000;c.connecting=false;
  fetchCalls=[];const reconcileBeforeAbandon=reconcileCalls;
  await c.sync();
  assert.deepEqual(c.resets,{},'sync must clear a stale reset record when Drive has no marker');
  assert.equal(reconcileCalls,reconcileBeforeAbandon+1,'sync must reconcile once the stale reset is abandoned');
  generationResult='g1';
  // No pending reset: the normal path still reconciles.
  c.resets={};
  await c.sync();
  assert.equal(reconcileCalls,2,'sync without a pending reset must reconcile');
  // Active lesson (running): sync must not start at all — no token
  // renewal, no reconcile — so a background sync can never replace state
  // and call go('home') mid-question, kicking the user out of a lesson
  // (notably a speaking question, where the mic is live) or surface a
  // Google prompt. The backup waits until the lesson ends.
  c.running=true;c.access='';c.expires=0;c.connecting=false;
  refreshResult={access_token:'at-bob-4',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/drive.appdata'};
  fetchCalls=[];codeRequests=0;const reconcileBeforeRunning=reconcileCalls;
  await c.sync();await sleep(30);
  assert.equal(fetchCalls.length,0,'sync during an active lesson must not attempt a token renewal');
  assert.equal(codeRequests,0,'sync during an active lesson must not pop the Google prompt');
  assert.equal(reconcileCalls,reconcileBeforeRunning,'sync during an active lesson must not reconcile');
  c.running=false;
  // Same, but with the running flag unset (the renderExercise wrapper
  // chain can be shadowed, so running may be false even mid-lesson): an
  // active lesson session alone must still block sync, or a background
  // sync replaces state and calls go('home') mid-question — the kick-out
  // that returned after v0.39.27 unblocked the sync.
  c.session={id:16,exercises:[{type:'speak'},{type:'choice'}]};
  c.index=0;
  c.access='';c.expires=0;c.connecting=false;
  refreshResult={access_token:'at-bob-5',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/drive.appdata'};
  fetchCalls=[];codeRequests=0;const reconcileBeforeSession=reconcileCalls;
  await c.sync();await sleep(30);
  assert.equal(fetchCalls.length,0,'sync during an active lesson session must not attempt a token renewal even when running is unset');
  assert.equal(codeRequests,0,'sync during an active lesson session must not pop the Google prompt');
  assert.equal(reconcileCalls,reconcileBeforeSession,'sync during an active lesson session must not reconcile');
  c.session=null;c.index=0;
  // Erase guard with an expired Drive token: it must renew permission
  // (via connect) instead of refusing, and must not delete anything.
  const rpStart=source.indexOf('resetProgress=async function()');
  const rpEnd=source.indexOf('const version=document.querySelector',rpStart);
  assert(rpStart>=0&&rpEnd>rpStart);
  const alerts=[];
  c.alert=(m)=>alerts.push(m);
  vm.runInContext(source.slice(rpStart,rpEnd),c);
  c.access='';c.expires=0;c.connecting=false;c.busy=false;
  refreshResult=null;exchangeResult=null;fetchCalls=[];codeRequests=0;
  await c.resetProgress();await sleep(30);
  assert.ok(fetchCalls.some(f=>String(f.url).endsWith('/auth/refresh')),'erase with an expired token must attempt renewal');
  assert.equal(codeRequests,1,'erase with an expired token must offer the Google code flow');
  assert.equal(alerts.length,1);
  assert.ok(/renewing first/.test(alerts[0])&&/tap Erase learning progress again/.test(alerts[0]),'erase must tell the user to retry after connecting, got: '+alerts[0]);
  assert.equal(c.access,'','erase must not proceed without a token');
  console.log('Checks passed: same-account permission retention, account-switch isolation, backend refresh-token renewal without a popup, code-flow exchange for first-time connect, returning-user no-auto-connect, silent-only renewal without a popup, stale callback rejection, Drive-scope checks, unified continuation, unlock badge math, pending-reset token renewal without reconcile, erase guard renews instead of refusing, sync never interrupts an active lesson, sync never interrupts an active lesson session even when running is unset, abandoned-reset recovery clears the stale record and reconciles.');
})().catch(e=>{console.error(e);process.exitCode=1});
