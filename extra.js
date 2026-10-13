// Extra content and generators for DUOLIBEE
const PHRASES = [
  { en: "Good morning.", tl: "Magandang umaga." },
  { en: "How are you?", tl: "Kumusta ka?" },
  { en: "Thank you very much.", tl: "Maraming salamat." },
  { en: "I am hungry.", tl: "Gutom ako." },
  { en: "I want water.", tl: "Gusto ko ng tubig." },
  { en: "Where is the bathroom?", tl: "Nasaan ang banyo?" },
  { en: "How much is this?", tl: "Magkano ito?" },
  { en: "I don’t understand.", tl: "Hindi ko maintindihan." },
  { en: "Please speak slowly.", tl: "Pakiusap, magsalita nang mabagal." },
  { en: "I am learning Tagalog.", tl: "Nag-aaral ako ng Tagalog." },
  { en: "See you tomorrow.", tl: "Kita tayo bukas." },
  { en: "Take care.", tl: "Ingat ka." },
  { en: "I like this food.", tl: "Gusto ko ang pagkaing ito." },
  { en: "The weather is hot.", tl: "Mainit ang panahon." },
  { en: "I am from Australia.", tl: "Taga-Australia ako." },
  { en: "My family is big.", tl: "Malaki ang pamilya ko." },
  { en: "I need help.", tl: "Kailangan ko ng tulong." },
  { en: "The market is near.", tl: "Malapit ang palengke." },
  { en: "I am tired today.", tl: "Pagod ako ngayon." },
  { en: "Let’s eat together.", tl: "Kain tayo nang magkasama." }
];

function shuffle(array){
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeListening(){
  const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  const distractors = shuffle(PHRASES.filter(p => p.en !== phrase.en)).slice(0, 3).map(p => p.en);
  const options = shuffle([phrase.en, ...distractors]);
  return { type: "listen", prompt: "Listen and choose the meaning.", audio: phrase.tl, options, answer: options.indexOf(phrase.en), source: phrase };
}

function makeWordBank(){
  const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  const target = phrase.tl.replace(/\.$/, "");
  const extra = shuffle(PHRASES.flatMap(p => p.tl.replace(/\./, "").split(/\s+/))).slice(0, 4);
  return { type: "bank", prompt: `Build the Tagalog sentence: “${phrase.en}”`, answer: target, tokens: shuffle([...target.split(/\s+/), ...extra]) };
}

function makeMatch(){
  const picks = shuffle(PHRASES).slice(0, 4);
  return {
    type: "match",
    prompt: "Tap the matching pairs.",
    pairs: picks.map(p => ({ en: p.en, tl: p.tl }))
  };
}
