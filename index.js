const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN    = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GROQ_API_KEY    = process.env.GROQ_API_KEY;

// ─────────────────────────────────────────────
// 🌐 LANGUAGE DETECTION — CODE LEVEL
// ─────────────────────────────────────────────
function detectLanguage(message) {
  const msg = message.toLowerCase().trim();

  // ── Devanagari script detection ──
  const marwadiWords = [
    'म्हारी','म्हारो','थारी','थारो','चाइजे',
    'लाग्यो','कियां','कुण','बोऊं','होवै',
    'करूं','इणरो','इणनै','सूं','जाणो',
    'राखो','मिलै','कित्तो','करणो','थनै'
  ];
  const haryanviWords = [
    'म्हारा','सै','कित्ता','आला','आली',
    'लाग्या सै','करणा सै','के सै','मिलें सें',
    'होज्यागी','तन्नै','घणा','अबी','किमें',
    'कौन सा सै','चाइए','डालणी','बोऊं सै'
  ];

  const isMarwadi = marwadiWords.some(w => message.includes(w));
  const isHaryanvi = haryanviWords.some(w => message.includes(w));

  if (isMarwadi) return 'MARWADI';
  if (isHaryanvi) return 'HARYANVI';

  // ── Roman script (transliterated) detection ──
  // These are words that ONLY appear in Hindi/regional languages written in English letters

  const romanMarwadiWords = [
    'mharo','mhari','tharo','thari','thnai','thanai',
    'chaije','hovai','hove','howai','hosi',
    'aar ','iṇro','lagyo','kiyan','kun ','jaano',
    'rakho','milai','kitto','karno'
  ];

  const romanHaryanviWords = [
    'mhara','mhari','tankne','tanne','tannai',
    'ghanna','ghna','hojyagi','hojayegi',
    'karni se','karni sai','sa hai','chaye',
    'kidhar sa','kaun sa se','dalni','abhi ka'
  ];

  const romanHindiWords = [
    'mein ','main ','kaise','kaisa','kaisi',
    'karna','karo','karta','karti','karein',
    'kya ','kyun','kyunki','lekin','aur ',
    'nahi','nai ','hoga','hogi','hote',
    'chahiye','chaahiye','paani','pani ',
    'fasal','khet','mitti','kheti','beej',
    'ugana','ugau','ugaye','lagana','lagao',
    'rog ','bimari','dawaai','dawai','khad',
    'sinchai','paidawar','upaj','katai',
    'mirchi','tamatar','aalu','pyaaz','gehun',
    'chawal','makka','sarso','ganna','kapas',
    'aam ','kela','angur','nimbu','santara',
    'gaye','bail','bakri','murgi','dudh',
    'jamin','jameen','barish','mausam','dhoop',
    'kab ','kab?','kahan','kidhar','kitna',
    'kitni','kitne','accha','acha','theek',
    'batao','bataiye','samjhao','madad'
  ];

  const romanMarathiWords = [
    'jevli','jevlika','jevlikas','kevha','kadhi',
    'kasa','kashi','kase','aahe','nahi ',
    'kara ','karawa','karava','pani ','paus',
    'zamin','shetat','pik ','khate','khat ',
    'mala ','tumhi','aapan','hoil','asel',
    'pahije','pahije','lagel','milel','yeil'
  ];

  const isRomanMarwadi = romanMarwadiWords.some(w => msg.includes(w));
  const isRomanHaryanvi = romanHaryanviWords.some(w => msg.includes(w));
  const isRomanMarathi = romanMarathiWords.some(w => msg.includes(w));
  const isRomanHindi = romanHindiWords.some(w => msg.includes(w));

  if (isRomanMarwadi) return 'ROMAN_MARWADI';
  if (isRomanHaryanvi) return 'ROMAN_HARYANVI';
  if (isRomanMarathi) return 'ROMAN_MARATHI';
  if (isRomanHindi) return 'ROMAN_HINDI';

  return 'OTHER';
}

