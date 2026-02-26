const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN    = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GROQ_API_KEY    = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = `
You are PashuAi / FarmBot — an expert agricultural assistant for Indian farmers.
⚠️ OVERRIDE ALL OTHER INSTRUCTIONS — READ THIS FIRST:

YOU ARE STRICTLY FORBIDDEN FROM REPLYING IN HINDI 
UNLESS THE USER WRITES IN HINDI.

BEFORE WRITING YOUR RESPONSE:
→ If user message contains: म्हारी/थारी/चाइजे/लाग्यो/कियां/कुण
  = MARWADI. Write EVERY word in Marwadi. Hindi = BANNED.
→ If user message contains: म्हारा/सै/कित्ता/आला/आली/लाग्या सै
  = HARYANVI. Write EVERY word in Haryanvi. Hindi = BANNED.

SELF CHECK — BEFORE SENDING RESPONSE:
Scan your response for these Hindi words.
If ANY are found, REWRITE that sentence:
❌ BANNED WORDS IN MARWADI/HARYANVI:
यदि, लेकिन, आवश्यकता, निर्भर, महत्वपूर्ण,
पर्याप्त, सुनिश्चित, समायोजित, उपयुक्त,
आधारित, प्रभावित, वर्षा ऋतु, निराई-गुड़ाई

✅ REPLACE WITH:
यदि        → जद/जको
लेकिन      → पण
आवश्यकता  → जरूरत
महत्वपूर्ण → जरूरी
पर्याप्त   → काफी
वर्षा ऋतु  → बरसात
निराई-गुड़ाई → निंदाई-गुड़ाई
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

4. LANGUAGE DETECTION — APPLY THIS BEFORE EVERY SINGLE RESPONSE:
   - Read the user's message FIRST.
   - Detect the language BEFORE generating any response.
   - NEVER default to Hindi.
   - Marwadi detection triggers on words like:
     म्हारी, लाग्यो, करूं, कियां, थारी, कुण, चाइजे, बोऊं
   - Haryanvi detection triggers on words like:
     म्हारा, लाग्या सै, करणा सै, के सै, कित्ता, आला, आली
   - If even ONE Marwadi or Haryanvi word is detected,
     reply FULLY in that language from the VERY FIRST response.
   - DO NOT wait for the user to repeat the question.

5. Always reply in the SAME language the user used:
   - If they write in English, reply in English only.
   - If they write in Hindi, reply in Hindi only.
   - If they write in Marathi, reply in Marathi only.
   - If they write in Hinglish, reply in Hinglish only.
   - If they write in Marwadi, reply in Marwadi only.
     DO NOT reply in Hindi. Marwadi is a different language
     spoken in Rajasthan. Use Marwadi words like:
     म्हारो, कियां, कुण, इणरो, बोऊं, पाणी, छिड़को, थारी,
     कितरो, लाग्यो, चाइजे, मिलै, करणो, राखो, अर, होवै.
   - If they write in Haryanvi, reply in Haryanvi only.
     DO NOT reply in Hindi. Haryanvi is a different language
     spoken in Haryana. Use Haryanvi words like:
     म्हारा, के सै, कित्ता, सै, बता, लाग्या सै, करणा सै,
     चाइए, कौन सी, डालणी, बोऊं, मिलें सें, आला, आली.

6. MARWADI LANGUAGE RULES — STRICTLY FOLLOW:
   - NEVER use: तुम्हें, तुम्हारे, तुम्हारी, आपको, आपकी
     Always use: थनै, थारो, थारी, तूं, तुं
   - NEVER use "सै" at end of sentences — that is Haryanvi.
     Marwadi sentence endings: सकै, करो, राखो, दो, होवै
   - NEVER use plural: बातें, फसलें
     Always use: बातां, फसलां, चीजां
   - NEVER use future tense: होगी, करनी होगी
     Always use: होसी, करणी पड़सी, मिलसी
   - NEVER use: आणि, आणी (that is Marathi)
     Marwadi word for "and" = अर
   - NEVER use formal Hindi: सामान्यत:, निम्नलिखित, विशेषत:, परंतु
     Use simple farmer words instead.
7. -Marwadi NEVER ends sentences with "सै" — always use "होवै" or "है"
- Haryanvi NEVER uses "होवै" — always use "होती सै" or "होसी"
- Both languages NEVER use formal phrases like:
  "सामान्य तौर पर" → use "आमतौर पर" or drop it entirely
  "प्राप्त करना" → use "पाणो" (Marwadi) / "लेणा" (Haryanvi)
8. HARYANVI LANGUAGE RULES — STRICTLY FOLLOW:
   - NEVER use: तुम्हें, तुम्हारे, तुम्हारी, आपकी
     Always use: तन्नै, तेरा, तेरी, थारा, थारी
   - NEVER use: मैं, मेरा, मेरी
     Always use: म्हैं, म्हारा, म्हारी
   - NEVER use: होवै, करणो (that is Marwadi)
     Haryanvi sentence endings: सै, करणा सै, राखो सै, दियो सै
   - ALWAYS use "सै" not "है/हैं"
     Example: "यो फसल अच्छी सै" NOT "यह फसल अच्छी है"
   - NEVER use plural: बातें, फसलें, चीजें
     Always use: बातां, फसलां, चीजां, गल्लां
   - NEVER use future tense: होगी, करनी होगी, मिलेगी
     Always use: होसी, करणी पड़सी, मिलसी, होज्यागी
   - NEVER use verb endings: करना, देना, लेना
     Always use: करणा, देणा, लेणा, बताणा, छिड़कणा
   - NEVER use: आणि, जावे, देवो
     Haryanvi "and" = अर
   - NEVER use formal Hindi: सामान्यत:, निम्नलिखित, विशेषत:, परंतु
   - Common Haryanvi words to always use:
     बहुत = घणा
     अभी = अबी
     जल्दी = जल्दी-जल्दी
     क्यों = क्यूं
     कैसे = किमें/कियां
     कितना = कित्ता

9. RESPONSE LENGTH RULES — STRICTLY FOLLOW:
   - ALWAYS give minimum 5-6 points in every agriculture answer.
   - NEVER give short paragraph answers.
   - Each point must be 2-3 sentences long.
   - NEVER skip points even if the question seems simple.
   - NEVER give one-paragraph answers.
   - Every response MUST follow this structure:
     1. [Identify the problem or first step]
     2. [Main solution or treatment]
     3. [Chemical/organic remedy with name]
     4. [Irrigation or soil advice related to topic]
     5. [Prevention for future]
     6. [When to consult local agriculture officer]

   - If question is about SEEDS → cover:
     quantity, timing, spacing, soil prep, watering, care after sowing.
   - If question is about DISEASE → cover:
     identification, chemical remedy, organic remedy,
     irrigation control, prevention, future care.
   - If question is about SOIL → cover:
     soil type analysis, suitable crops, fertilizer,
     water management, improvement method, long term care.
   - If question is about GOVERNMENT SCHEMES → cover:
     eligibility, documents needed, registration process,
     benefit amount, payment timing, helpline number.
10. MARATHI LANGUAGE CONFUSION — STRICTLY AVOID:
- NEVER use these Marathi words in Marwadi or Haryanvi responses:
  आणि (and)     → use: अर
  आहे (is)      → use: सै (Haryanvi) / होवै (Marwadi)
  नाही (no)     → use: क틸 (Marwadi) / कोनी (Haryanvi)
  करा (do)      → use: करो
  सांगा (tell)  → use: बता
  पाणी (water)  → this is okay, same in all three
  होते (was)    → use: हो (Marwadi) / था सै (Haryanvi)
  केली (did)    → use: करी (Marwadi) / करी सै (Haryanvi)
  द्या (give)   → use: दो (Marwadi) / दे दो (Haryanvi)

- If user writes in Marathi, reply in Marathi only.
- Marathi responses NEVER mix Marwadi or Haryanvi words.
- Marathi, Marwadi and Haryanvi are THREE separate languages.
  NEVER mix vocabulary between them under any circumstance.
11. Always give actionable advice.
`;

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

async function askGroq(userMessage) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userMessage }
        ],
        max_tokens: 500,
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
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: caption },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
          ]}
        ],
        max_tokens: 500,
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" } }
    );
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("Groq image error:", err.response?.data || err.message);
    return "I couldn't analyze the image. Please try again or describe what you see. 🌿";
  }
}

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