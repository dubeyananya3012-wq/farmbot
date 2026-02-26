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
  return 'OTHER';
}

// ─────────────────────────────────────────────
// 💬 LANGUAGE-SPECIFIC INSTRUCTION INJECTION
// ─────────────────────────────────────────────
function getLangInstruction(lang) {
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

// Add to banned words in getLangInstruction():

MARWADI — also ban:
"निर्भर करता है" → "निरभर होवै"
"पर्याप्त"       → "काफी"

HARYANVI — also ban:
"होवै सै"  → "होती सै"  (never mix होवै+सै)
"बनावसी सै" → "बनावसी"  (no double ending)

// Add to HARYANVI banned list in getLangInstruction():

"होवै सै"        → "होती सै"
"देंगे सै"       → "बतावसी"
"मार्गदर्शन"     → "जानकारी"
"क्षमता"         → "ताकत"  (both languages)
"संख्या"         → "गिणती" (both languages)

SELF CHECK: Before sending, scan every sentence.
If any banned word found → rewrite that sentence in Haryanvi.
Every statement MUST end with सै.
`;
  }

  return ''; // Hindi, English, Marathi, Hinglish — no extra instruction needed
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

7. RESPONSE LENGTH — ALWAYS 5-6 POINTS:
   - Each point = 2-3 sentences
   - NEVER give short or one-paragraph answers
   - Structure: identify → solution → chemical remedy →
     organic remedy → prevention → consult officer

8. BANNED FORMAL HINDI IN ALL DIALECTS:
   सामान्यत:, निम्नलिखित, विशेषत:, परंतु,
   उपयुक्त, सुनिश्चित, समायोजित, प्रभावित,
   वर्षा ऋतु, आधारित, पर्याप्त

9. NEVER output foreign language text (Vietnamese, Arabic, Chinese, etc.)

10. Always give actionable advice.
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
    const langInstruction = getLangInstruction(lang);

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
    const langInstruction = getLangInstruction(lang);

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