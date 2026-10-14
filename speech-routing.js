(() => {
  let current=null,serial=0,timer=null;
  function native(v){return /^(fil|tl|tgl)([-_]|$)/i.test(v.lang||'')||/filipino|tagalog/i.test(v.name||'');}
  function voice(){const list=speechSynthesis.getVoices();return list.find(native)||list.find(v=>v.name===state.settings.voice)||list.find(v=>/^ms([-_]|$)/i.test(v.lang||''))||list.find(v=>v.default)||list.find(v=>v.localService)||list[0]||null;}
  function status(message){let p=document.getElementById('speech-status');if(!p){p=document.createElement('p');p.id='speech-status';p.setAttribute('role','status');app.append(p);}p.textContent=message;}
  speak=function(text){
    if(!window.speechSynthesis){status('Device speech is unavailable. Use “I can’t hear this” to switch question type.');return;}
    const synth=speechSynthesis,id=++serial;clearTimeout(timer);
    if(synth.speaking||synth.pending)synth.cancel();
    synth.resume();const v=voice(),u=new SpeechSynthesisUtterance(String(text));current=u;
    if(v){u.voice=v;u.lang=v.lang;}
    u.rate=Number(state.settings.rate)||.9;
    u.onstart=()=>{if(id!==serial)return;clearTimeout(timer);status('Playing: '+(v?v.name:'system default'));};
    u.onend=()=>{if(id!==serial)return;clearTimeout(timer);current=null;status('Playback complete.');};
    u.onerror=e=>{if(id!==serial)return;clearTimeout(timer);current=null;status('Speech error: '+e.error+'. Tap Play to retry, or use “I can’t hear this”.');};
    try{synth.speak(u);timer=setTimeout(()=>{if(id===serial)status('Playback has not started. Tap Play again, check device volume/output, or use “I can’t hear this”.');},5000);}catch(e){clearTimeout(timer);status('Speech could not start: '+e.message);}
  };
  const settings=renderSettings;
  renderSettings=function(){settings();const p=document.createElement('p'),v=window.speechSynthesis?voice():null;p.textContent='Speech voice: '+(v?v.name+' ('+v.lang+')':'system default')+'. All voices receive original Tagalog unchanged.';app.prepend(p);const test=document.createElement('button');test.className='ghost';test.textContent='Test system voice';test.onclick=()=>{if(!window.speechSynthesis)return;serial++;clearTimeout(timer);speechSynthesis.cancel();speechSynthesis.resume();current=new SpeechSynthesisUtterance('Audio test.');current.onerror=e=>status('System voice error: '+e.error);speechSynthesis.speak(current);};app.append(test);};
  function addAudioHelp(){
    app.querySelectorAll('button.slow,button[onclick="testVoice(true)"]').forEach(b=>b.remove());
    if(typeof session==='undefined'||!session||!session.exercises[index]||session.exercises[index].type!=='audio'||document.getElementById('audio-help'))return;
    const b=document.createElement('button');b.id='audio-help';b.className='ghost';b.textContent='I can’t hear this';b.onclick=()=>{
      const ex=session.exercises[index];if(ex.type!=='audio'||session._answeredIndex===index)return;
      serial++;clearTimeout(timer);if(window.speechSynthesis)speechSynthesis.cancel();
      const options=[ex.item.e,...distractors(ex.item)];const unique=[...new Set(options)];
      session.exercises[index]={type:'choice',prompt:'Select the English for: '+ex.item.t,options:unique,answer:unique.indexOf(ex.item.e)};
      renderExercise();status('Audio question replaced with a written question. No penalty.');
    };const card=app.querySelector('.card');if(card)card.append(b);
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button.option');if(!b||!app.contains(b)||!session||session._answeredIndex===index)return;
    const ex=session.exercises[index];if(!['choice','audio'].includes(ex.type))return;
    const buttons=[...app.querySelectorAll('button.option')],i=buttons.indexOf(b),ok=ex.type==='choice'?i===ex.answer:ex.options[i]===ex.item.e;
    b.classList.add(ok?'correct':'wrong');b.setAttribute('aria-label',b.textContent+(ok?' — correct':' — incorrect'));
    queueMicrotask(()=>{buttons.forEach(x=>x.disabled=true);const help=document.getElementById('audio-help');if(help)help.disabled=true;});
  },true);
  const observer=new MutationObserver(addAudioHelp);observer.observe(app,{childList:true,subtree:true});addAudioHelp();
  const style=document.createElement('style');style.textContent="button.option.correct{background:#e8f8d8!important;border-color:#58cc02!important;color:#274d00!important}button.option.wrong{background:#ffe5e5!important;border-color:#ff4b4b!important;color:#b3261e!important}button.option:disabled{opacity:1}#audio-help{margin-top:16px}@keyframes beeFloat{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-6px) rotate(1deg)}}img[src*='mascot-'],.mascot-frame img,.brand>span:first-child{animation:beeFloat 3.4s ease-in-out infinite;filter:drop-shadow(0 5px 8px rgba(0,0,0,.14))}.brand>span:first-child{display:inline-block;flex:0 0 32px;width:32px;height:32px;font-size:0!important;background:url('assets/mascot-welcome.png') center/contain no-repeat}@media(max-width:560px){.brand>span:first-child{flex-basis:28px;width:28px;height:28px}}@media(prefers-reduced-motion:reduce){img[src*='mascot-'],.mascot-frame img,.brand>span:first-child{animation:none!important;transform:none!important}}";document.head.append(style);
})();
