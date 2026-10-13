// DUOLIBEE v0.6 — original 100-lesson bite-size Tagalog curriculum
// Each theme supplies 12 vocabulary items; items are grouped into 3-item
// bite-size lessons. Exercise types are generated deterministically.
const THEMES = [
["👋",["Kumusta|Hello","Magandang umaga|Good morning","Magandang hapon|Good afternoon","Magandang gabi|Good evening","Paalam|Goodbye","Salamat|Thank you","Walang anuman|You’re welcome","Pasensya na|Sorry","Pakiusap|Please","Oo|Yes","Hindi|No","Ingat|Take care"]],
["👥",["ako|I / me","ikaw|you","siya|he / she","kami|we (not you)","tayo|we (including you)","kayo|you all","sila|they","lalaki|man","babae|woman","bata|child","kaibigan|friend","tao|person"]],
["🙋",["pangalan|name","Ako si Ana|I am Ana","Anong pangalan mo?|What is your name?","Taga-saan ka?|Where are you from?","Taga-Australia ako|I am from Australia","Pilipino|Filipino","Ingles|English","Tagalog|Tagalog","nag-aaral|studying","guro|teacher","maganda|beautiful","masaya|happy"]],
["👨‍👩‍👧",["pamilya|family","nanay|mother","tatay|father","kapatid|sibling","kuya|older brother","ate|older sister","lolo|grandfather","lola|grandmother","anak|child","asawa|spouse","pamilya ko|my family","mabait|kind"]],
["🍚",["pagkain|food","kanin|cooked rice","tinapay|bread","itlog|egg","karne|meat","manok|chicken","baboy|pork","isda|fish","gulay|vegetables","prutas|fruit","masarap|delicious","Gutom ako|I am hungry"]],
["💧",["tubig|water","kape|coffee","tsaa|tea","gatas|milk","juice|juice","saging|banana","mangga|mango","mansanas|apple","pinya|pineapple","ubas|grapes","matamis|sweet","Uhaw ako|I am thirsty"]],
["1️⃣",["isa|one","dalawa|two","tatlo|three","apat|four","lima|five","anim|six","pito|seven","walo|eight","siyam|nine","sampu|ten","labing-isa|eleven","labindalawa|twelve"]],
["🕒",["oras|time","ngayon|now","mamaya|later","kanina|earlier","kahapon|yesterday","araw|day","bukas|tomorrow","umaga|morning","tanghali|noon","hapon|afternoon","gabi|night","linggo|week"]],
["🏙️",["bahay|house","eskwelahan|school","ospital|hospital","botika|pharmacy","simbahan|church","tindahan|store","palengke|market","bangko|bank","hotel|hotel","tanggapan|office","kalsada|street","banyo|bathroom"]],
["🧭",["saan|where","kaliwa|left","kanan|right","deretso|straight","malapit|near","malayo|far","dito|here","doon|there","harap|front","likod|back","taas|up","baba|down"]],
["🚌",["sasakyan|vehicle","bus|bus","tren|train","eroplano|airplane","bangka|boat","jeepney|jeepney","taksi|taxi","drayber|driver","pasahero|passenger","istasyon|station","tiket|ticket","biyahe|trip"]],
["✈️",["bakasyon|vacation","pasaporte|passport","maleta|luggage","kuwarto|room","susi|key","paliparan|airport","daungan|port","mapa|map","kamera|camera","larawan|photo","sandali|moment","hinto|stop"]],
["🛍️",["bumili|to buy","magkano|how much","mura|cheap","mahal|expensive","sukli|change","tindera|vendor","damit|clothes","sapatos|shoes","bag|bag","tawad|discount","bayad|payment","resibo|receipt"]],
["👕",["damit|clothes","kamiseta|T-shirt","pantalon|pants","sapatos|shoes","sombrero|hat","medyas|socks","dyaket|jacket","palda|skirt","baro|shirt","sinturon|belt","bago|new","luma|old"]],
["🏠",["kuwarto|room","hapag|table","upuan|chair","kama|bed","bintana|window","pinto|door","bubong|roof","kusina|kitchen","lababo|sink","ilaw|light","kandado|lock","gripo|faucet"]],
["⏰",["gising|awake","tulog|sleep","maligo|to shower","bumihis|to get dressed","kain|eat","inom|drink","trabaho|work","eskwela|school","pahinga|rest","laba|laundry","luto|cook","linis|clean"]],
["🌦️",["panahon|weather","mainit|hot","malamig|cold","maaraw|sunny","maulan|rainy","ulan|rain","araw|sun","buwan|moon","hangin|wind","bagyo|storm","kulog|thunder","kidlat|lightning"]],
["🌿",["dagat|sea","bundok|mountain","ilog|river","lawa|lake","kagubatan|forest","bulaklak|flower","puno|tree","ibon|bird","hayop|animal","langit|sky","bituin|star","buhangin|sand"]],
["😊",["masaya|happy","malungkot|sad","galit|angry","takot|afraid","pagod|tired","inaantok|sleepy","sabik|excited","tahimik|quiet","maingay|noisy","busog|full","kinakabahan|nervous","maganda ang araw|the day is nice"]],
["🤒",["sakit|sickness / pain","masakit|painful","ulo|head","tiyan|stomach","ngipin|tooth","doktor|doctor","nars|nurse","gamot|medicine","sakit ng ulo|headache","lagnat|fever","ubo|cough","sipon|cold"]],
["💼",["opisina|office","amo|boss","empleyado|employee","mag-aaral|student","pagsusulit|exam","aralin|lesson","libro|book","lapis|pencil","papel|paper","kompyuter|computer","proyekto|project","pulong|meeting"]],
["❓",["ano|what","sino|who","kailan|when","bakit|why","paano|how","alin|which","ba|question particle","Ano ito?|What is this?","Sino siya?|Who is he or she?","Kailan tayo?|When are we going?","Bakit hindi?|Why not?","Paano puntahan?|How do I get there?"]],
["🏃",["kumakain|eating","umiinom|drinking","naglalakad|walking","tumatakbo|running","nagsasalita|speaking","nakikinig|listening","nanonood|watching","nagbabasa|reading","sumusulat|writing","nagluluto|cooking","natutulog|sleeping","gumagana|working"]],
["🆘",["tulong|help","sandali lang|one moment","teka|wait","sige|okay","pwede|can / may","dahan-dahan|slowly","muli|again","tama|correct","mali|wrong","handa|ready","tapos|finished","siguro|maybe"]],
["💬",["Anong balita?|What’s new?","Ayos lang|It’s fine","Salamat sa tulong|Thanks for the help","Walang problema|No problem","Kaibigan ko|My friend","Mahal kita|I love you","Ingat ka|Take care","Kita tayo|See you","Pupunta ako|I will go","Saan ka galing?|Where did you come from?","Sarap ng pagkain|The food is good","Magandang araw|Nice day"]]
];

