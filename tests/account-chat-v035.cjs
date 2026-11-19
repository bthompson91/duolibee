const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const dir=process.argv[2]||'.';
const source=fs.readFileSync(path.join(dir,'cloud-save.js'),'utf8');
const start=source.indexOf('async function drive('),end=source.indexOf('const settings=renderSettings;',start);
assert(start>=0&&end>start);
let requests=0,syncs=0,events=0;const statusLog=[],prompts=[];
const c={console,TextDecoder,Uint8Array,atob,Date,setTimeout,clearTimeout,
  CLIENT:'test-client',SCOPE:'openid email https://www.googleapis.com/auth/drive.appdata',
  id:'old-id',who:{sub:'alice',email:'alice@example.test',exp:Math.floor(Date.now()/1000)+3600},access:'existing-access',expires:Date.now()+3600000,
  operation:1,busy:false,connecting:false,initialised:false,oauth:null,timer:null,view:'home',
  validId:()=>c.id,usable:()=>!!c.access&&Date.now()<c.expires,
  status:s=>statusLog.push(s),changed:()=>events++,renderSettings(){},
  failure:e=>{throw e},api:async()=>({sub:c.who.sub}),sync:async()=>{syncs++},
  sessionStorage:{removeItem(){}},
  window:{google:{accounts:{oauth2:{}}}},google:{accounts:{id:{initialize(){}},oauth2:{initTokenClient:config=>({...config,requestAccessToken(opts){requests++;prompts.push(opts&&opts.prompt);}})}}}
};
c.window.google=c.google;
vm.createContext(c);vm.runInContext(source.slice(start,end),c);
function credential(sub){return {credential:'header.'+Buffer.from(JSON.stringify({sub,email:sub+'@example.test',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature'};}
(async()=>{
  c.identity(credential('alice'));await Promise.resolve();
  assert.equal(c.access,'existing-access');assert.equal(requests,0);assert.equal(syncs,1);
  c.identity(credential('bob'));assert.equal(c.access,'');assert.equal(requests,1);assert.deepEqual(prompts,['none']);assert.equal(c.connecting,true);
  c.oauth.error_callback();assert.equal(requests,2);assert.deepEqual(prompts,['none','']);assert.equal(c.connecting,true);
  c.oauth.error_callback();assert.equal(c.connecting,false);assert(c.id);assert.equal(c.who.sub,'bob');
  const before=c.operation;await c.drive({access_token:'stale',scope:'https://www.googleapis.com/auth/drive.appdata'},before-1,'alice');assert.equal(c.access,'');
  await c.drive({access_token:'missing-scope',scope:'openid email'},c.operation,'bob');assert.equal(c.access,'');assert(c.id);
  await c.drive({access_token:'good',scope:'openid email https://www.googleapis.com/auth/drive.appdata',expires_in:3600},c.operation,'bob');assert.equal(c.access,'good');assert.equal(syncs,2);
  const renewals=requests;c.access='';c.expires=0;
  c.requestDriveToken(c.operation,'bob',false,()=>{c.connecting=false;});
  assert.equal(requests,renewals+1);assert.deepEqual(prompts.slice(-1),['none']);
  c.oauth.error_callback();assert.equal(requests,renewals+1);assert.equal(c.connecting,false);
  const math=require(path.resolve(dir,'chat-notifications.js'));
  assert.equal(math.available(0),1);assert.equal(math.available(100),100);
  assert.equal(math.unlocked(5,5),true);assert.equal(math.unlocked(5,6),false);
  // Pending reset + expired Drive token: sync() must still renew the
  // token (silent) so Erase can run again, and must not reconcile.
  const syncStart=source.indexOf('async function sync()');
  const syncEnd=source.indexOf('async function drive(',syncStart);
  assert(syncStart>=0&&syncEnd>syncStart);
  let reconcileCalls=0;
  c.reconcile=async()=>{reconcileCalls++;};
  c.resets={};c.navigator={onLine:true};
  vm.runInContext(source.slice(syncStart,syncEnd),c);
  c.resets={bob:{generation:'g1',pending:true}};
  c.access='';c.expires=0;c.connecting=false;
  const reqBeforePending=requests;
  await c.sync();
  assert.equal(requests,reqBeforePending+1,'sync with a pending reset and expired token must attempt silent renewal');
  assert.deepEqual(prompts.slice(-1),['none']);
  assert.equal(reconcileCalls,0,'sync with a pending reset must not reconcile');
  assert.equal(statusLog[statusLog.length-1],'Signed in. Renewing Google sync permission…');
  // Pending reset + valid token: no renewal, no reconcile, still points at Erase.
  c.access='good';c.expires=Date.now()+3600000;c.connecting=false;
  const reqBeforeValid=requests;
  await c.sync();
  assert.equal(requests,reqBeforeValid,'sync with a pending reset and valid token must not renew');
  assert.equal(reconcileCalls,0);
  assert.equal(statusLog[statusLog.length-1],'Reset incomplete. Use Erase learning progress again to finish; backup is paused.');
  // No pending reset: the normal path still reconciles.
  c.resets={};
  await c.sync();
  assert.equal(reconcileCalls,1,'sync without a pending reset must reconcile');
  // Erase guard with an expired Drive token: it must renew permission
  // (via connect) instead of refusing, and must not delete anything.
  const rpStart=source.indexOf('resetProgress=async function()');
  const rpEnd=source.indexOf('const version=document.querySelector',rpStart);
  assert(rpStart>=0&&rpEnd>rpStart);
  const alerts=[];
  c.alert=(m)=>alerts.push(m);
  vm.runInContext(source.slice(rpStart,rpEnd),c);
  c.access='';c.expires=0;c.connecting=false;c.busy=false;
  const reqBeforeErase=requests;
  await c.resetProgress();
  assert.equal(requests,reqBeforeErase+1,'erase with an expired token must attempt renewal');
  assert.deepEqual(prompts.slice(-1),['none']);
  assert.equal(alerts.length,1);
  assert.ok(/renewing first/.test(alerts[0])&&/tap Erase learning progress again/.test(alerts[0]),'erase must tell the user to retry after connecting, got: '+alerts[0]);
  assert.equal(c.access,'','erase must not proceed without a token');
  console.log('Checks passed: same-account permission retention, account-switch isolation, silent-first Drive auth with popup fallback, silent-only renewal without a popup, blocked-popup recovery, stale callback rejection, Drive-scope checks, unified continuation, unlock badge math, pending-reset token renewal without reconcile, erase guard renews instead of refusing.');
})().catch(e=>{console.error(e);process.exitCode=1});
