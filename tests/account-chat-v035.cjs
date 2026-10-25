const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const dir=process.argv[2]||'.';
const source=fs.readFileSync(path.join(dir,'cloud-save.js'),'utf8');
const start=source.indexOf('async function drive('),end=source.indexOf('const settings=renderSettings;',start);
assert(start>=0&&end>start);
let requests=0,syncs=0,events=0;const statusLog=[];
const c={console,TextDecoder,Uint8Array,atob,Date,setTimeout,clearTimeout,
  CLIENT:'test-client',SCOPE:'openid email https://www.googleapis.com/auth/drive.appdata',
  id:'old-id',who:{sub:'alice',email:'alice@example.test',exp:Math.floor(Date.now()/1000)+3600},access:'existing-access',expires:Date.now()+3600000,
  operation:1,busy:false,connecting:false,initialised:false,oauth:null,timer:null,view:'home',
  validId:()=>c.id,usable:()=>!!c.access&&Date.now()<c.expires,
  status:s=>statusLog.push(s),changed:()=>events++,renderSettings(){},
  failure:e=>{throw e},api:async()=>({sub:c.who.sub}),sync:async()=>{syncs++},
  sessionStorage:{removeItem(){}},
  window:{google:{accounts:{oauth2:{}}}},google:{accounts:{id:{initialize(){}},oauth2:{initTokenClient:config=>({...config,requestAccessToken(){requests++}})}}}
};
c.window.google=c.google;
vm.createContext(c);vm.runInContext(source.slice(start,end),c);
function credential(sub){return {credential:'header.'+Buffer.from(JSON.stringify({sub,email:sub+'@example.test',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature'};}
(async()=>{
  c.identity(credential('alice'));await Promise.resolve();
  assert.equal(c.access,'existing-access');assert.equal(requests,0);assert.equal(syncs,1);
  c.identity(credential('bob'));assert.equal(c.access,'');assert.equal(requests,1);assert.equal(c.connecting,true);
  c.oauth.error_callback();assert.equal(c.connecting,false);assert(c.id);assert.equal(c.who.sub,'bob');
  const before=c.operation;await c.drive({access_token:'stale',scope:'https://www.googleapis.com/auth/drive.appdata'},before-1,'alice');assert.equal(c.access,'');
  await c.drive({access_token:'missing-scope',scope:'openid email'},c.operation,'bob');assert.equal(c.access,'');assert(c.id);
  await c.drive({access_token:'good',scope:'openid email https://www.googleapis.com/auth/drive.appdata',expires_in:3600},c.operation,'bob');assert.equal(c.access,'good');assert.equal(syncs,2);
  const math=require(path.resolve(dir,'chat-notifications.js'));
  assert.equal(math.available(0),1);assert.equal(math.available(100),100);
  assert.equal(math.unlocked(5,5),true);assert.equal(math.unlocked(5,6),false);
  console.log('Checks passed: same-account permission retention, account-switch isolation, blocked-popup recovery, stale callback rejection, Drive-scope checks, unified continuation, unlock badge math.');
})().catch(e=>{console.error(e);process.exitCode=1});
