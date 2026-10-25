const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(process.argv[2]||'review-conversations.js','utf8');
class Element{
  constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.className='';this.scrollHeight=1000;this.classList={add:(x)=>{this.className+=' '+x},toggle:()=>{}};}
  append(...nodes){this.children.push(...nodes)} prepend(...nodes){this.children.unshift(...nodes)}
  replaceChildren(...nodes){this.children=nodes} setAttribute(){} remove(){}
  querySelector(selector){return find(this,e=>e.className.split(' ').includes(selector.slice(1)))}
}
function find(root,predicate){if(predicate(root))return root;for(const child of root.children||[]){const result=find(child,predicate);if(result)return result;}return null;}
const app=new Element('main'),listeners={},storage=new Map();let signed=true,calls=[];
let data={messages:[{eventId:1,role:'bee',text:'Kumusta?'}],revision:0,hasOlder:false,hintLevels:{},status:'active'};
const context={console,Map,Set,Promise,queueMicrotask,setTimeout,clearTimeout,AbortController,DOMException,
  crypto:{randomUUID:()=>String(calls.length)},state:{completed:{}},app,view:'practice',confirm:()=>false,
  localStorage:{getItem:()=> 'true',setItem(){}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  document:{createElement:t=>new Element(t),createTextNode:t=>new Element('#text',t),getElementById:()=>null},
  window:{duolibeeAccount:{getIdToken:()=>signed?'secret-token':'',getProfile:()=>signed?{sub:'alice'}:null},addEventListener:(n,fn)=>listeners[n]=fn},
  renderTabs(){},renderSettings(){},renderPractice(){},go(n){context.view=n},
  fetch:async(url,options)=>{
    calls.push([url,options]);
    if(url.endsWith('/thread/messages')){
      const body=JSON.parse(options.body);
      data={...data,revision:2,messages:[...data.messages,{eventId:2,role:'learner',text:body.text},{eventId:3,role:'bee',text:'Thanks!'},{eventId:4,role:'bee',kind:'feedback',text:'Your Tagalog was clear.'},{eventId:5,role:'bee',text:'Next question?'}]};
    }
    return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(data))};
  }
};
(async()=>{
  vm.createContext(context);vm.runInContext(source,context);
  context.go('chat');await new Promise(r=>setTimeout(r,20));
  assert.equal(calls.length,1);assert(calls[0][0].endsWith('/thread/open'));
  assert(!find(app,e=>e.tagName==='select'));
  const input=find(app,e=>e.tagName==='textarea');assert(input);
  input.value='Okay lang';input.oninput();
  const send=find(app,e=>e.tagName==='button'&&e.textContent==='Send');send.onclick();
  await new Promise(r=>setTimeout(r,20));
  assert.equal(calls.length,2);
  assert(find(app,e=>e.textContent==='Your Tagalog was clear.'));
  assert(find(app,e=>e.textContent==='Next question?'));
  assert(!find(app,e=>e.textContent==='Scores and progress'));
  assert(!find(app,e=>e.textContent==='New lesson chat'));
  signed=false;listeners['duolibee-account']();
  assert(!find(app,e=>e.textContent==='Okay lang'));
  assert(find(app,e=>e.textContent==='Sign in in Settings and Bee will start chatting here.'));
  console.log('Frontend smoke checks passed: auto-open, send, inline feedback, automatic continuation, no picker, sign-out isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