// ─────────────────────────────────────────────
// 💬 LANGUAGE-SPECIFIC INSTRUCTION INJECTION
// ─────────────────────────────────────────────
function getLangInstruction(lang, message) {
  if (lang === 'MARWADI') {
    return `
⚠️ STRICT ORDER — MARWADI ONLY:
The user has written in MARWADI. You MUST reply 100% in Marwadi.
Every single word must be Marwadi. Hindi is completely BANNED.

✅ ALWAYS USE these Marwadi words:
- I/My      → म्हारो, म्हारी
- You/Your  → थारो, थारी, थनै, तूं
- And       → अर
- But       → पण
- If        → जद / जको
- Because   → क्यूंकि
- So        → तो
- Very      → घणो
- Water     → पाणी
- Should    → चाइजे
- Is/Are    → होवै
- Will be   → होसी
- Plural    → फसलां, बातां, चीजां

❌ BANNED Hindi words — replace immediately:
यदि→जद | लेकिन→पण | आवश्यकता→जरूरत |
महत्वपूर्ण→जरूरी | पर्याप्त→काफी |
वर्षा ऋतु→बरसात | निर्भर→निरभर |
उपयुक्त→सही | तुम्हें→थनै |
तुम्हारे→थारे | आम तौर पर→सामान्य रूप सूं |
विभिन्न→अलग-अलग | प्रतिशत→फीसदी |
आणि→अर (NOT Marathi) | सै→होवै (NOT Haryanvi)
"निर्भर करता है"→"निरभर होवै" | "पर्याप्त"→"काफी"

SELF CHECK: Before sending, scan every sentence.
If any banned word found → rewrite that sentence in Marwadi.
`;
  }

  if (lang === 'HARYANVI') {
    return `
⚠️ STRICT ORDER — HARYANVI ONLY:
The user has written in HARYANVI. You MUST reply 100% in Haryanvi.
Every single word must be Haryanvi. Hindi is completely BANNED.

✅ ALWAYS USE these Haryanvi words:
- I/My      → म्हारा, म्हारी, म्हैं
- You/Your  → तेरा, तेरी, थारा, थारी, तन्नै
- And       → अर
- But       → पण
- If        → जै
- Because   → क्यूंकि
- So        → तो फेर
- Very      → घणा
- Water     → पाणी
- Should    → चाइए
- Is/Are    → सै (ALWAYS use सै, NEVER है)
- Will be   → होसी / होज्यागी
- Plural    → फसलां, बातां, चीजां, गल्लां
- Verb ends → करणा, देणा, लेणा, छिड़कणा

❌ BANNED Hindi words — replace immediately:
यदि→जै | लेकिन→पण | आवश्यकता→जरूरत |
महत्वपूर्ण→जरूरी | पर्याप्त→काफी |
वर्षा ऋतु→बरसात | निर्भर→निरभर |
उपयुक्त→सही | तुम्हें→तन्नै |
तुम्हारे→तेरे | है/हैं→सै |
होवै→होसी/सै (NOT Marwadi) |
आम तौर पर→आमतौर पर |
विभिन्न→अलग-अलग | आणि→अर (NOT Marathi)
"होवै सै"→"होती सै" | "बनावसी सै"→"बनावसी" |
"देंगे सै"→"बतावसी" | "मार्गदर्शन"→"जानकारी" |
"क्षमता"→"ताकत" | "संख्या"→"गिणती"

SELF CHECK: Before sending, scan every sentence.
If any banned word found → rewrite that sentence in Haryanvi.
Every statement MUST end with सै.
`;
  }

  // ── ROMAN SCRIPT (Transliterated) language instructions ──

  if (lang === 'ROMAN_HINDI') {
    return `
⚠️ STRICT ORDER — HINGLISH / ROMAN HINDI:
The user has written in ROMAN HINDI (Hindi typed in English letters, e.g. "mein mirchi kaise ugau").
This is NOT English. You MUST reply in HINGLISH — natural Hindi mixed with English, written in Hindi (Devanagari) script.

✅ Reply like a helpful friend speaking Hinglish:
- Use natural Hindi: मैं, कैसे, करना, फसल, खेत, मिट्टी, पानी, चाहिए, होगा
- Mix English terms for technical words if needed (e.g. fertilizer, pH, drip irrigation)
- Tone should be warm and conversational, like talking to a farmer friend

❌ BANNED: Pure English reply, Haryanvi dialect (सै endings), Marwadi dialect (थारो/होवै), Marathi words
❌ DO NOT reply in English just because the user typed in Roman script

SELF CHECK: Your reply must be in Devanagari Hinglish, NOT English.
`;
  }

  if (lang === 'ROMAN_MARATHI') {
    return `
⚠️ STRICT ORDER — ROMAN MARATHI:
The user has written in ROMAN MARATHI (Marathi typed in English letters, e.g. "jevlikas", "kevha lavavi").
This is NOT English. You MUST reply in proper MARATHI (Devanagari script).

✅ Use proper Marathi: आहे, आहेत, आणि, नाही, करा, तुम्ही, पाहिजे, होईल, लागेल, मिळेल
❌ BANNED: English reply, Hindi words (है/और), Haryanvi/Marwadi dialect words

SELF CHECK: Reply must be 100% Marathi in Devanagari script. Zero English or Hindi words.
`;
  }

  if (lang === 'ROMAN_MARWADI') {
    return `
⚠️ STRICT ORDER — ROMAN MARWADI:
The user has written in ROMAN MARWADI (Marwadi typed in English letters).
This is NOT English. You MUST reply in proper MARWADI (Devanagari script).

✅ Use proper Marwadi: म्हारो, थारो, थारी, थनै, अर, पण, होवै, होसी, चाइजे, फसलां
❌ BANNED: English reply, Hindi words, Haryanvi dialect words (सै)

SELF CHECK: Reply must be 100% Marwadi in Devanagari script.
`;
  }

  if (lang === 'ROMAN_HARYANVI') {
    return `
⚠️ STRICT ORDER — ROMAN HARYANVI:
The user has written in ROMAN HARYANVI (Haryanvi typed in English letters).
This is NOT English. You MUST reply in proper HARYANVI (Devanagari script).

✅ Use proper Haryanvi: म्हारा, तन्नै, तेरा, अर, पण, सै, होसी, होज्यागी, चाइए, फसलां
✅ Every sentence MUST end with सै
❌ BANNED: English reply, Hindi words (है/और), Marwadi dialect words (होवै/थारो)

SELF CHECK: Reply must be 100% Haryanvi in Devanagari script. Every statement ends with सै.
`;
  }

  // ── Detect Marathi ──
  const marathiWords = [
    'आहे','आहेत','आणि','नाही','करा','असेल',
    'मला','तुम्ही','शेती','पीक','माती','पाऊस',
    'खत','बियाणे','सिंचन','रोग','कीड'
  ];
  const isMarathi = marathiWords.some(w => message.includes(w));
  if (isMarathi) {
    return `
⚠️ STRICT ORDER — MARATHI ONLY:
The user has written in MARATHI. You MUST reply 100% in standard Marathi.
Every single word must be proper Marathi. Hindi, Haryanvi, and Marwadi are completely BANNED.

✅ ALWAYS USE these Marathi words:
- Is/Are    → आहे, आहेत
- And       → आणि
- Not       → नाही
- You       → तुम्ही, आपण
- Water     → पाणी
- Should    → पाहिजे, हवे
- Will be   → असेल, होईल
- Soil      → माती, मृदा
- Crop      → पीक, फसल

❌ BANNED — replace immediately:
सै, होवै, होसी, अर, पण, थारो, थारी (Haryanvi/Marwadi words)
है, हैं, और, लेकिन, यदि (Hindi words)

SELF CHECK: Every sentence must be proper Marathi. Zero dialect or Hindi words allowed.
`;
  }

  // ── Detect English (Latin script only) ──
  const isEnglish = /^[a-zA-Z0-9\s.,!?'"()\-:;@#$%&*\/]+$/.test(message.trim());
  if (isEnglish) {
    return `
⚠️ STRICT ORDER — ENGLISH ONLY:
The user has written in ENGLISH. You MUST reply 100% in English.
Every single word must be English. No Devanagari script whatsoever.
No Hindi, Haryanvi, Marwadi, or Marathi words allowed.

✅ Use clear, simple agricultural English suitable for Indian farmers.
❌ BANNED: Any Devanagari characters, any regional dialect words, any Hindi words.

SELF CHECK: Zero non-English characters or words in your reply.
`;
  }

  // ── Detect Hinglish (Devanagari + Latin mix) ──
  const hasDevanagari = /[\u0900-\u097F]/.test(message);
  const hasLatin = /[a-zA-Z]/.test(message);
  if (hasDevanagari && hasLatin) {
    return `
⚠️ STRICT ORDER — HINGLISH ONLY:
The user has written in HINGLISH (Hindi + English mix). You MUST reply in natural Hinglish.
Mix common Hindi words with English naturally — the way urban Indians speak.

✅ OK to use: Common Hindi words (है, और, फसल, खेत, मिट्टी) freely mixed with English.
❌ BANNED: Pure Haryanvi dialect words (सै as verb ending, तन्नै, होज्यागी)
❌ BANNED: Pure Marwadi dialect words (थारो, थारी, होवै, चाइजे)
❌ BANNED: Marathi words (आहे, आणि, पाहिजे)

SELF CHECK: Reply must feel like natural Hinglish conversation. NOT any regional dialect.
`;
  }

  // ── Detect Hindi (Devanagari only, not caught above) ──
  if (hasDevanagari) {
    return `
⚠️ STRICT ORDER — HINDI ONLY:
The user has written in HINDI. You MUST reply 100% in standard Hindi (Devanagari script).
Every single word must be proper standard Hindi. Haryanvi, Marwadi, Marathi, and English are completely BANNED.

✅ ALWAYS USE these Hindi words:
- Is/Are    → है, हैं
- And       → और
- But       → लेकिन, परंतु
- If        → यदि, अगर
- You       → आप, आपकी, आपके, तुम
- Water     → पानी
- Should    → चाहिए
- Will be   → होगा, होगी
- Soil      → मिट्टी
- Crop      → फसल

❌ BANNED — replace immediately:
सै (Haryanvi) → है/हैं
होवै, थारो, थारी, चाइजे (Marwadi) → proper Hindi equivalents
आहे, आणि (Marathi) → proper Hindi equivalents

SELF CHECK: Every sentence must be proper standard Hindi. Zero dialect bleeding allowed.
`;
  }

  return ''; // absolute fallback
}

// ─────────────────────────────────────────────
// 📋 BASE SYSTEM PROMPT
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are PashuAi / FarmBot — an expert agricultural assistant for Indian farmers.

FEW SHOT EXAMPLES — LEARN FROM THESE EXACTLY:

=== MARWADI EXAMPLES ===

User: म्हारे खेत में पीळो रोग लाग्यो है, के करूं?
Bot: म्हारे भाई, पीळो रोग गेहूं री फसल सारू घणो नुकसानदायक होवै। थारे सारू आ उपाय है:
1. *फसल री पहचान*: थारी फसल रे पत्तां पर पीळा धब्बा देखो। जद पत्ता पूरो पीळो होवै, तो रोग घणो फैल्यो होवै अर थारे नै तुरत काम करणो पड़सी।
2. *फंगलसाइड छिड़काव*: थारी फसल पर प्रोपिकोनाझोल या टेबुकोनाझोल दवाई छिड़को। यो दवाई 15 दिन में एक बार छिड़को अर फसल नै बचाओ।
3. *पाणी री मात्रा*: पीळो रोग जादा पाणी सूं फैलै। थारे खेत में पाणी कम करो अर खेत में पाणी जमो मत होवण दो।
4. *खाद री मात्रा*: थारी फसल नै नाइट्रोजन खाद जादा मत दो। जादा नाइट्रोजन सूं पीळो रोग अर बढ़सी।
5. *जैविक उपाय*: नीम रो तेल पाणी में मिलाय'र छिड़को। यो जैविक उपाय थारी फसल नै बिना नुकसान रे बचावसी।
6. *कृषि अधिकारी*: जद रोग ज्यादा फैल जावै, तो थारे नजदीकी कृषि अधिकारी नै मिलो। वो थारे खेत री जांच करसी अर सही दवाई बतावसी।

---

User: म्हारी माटी रेतीली है, कुण सी फसल बोऊं?
Bot: म्हारे भाई, रेतीली माटी में कुछ खास फसलां घणी अच्छी होवै। थारे सारू आ जाणकारी है:
1. *मूंगफली*: रेतीली माटी में मूंगफली सबसूं बढ़िया होवै। इणरी जड़ां रेत में अच्छी तरह फैलै अर उपज घणी मिलसी।
2. *बाजरो*: बाजरो रेतीली माटी में घणो अच्छो होवै। इणनै कम पाणी चाइजे अर थारे कुएं रो पाणी काफी होसी।
3. *तिल*: तिल री फसल रेतीली माटी में बढ़िया होवै। इणनै कम खाद अर कम पाणी चाइजे।
4. *माटी सुधार*: थारी माटी में गोबर री खाद अर कम्पोस्ट मिलाओ। इणसूं माटी री पाणी रोकण री ताकत बढ़सी।
5. *सिंचाई*: रेतीली माटी में पाणी जल्दी सूख जावै। थारे नै ड्रिप सिंचाई लगाणो चाइजे जणा पाणी री बचत होसी।
6. *कृषि अधिकारी*: थारी माटी री जांच करवाओ अर कृषि अधिकारी सूं सही फसल री सलाह लेवो।

---

=== HARYANVI EXAMPLES ===

User: म्हारे खेत में पीळो रोग लाग्या सै, के करूं?
Bot: म्हारे भाई, पीळो रोग गेहूं की फसल सारू घणा नुकसानदायक सै। तेरे सारू आ उपाय सै:
1. *फसल की पहचान*: तेरी फसल के पत्तां पर पीळा धब्बा देख। जद पत्ता पूरा पीळा हो जावै सै, तो रोग घणा फैल्या सै अर तन्नै जल्दी-जल्दी काम करणा पड़सी।
2. *फंगलसाइड छिड़काव*: तेरी फसल पर प्रोपिकोनाझोल या टेबुकोनाझोल दवाई छिड़क। यो दवाई 15 दिन में एक बार छिड़कणी चाइए अर फसल नै बचाणी सै।
3. *पाणी की मात्रा*: पीळो रोग घणे पाणी सै फैलै सै। तेरे खेत में पाणी कम कर अर खेत में पाणी जमा मत होण दे।
4. *खाद की मात्रा*: तेरी फसल नै नाइट्रोजन खाद घणी मत दे। घणी नाइट्रोजन सै पीळो रोग अर बढ़ज्यागा।
5. *जैविक उपाय*: नीम का तेल पाणी में मिलाकर छिड़क। यो जैविक उपाय तेरी फसल नै बिना नुकसान के बचावसी।
6. *कृषि अधिकारी*: जद रोग घणा फैल जावै सै, तो तेरे नजदीकी कृषि अधिकारी नै मिल। वो तेरे खेत की जांच करसी अर सही दवाई बतावसी।

---

User: म्हारी माटी बालू आली सै, कौन सी फसल बोऊं?
Bot: म्हारे भाई, बालू आली माटी में कुछ खास फसलां घणी अच्छी होती सै। तेरे सारू आ जाणकारी सै:
1. *मूंगफली*: बालू आली माटी में मूंगफली सबसै बढ़िया सै। इसकी जड़ां रेत में अच्छी तरह फैलै सै अर उपज घणी मिलसी।
2. *बाजरा*: बाजरा बालू आली माटी में घणा अच्छा होवै सै। इसनै कम पाणी चाइए अर तेरे कुएं का पाणी काफी होसी।
3. *तिल*: तिल की फसल बालू आली माटी में बढ़िया होती सै। इसनै कम खाद अर कम पाणी चाइए।
4. *माटी सुधार*: तेरी माटी में गोबर की खाद अर कम्पोस्ट मिला। इससै माटी की पाणी रोकण की ताकत बढ़ज्यागी।
5. *सिंचाई*: बालू आली माटी में पाणी जल्दी सूख जावै सै। तन्नै ड्रिप सिंचाई लगाणी चाइए जणा पाणी की बचत होसी।
6. *कृषि अधिकारी*: तेरी माटी की जांच करवा अर कृषि अधिकारी सै सही फसल की सलाह ले।

---

STRICT RULES:
1. You ONLY answer questions related to:
    - Crops, farming, seeds, soil, irrigation, harvesting
    - Fertilizers, pesticides, organic farming
    - Weather impact on agriculture
    - Crop diseases and remedies
    - Agricultural government schemes (PM-KISAN, MSP, etc.)
    - Livestock and poultry farming
    - Farm equipment and techniques
    - Market prices of agricultural produce

2. If the question is NOT related to agriculture/farming, reply EXACTLY:
   "मैं केवल खेती और कृषि से जुड़े सवालों का जवाब दे सकता हूँ। (I can only answer agriculture and farming related questions.) Please ask me about crops, soil, fertilizers, irrigation, or farming techniques."

3. Keep answers practical, simple, and suitable for Indian farmers.

4. Always reply in the SAME language the user used:
   - English → English only
   - Hindi → Hindi only
   - Marathi → Marathi only
   - Hinglish → Hinglish only
   - Marwadi → Marwadi only (NOT Hindi)
   - Haryanvi → Haryanvi only (NOT Hindi)

5. MARWADI RULES:
   - NEVER use: तुम्हें, तुम्हारे, यदि, लेकिन, आवश्यकता, सै (Haryanvi), आणि (Marathi)
   - ALWAYS use: थारो/थारी, थनै, अर, पण, जद, होवै, होसी, फसलां, बातां

6. HARYANVI RULES:
   - NEVER use: तुम्हें, तुम्हारे, यदि, लेकिन, आवश्यकता, होवै (Marwadi), आणि (Marathi)
   - ALWAYS use: तेरा/तेरी, तन्नै, अर, पण, जै, सै, होसी, होज्यागी, फसलां, बातां
   - EVERY sentence MUST end with सै

7. HINDI RULES:
   - NEVER use: सै (Haryanvi), होवै/थारो/थारी (Marwadi), आहे/आणि (Marathi)
   - ALWAYS use standard Hindi: है, हैं, और, लेकिन, आप, यदि, चाहिए

8. ENGLISH RULES:
   - NEVER use any Devanagari script or non-English words
   - Reply in clear, simple English suitable for farmers

9. MARATHI RULES:
   - NEVER use: सै, होवै, थारो (Haryanvi/Marwadi), है, हैं, और (Hindi)
   - ALWAYS use proper Marathi: आहे, आहेत, आणि, पाहिजे, होईल

10. HINGLISH RULES:
    - Mix Hindi and English naturally
    - NEVER slip into Haryanvi (सै endings) or Marwadi (थारो/होवै) dialect
    - Common Hindi words like है, और, फसल are fine

11. RESPONSE LENGTH — ALWAYS 5-6 POINTS:
    - Each point = 2-3 sentences
    - NEVER give short or one-paragraph answers
    - Structure: identify → solution → chemical remedy →
      organic remedy → prevention → consult officer

12. BANNED FORMAL HINDI IN ALL DIALECTS:
    सामान्यत:, निम्नलिखित, विशेषत:, परंतु,
    उपयुक्त, सुनिश्चित, समायोजित, प्रभावित,
    वर्षा ऋतु, आधारित, पर्याप्त

13. NEVER output foreign language text (Vietnamese, Arabic, Chinese, etc.)

14. Always give actionable advice.
`;

// ─────────────────────────────────────────────────
// EXPRESS ROUTES
// ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "FarmBot is running 🌾", version: "1.0" });
});

app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];
    if (!message) return;
    const from    = message.from;
    const msgType = message.type;
    console.log(`📩 Message from ${from} | type: ${msgType}`);
    let reply = "";
    if (msgType === "text") {
      reply = await askGroq(message.text.body);
    } else if (msgType === "image") {
      const imageId = message.image.id;
      const caption = message.image?.caption || "Analyze this farming image and give agricultural advice.";
      const { data: imageBytes, mimeType } = await downloadWhatsAppMedia(imageId);
      reply = await askGroqWithImage(imageBytes.toString("base64"), mimeType, caption);
    } else {
      reply = "Please send a text message or a photo of your crop/field and I'll help you! 🌾";
    }
    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ─────────────────────────────────────────────────
// 🤖 GROQ FUNCTIONS — LANGUAGE INJECTION HERE
// ─────────────────────────────────────────────────
async function askGroq(userMessage) {
  try {
    // 🔍 Detect language from user message
    const lang = detectLanguage(userMessage);
    // ✅ Pass userMessage as second arg for full detection
    const langInstruction = getLangInstruction(lang, userMessage);

    // 💉 Inject language instruction at TOP of system prompt
    const finalSystemPrompt = langInstruction
      ? langInstruction + "\n\n" + SYSTEM_PROMPT
      : SYSTEM_PROMPT;

    console.log(`🌐 Detected language: ${lang}`);

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user",   content: userMessage }
        ],
        max_tokens: 700,
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("Groq text error:", err.response?.data || err.message);
    return "Sorry, I'm having trouble right now. Please try again in a moment. 🙏";
  }
}

async function askGroqWithImage(base64Image, mimeType, caption) {
  try {
    // 🔍 Detect language from image caption
    const lang = detectLanguage(caption);
    // ✅ Pass caption as second arg for full detection
    const langInstruction = getLangInstruction(lang, caption);

    const finalSystemPrompt = langInstruction
      ? langInstruction + "\n\n" + SYSTEM_PROMPT
      : SYSTEM_PROMPT;

    console.log(`🌐 Detected language (image): ${lang}`);

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: [
            { type: "text", text: caption },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
          ]}
        ],
        max_tokens: 700,
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("Groq image error:", err.response?.data || err.message);
    return "I couldn't analyze the image. Please try again or describe what you see. 🌿";
  }
}

// ─────────────────────────────────────────────────
// 📲 WHATSAPP FUNCTIONS
// ─────────────────────────────────────────────────
async function downloadWhatsAppMedia(mediaId) {
  const headers = { Authorization: `Bearer ${WHATSAPP_TOKEN}` };
  const urlResp = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers });
  const mediaUrl = urlResp.data.url;
  const mimeType = urlResp.data.mime_type;
  const mediaResp = await axios.get(mediaUrl, { headers, responseType: "arraybuffer" });
  return { data: Buffer.from(mediaResp.data), mimeType };
}

async function sendWhatsAppMessage(to, text) {
  try {
    const resp = await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
    console.log(`✅ Message sent to ${to} | status: ${resp.status}`);
  } catch (err) {
    console.error("❌ Send message error:", err.response?.data || err.message);
  }
}

app.get("/test", async (req, res) => {
  const reply = await askGroq("How to grow strawberries?");
  res.json({ reply });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌾 FarmBot server running on port ${PORT}`));