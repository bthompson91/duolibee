// DUOLIBEE lesson data
// Exercise formats:
// ["c", prompt, [options], correctIndex]
// ["t", prompt, acceptedAnswers...]
const RAW = [
["Kumusta?","👋",[["c","What does “Kumusta ka?” mean?",["How are you?","Where are you?","Who are you?","What is that?"],0],["t","Translate: Good morning.","Magandang umaga"],["c","Choose the Tagalog for “Thank you.”",["Salamat","Paalam","Oo","Hindi"],0]]],
["Ako at Ikaw","🙋",[["c","What does “ako” mean?",["I / me","You","They","We"],0],["c","What does “ikaw” mean?",["You","I","He","She"],0],["t","Translate: I am fine.","Ayos lang ako","Okay lang ako"]]],
["Oo at Hindi","✅",[["c","What does “oo” mean?",["Yes","No","Maybe","Please"],0],["c","What does “hindi” mean?",["No / not","Yes","Thank you","Hello"],0],["t","Translate: No, thank you.","Hindi, salamat"]]],
["Magandang Araw","☀️",[["c","What does “Magandang hapon” mean?",["Good afternoon","Good night","Goodbye","See you"],0],["c","What does “Magandang gabi” mean?",["Good evening","Good morning","Good day","Good luck"],0],["t","Translate: Good day.","Magandang araw"]]],
["Paalam","👋",[["c","What does “Paalam” mean?",["Goodbye","Hello","Please","Sorry"],0],["c","What does “Ingat” mean?",["Take care","Hurry","Wait","Come here"],0],["t","Translate: See you later.","Kita tayo mamaya"]]],
["Mga Pronoun","👥",[["c","What does “tayo” mean?",["We including you","We excluding you","They","You all"],0],["c","What does “sila” mean?",["They","We","You","He"],0],["t","Translate: We are friends.","Magkaibigan tayo","Kaibigan tayo"]]],
["Ito at Iyon","👉",[["c","What does “ito” mean?",["This","That far away","Here","There"],0],["c","What does “iyon” mean?",["That","This","Now","Later"],0],["t","Translate: This is water.","Tubig ito","Ito ay tubig"]]],
["Anong Pangalan Mo?","🏷️",[["c","What does “Anong pangalan mo?” mean?",["What is your name?","Where do you live?","How old are you?","What is this?"],0],["t","Translate: My name is Brendan.","Ako si Brendan","Ang pangalan ko ay Brendan"]],["c","Choose the natural reply to “Anong pangalan mo?”",["Ako si Ana.","Oo, salamat.","Magandang gabi.","Wala akong pera."],0]]],
["Taga-saan Ka?","🌏",[["c","What does “Taga-saan ka?” mean?",["Where are you from?","Where are you going?","What do you do?","How are you?"],0],["t","Translate: I am from Australia.","Taga-Australia ako","Galing ako sa Australia"]],["c","What does “Pilipino” mean?",["Filipino","Spanish","English","Japanese"],0]]],
["Po at Opo","🙏",[["c","Why do speakers use “po” and “opo”?",["To show respect","To ask a question","To say goodbye","To count"]],["c","Which is the respectful form of “yes”?",["Opo","Oo","Hindi","Sige"],0],["t","Translate: Thank you very much.","Maraming salamat"]]],
["Pamilya","👨‍👩‍👧",[["c","What does “pamilya” mean?",["Family","Friend","School","Market"],0],["c","What does “ina” or “nanay” mean?",["Mother","Father","Sister","Child"],0],["t","Translate: This is my family.","Ito ang pamilya ko"]]],
["Kapatid","👦👧",[["c","What does “kapatid” mean?",["Sibling","Parent","Cousin","Neighbour"],0],["c","What does “kuya” mean?",["Older brother","Younger brother","Older sister","Uncle"],0],["t","Translate: I have two siblings.","May dalawang kapatid ako"]]],
["Lolo at Lola","👴👵",[["c","What does “lolo” mean?",["Grandfather","Grandmother","Father","Uncle"],0],["c","What does “anak” mean?",["Child","Parent","Friend","Teacher"],0],["t","Translate: My grandmother is kind.","Mabait ang lola ko"]]],
["Asawa at Kaibigan","💞",[["c","What does “asawa” mean?",["Spouse","Friend","Child","Neighbour"],0],["c","What does “kaibigan” mean?",["Friend","Family","Worker","Student"],0],["t","Translate: She is my friend.","Kaibigan ko siya"]]],
["Bata at Matanda","🧒",[["c","What does “bata” mean?",["Child / young","Old","Tall","Strong"],0],["c","What does “matanda” mean?",["Old","Young","Small","New"],0],["t","Translate: The child is happy.","Masaya ang bata"]]],
["Gutom at Uhaw","🍽️",[["c","What does “gutom ako” mean?",["I am hungry","I am thirsty","I am tired","I am happy"],0],["c","What does “uhaw ako” mean?",["I am thirsty","I am hungry","I am sleepy","I am lost"],0],["t","Translate: Let’s eat.","Kain tayo","Kumain tayo"]]],
["Tubig at Kape","💧",[["c","What does “tubig” mean?",["Water","Milk","Coffee","Juice"],0],["c","What does “kape” mean?",["Coffee","Tea","Milk","Water"],0],["t","Translate: I want water.","Gusto ko ng tubig"]]],
["Kanin at Tinapay","🍚",[["c","What does “kanin” mean?",["Cooked rice","Bread","Egg","Meat"],0],["c","What does “tinapay” mean?",["Bread","Rice","Fruit","Fish"],0],["t","Translate: I eat rice.","Kumakain ako ng kanin"]]],
["Karne at Isda","🍗",[["c","What does “manok” mean?",["Chicken","Pork","Fish","Beef"],0],["c","What does “isda” mean?",["Fish","Chicken","Rice","Egg"],0],["t","Translate: I like fish.","Gusto ko ang isda"]]],
["Gulay at Prutas","🥦",[["c","What does “gulay” mean?",["Vegetables","Fruit","Meat","Snacks"],0],["c","What does “saging” mean?",["Banana","Apple","Mango","Orange"],0],["t","Translate: The fruit is sweet.","Matamis ang prutas"]]],
["Masarap!","😋",[["c","What does “masarap” mean?",["Delicious","Expensive","Cold","Spicy"],0],["c","What does “hindi masarap” mean?",["Not delicious","Very delicious","Too sweet","Already eaten"],0],["t","Translate: The food is delicious.","Masarap ang pagkain"]]],
["Isa, Dalawa, Tatlo","1️⃣",[["c","What does “dalawa” mean?",["Two","One","Three","Four"],0],["c","What does “tatlo” mean?",["Three","Two","Five","Ten"],0],["t","Translate: I have one brother.","May isang kapatid akong lalaki"]]],
["Apat, Lima, Anim","4️⃣",[["c","What does “lima” mean?",["Five","Four","Six","Seven"],0],["c","What does “anim” mean?",["Six","Five","Nine","Eight"],0],["t","Translate: Four friends.","Apat na kaibigan"]]],
["Pito, Walo, Siyam","7️⃣",[["c","What does “walo” mean?",["Eight","Seven","Nine","Ten"],0],["c","What does “siyam” mean?",["Nine","Eight","Six","Ten"],0],["t","Translate: Seven days.","Pitong araw"]]],
["Sampu","🔟",[["c","What does “sampu” mean?",["Ten","One hundred","Zero","Twenty"],0],["c","What does “labing-isa” mean?",["Eleven","Twelve","Twenty","Nine"],0],["t","Translate: I have ten pesos.","May sampung piso ako"]]],
["Oras at Araw","🕒",[["c","What does “ngayon” mean?",["Now","Later","Yesterday","Tomorrow"],0],["c","What does “bukas” mean?",["Tomorrow","Today","Yesterday","Tonight"],0],["t","Translate: See you tomorrow.","Kita tayo bukas"]]],
["Bahay at Eskwelahan","🏠",[["c","What does “bahay” mean?",["House","School","Work","Street"],0],["c","What does “eskwelahan” mean?",["School","Hospital","Store","Office"],0],["t","Translate: I am at home.","Nasa bahay ako"]]],
["Tindahan at Palengke","🛒",[["c","What does “tindahan” mean?",["Store","Market","Church","Hospital"],0],["c","What does “palengke” mean?",["Public market","School","Bank","Hotel"],0],["t","Translate: I am going to the store.","Pupunta ako sa tindahan"]]],
["Ospital at Botika","🏥",[["c","What does “ospital” mean?",["Hospital","Pharmacy","Clinic","School"],0],["c","What does “botika” mean?",["Pharmacy","Hospital","Market","Bank"],0],["t","Translate: I need a pharmacy.","Kailangan ko ng botika"]]],
["Kaliwa at Kanan","↔️",[["c","What does “kaliwa” mean?",["Left","Right","Straight","Back"],0],["c","What does “kanan” mean?",["Right","Left","Forward","Near"],0],["t","Translate: Turn right.","Kumanan ka","Lumiko sa kanan"]]],
["Saan?","📍",[["c","What does “Saan ka pupunta?” mean?",["Where are you going?","Where are you from?","What are you doing?","When will you leave?"],0],["c","What does “malayo” mean?",["Far","Near","Fast","Cheap"],0],["t","Translate: It is near.","Malapit lang","Malapit"]]],
["Gising at Tulog","😴",[["c","What does “gising” mean?",["Awake / wake up","Sleeping","Tired","Hungry"],0],["c","What does “tulog” mean?",["Sleep","Eat","Work","Walk"],0],["t","Translate: I am sleepy.","Inaantok ako"]]],
["Ligo at Bihis","🚿",[["c","What does “maligo” mean?",["To shower / bathe","To dress","To sleep","To eat"],0],["c","What does “bumihis” mean?",["To get dressed","To wake up","To wash","To rest"],0],["t","Translate: I will take a shower.","Maliligo ako"]]],
["Agahan at Hapunan","🍳",[["c","What does “agahan” mean?",["Breakfast","Lunch","Dinner","Snack"],0],["c","What does “hapunan” mean?",["Dinner","Breakfast","Lunch","Dessert"],0],["t","Translate: What is for lunch?",["Anong meron sa tanghalian?","Ano ang tanghalian?","Anong ulam natin?","Ano ang hapunan?"][0]]]],
["Trabaho","💼",[["c","What does “trabaho” mean?",["Work / job","School","House","Money"],0],["c","What does “nagtatrabaho ako” mean?",["I am working","I am sleeping","I am eating","I am leaving"],0],["t","Translate: I have work today.","May trabaho ako ngayon"]]],
["Umaga at Gabi","🌅",[["c","What does “umaga” mean?",["Morning","Night","Afternoon","Midday"],0],["c","What does “gabi” mean?",["Night / evening","Morning","Noon","Day"],0],["t","Translate: Good night.","Magandang gabi"]]],
["Mainit at Malamig","🌡️",[["c","What does “mainit” mean?",["Hot","Cold","Wet","Windy"],0],["c","What does “malamig” mean?",["Cold","Hot","Dry","Sunny"],0],["t","Translate: The weather is hot.","Mainit ang panahon"]]],
["Ulan at Araw","🌧️",[["c","What does “ulan” mean?",["Rain","Sun","Wind","Cloud"],0],["c","What does “araw” mean?",["Sun / day","Rain","Moon","Star"],0],["t","Translate: It is raining.","Umuulan"]]],
["Bagyo","⛈️",[["c","What does “bagyo” mean?",["Storm / typhoon","Rainbow","Breeze","Fog"],0],["c","What does “kulog” mean?",["Thunder","Lightning","Wind","Rain"],0],["t","Translate: There is a storm.","May bagyo"]]],
["Langit at Bituin","🌌",[["c","What does “langit” mean?",["Sky","Earth","Sea","Moon"],0],["c","What does “bituin” mean?",["Star","Moon","Sun","Cloud"],0],["t","Translate: The moon is bright.","Maliwanag ang buwan"]]],
["Dagat at Bundok","🏖️",[["c","What does “dagat” mean?",["Sea","Mountain","River","Forest"],0],["c","What does “bundok” mean?",["Mountain","Beach","Lake","Island"],0],["t","Translate: The beach is beautiful.","Maganda ang beach","Maganda ang dalampasigan"]]],
["Magkano?","💰",[["c","What does “Magkano ito?” mean?",["How much is this?","What is this?","Where is this?","Who bought this?"],0],["c","What does “pera” mean?",["Money","Food","Clothes","Time"],0],["t","Translate: How much is the rice?",["Magkano ang kanin?","Magkano ang tubig?","Magkano ang sapatos?","Magkano ang bahay?"][0]]]],
["Mura at Mahal","🏷️",[["c","What does “mura” mean?",["Cheap","Expensive","New","Broken"],0],["c","What does “mahal” mean?",["Expensive / dear","Cheap","Free","Small"],0],["t","Translate: It is too expensive.","Masyadong mahal"]]],
["Bumili","🛍️",[["c","What does “bumili” mean?",["To buy","To sell","To pay","To bring"],0],["c","What does “bayad” mean?",["Payment","Change","Discount","Receipt"],0],["t","Translate: I want to buy water.","Gusto kong bumili ng tubig"]]],
["Damit at Sapatos","👟",[["c","What does “damit” mean?",["Clothes","Shoes","Bag","Hat"],0],["c","What does “sapatos” mean?",["Shoes","Shirt","Pants","Socks"],0],["t","Translate: I like these shoes.","Gusto ko ang sapatos na ito"]]],
["Asin at Asukal","🧂",[["c","What does “asin” mean?",["Salt","Sugar","Oil","Pepper"],0],["c","What does “asukal” mean?",["Sugar","Salt","Rice","Vinegar"],0],["t","Translate: No sugar, please.","Walang asukal, please","Huwag lagyan ng asukal"]]],
["Masaya at Malungkot","😊",[["c","What does “masaya” mean?",["Happy","Sad","Angry","Tired"],0],["c","What does “malungkot” mean?",["Sad","Happy","Excited","Calm"],0],["t","Translate: I am happy today.","Masaya ako ngayon"]]],
["Takot at Galit","😠",[["c","What does “takot” mean?",["Afraid","Angry","Happy","Sleepy"],0],["c","What does “galit” mean?",["Angry","Afraid","Tired","Hungry"],0],["t","Translate: Don’t be afraid.","Huwag kang matakot"]]],
["Sakit at Doktor","🤒",[["c","What does “sakit” mean?",["Sickness / pain","Health","Medicine","Rest"],0],["c","What does “doktor” mean?",["Doctor","Nurse","Teacher","Driver"],0],["t","Translate: I am sick.","May sakit ako"]]],
["Pagod at Inaantok","🥱",[["c","What does “pagod ako” mean?",["I am tired","I am hungry","I am lost","I am ready"],0],["c","What does “inaantok ako” mean?",["I am sleepy","I am thirsty","I am cold","I am late"],0],["t","Translate: I need rest.","Kailangan ko ng pahinga"]]],
["Mahal Kita","❤️",[["c","What does “Mahal kita” mean?",["I love you","I miss you","I need you","I see you"],0],["c","What does “maganda” mean?",["Beautiful","Handsome","Strong","Smart"],0],["t","Translate: I like you.","Gusto kita"]]],
["Biyahe","✈️",[["c","What does “biyahe” mean?",["Trip / journey","Ticket","Hotel","Luggage"],0],["c","What does “eroplano” mean?",["Airplane","Bus","Train","Boat"],0],["t","Translate: Have a safe trip.","Ingat sa biyahe"]]],
["Bus at Tren","🚌",[["c","What does “tren” mean?",["Train","Bus","Jeepney","Taxi"],0],["c","What does “pasahero” mean?",["Passenger","Driver","Ticket","Station"],0],["t","Translate: Where is the bus?",["Nasaan ang bus?","Saan ang tren?","Magkano ang bus?","Kailan ang bus?"][0]]]],
["Tiket at Istasyon","🎫",[["c","What does “tiket” mean?",["Ticket","Passport","Bag","Map"],0],["c","What does “istasyon” mean?",["Station","Airport","Hotel","Street"],0],["t","Translate: I need a ticket.","Kailangan ko ng tiket"]]],
["Hotel at Kuwarto","🏨",[["c","What does “kuwarto” mean?",["Room","Key","Bed","Bag"],0],["c","What does “susi” mean?",["Key","Door","Window","Bag"],0],["t","Translate: Where is my room?",["Nasaan ang kuwarto ko?","Nasaan ang susi ko?","Magkano ang kuwarto?","Saan ang hotel?"][0]]]],
["Pasaporte","🛂",[["c","What does “pasaporte” mean?",["Passport","Visa","Ticket","Luggage"],0],["c","What does “bakasyon” mean?",["Vacation","Work","Meeting","Class"],0],["t","Translate: I am on vacation.","Nasa bakasyon ako"]]],
["Marunong","🧠",[["c","What does “Marunong ako mag-Tagalog” mean?",["I know how to speak Tagalog","I want to learn Tagalog","I am teaching Tagalog","I forgot Tagalog"],0],["c","What does “hindi ko alam” mean?",["I don’t know","I know","I remember","I understand"],0],["t","Translate: I am learning Tagalog.","Nag-aaral ako ng Tagalog"]]],
["Tulong!","🆘",[["c","What does “Tulong!” mean?",["Help!","Stop!","Wait!","Look!"],0],["c","What does “Pwede ba?” mean?",["Is it okay / possible?","Is it expensive?","Is it far?","Is it ready?"],0],["t","Translate: Please help me.","Tulungan mo ako","Pakisuyo, tulungan mo ako"]]],
["Maintindihan","💬",[["c","What does “Hindi ko maintindihan” mean?",["I don’t understand","I don’t remember","I don’t agree","I don’t care"],0],["c","What does “Muli” mean?",["Again","Never","Later","Always"],0],["t","Translate: Please say it again.","Pakiulit","Pakiulit nga"]]],
["Mabagal at Mabilis","🐢",[["c","What does “mabagal” mean?",["Slow","Fast","Loud","Quiet"],0],["c","What does “mabilis” mean?",["Fast","Slow","Heavy","Light"],0],["t","Translate: Please speak slowly.","Pakiusap, magsalita nang mabagal"]]],
["Walang Anuman","🤝",[["c","What does “Walang anuman” mean?",["You’re welcome","Excuse me","I’m sorry","Good luck"],0],["c","What does “Ingat ka” mean?",["Take care","Come back","Hurry up","Be quiet"],0],["t","Translate: Thank you very much!","Maraming salamat"]]]
];

const UNITS = [
  "Greetings & Basics","People & Pronouns","Family & Friends","Food & Drink","Numbers & Time",
  "Places & Directions","Daily Routine","Weather & Nature","Shopping & Money","Feelings & Health",
  "Travel & Transport","Everyday Conversation"
];

const LESSONS = RAW.map((row, i) => ({
  id: i + 1,
  title: row[0],
  icon: row[1],
  unit: Math.floor(i / 5),
  exercises: row[2].map(ex => ex[0] === "c"
    ? { type: "choice", prompt: ex[1], options: ex[2], answer: ex[3] }
    : { type: "translate", prompt: ex[1], answers: ex.slice(2) })
}));
