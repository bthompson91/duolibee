// Abakada-based pronunciation fallback for browsers without a Filipino/Tagalog voice.
// Vowels are stable: a = ah, e = eh, i = ee, o = oh, u = oo.
const ABAKADA_VOWELS={a:'ah',e:'eh',i:'ee',o:'oh',u:'oo'};
const ABAKADA_CONSONANTS={b:'b',k:'k',d:'d',g:'g',h:'h',l:'l',m:'m',n:'n',p:'p',r:'r',s:'s',t:'t',w:'w',y:'y'};
const ABAKADA_EXCEPTIONS={'mga':'mahngah','ng':'nang','ñ':'ny','po':'poh','opo':'oh-poh','oo':'oh-oh','ang':'ahng','ung':'oong','ing':'eeng','ong':'ohng','eng':'ehng','maganda':'mah-gahn-dah','magandang':'mah-gahn-dahng','salamat':'sah-lah-maht','kumusta':'koo-moos-tah','kaibigan':'kah-ee-bee-gahn','babae':'bah-bah-eh','pagkain':'pahg-kah-een','tubig':'too-big','bahay':'bah-high'};
function isAbakadaVowel(ch){return Object.prototype.hasOwnProperty.call(ABAKADA_VOWELS,ch)}
function transliterateAbakadaWord(word){const w=word.toLowerCase();if(Object.prototype.hasOwnProperty.call(ABAKADA_EXCEPTIONS,w))return ABAKADA_EXCEPTIONS[w];const out=[];let i=0;while(i<w.length){if(w.startsWith('ng',i)){i+=2;if(i<w.length&&isAbakadaVowel(w[i])){out.push('ng'+ABAKADA_VOWELS[w[i]]);i++}else out.push('ng');continue}const ch=w[i];if(isAbakadaVowel(ch)){out.push(ABAKADA_VOWELS[ch]);i++;continue}if(Object.prototype.hasOwnProperty.call(ABAKADA_CONSONANTS,ch)){if(i+1<w.length&&isAbakadaVowel(w[i+1])){out.push(ch+ABAKADA_VOWELS[w[i+1]]);i+=2}else{out.push(ch);i++}continue}if(ch==='ñ'){out.push('ny');i++;continue}out.push(ch);i++}return out.join('-')}
function transliterateAbakada(text){return String(text).toLowerCase().replace(/[a-zñ]+/gi,match=>transliterateAbakadaWord(match)).replace(/\s+/g,' ').replace(/\s+([,!.?])/g,'$1').trim()}
function findTagalogVoice(voices=[]){return voices.find(voice=>/^fil(?:-|_|$)/i.test(voice.lang))||voices.find(voice=>/^tl(?:-|_|$)/i.test(voice.lang))||voices.find(voice=>/filipino|tagalog/i.test(voice.name))||null}
function tagalogSpeechText(text,hasNativeTagalogVoice){return hasNativeTagalogVoice?text:transliterateAbakada(text)}
function pronunciationDetails(text){return{guide:transliterateAbakada(text),fallback:transliterateAbakada(text)}}