const UNITS = [
"First Words","People & Family","Food & Drink","Numbers & Time","Around Town",
"Travel & Transport","Shopping & Things","Daily Life","Nature & Feelings","Conversation & Survival"
];

function rotate(arr, n) {
  return arr.map((_, i) => arr[(i + n) % arr.length]);
}

const LESSONS = [];
let lessonId = 1;

THEMES.forEach(([icon, items]) => {
  const enAll = items.map(x => x.split("|")[1]);
  const tlAll = items.map(x => x.split("|")[0]);

  for (let g = 0; g < items.length; g += 3) {
    const group = items.slice(g, g + 3).map(x => {
      const [tl, en] = x.split("|");
      return { tl, en };
    });

    const exercises = group.map((item, j) => {
      const spin = (g + j) % 4;

      if (j === 0) {
        const opts = rotate([item.en, ...enAll.filter(e => e !== item.en).slice(0, 3)], spin);
        return ["c", `What does “${item.tl}” mean?`, opts, opts.indexOf(item.en)];
      }

      if (j === 1) {
        return ["t", `Translate: ${item.en}`, item.tl];
      }

      const opts = rotate([item.tl, ...tlAll.filter(t => t !== item.tl).slice(0, 3)], spin);
      return ["c", `Choose the Tagalog for “${item.en}”`, opts, opts.indexOf(item.tl)];
    });

    const unit = Math.floor((lessonId - 1) / 10);
    LESSONS.push({
      id: lessonId++,
      title: group.map(x => x.tl).join(" • "),
      icon,
      unit,
      exercises: exercises.map(ex => ex[0] === "c"
        ? { type: "choice", prompt: ex[1], options: ex[2], answer: ex[3] }
        : { type: "translate", prompt: ex[1], answers: ex.slice(2) })
    });
  }
});
