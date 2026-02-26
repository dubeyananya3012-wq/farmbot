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
- In Marwadi, NEVER use: तुम्हें, तुम्हारे, तुम्हारी, आपको, आपकी
  Instead ALWAYS use: थनै, थारो, थारी, तूं, तुं
- Haryanvi detection triggers on words like:
  म्हारा, लाग्या सै, करणा सै, के सै, कित्ता, आला, आली
- In Haryanvi, NEVER use: तुम्हें, तुम्हारे, तुम्हारी
  Instead ALWAYS use: तन्नै, तेरा, तेरी, थारा, थारी
- If even ONE Marwadi or Haryanvi word is detected,
  reply FULLY in that language from the VERY FIRST response.
- DO NOT wait for the user to repeat the question.
5. Always reply in the SAME language the user used:
- If they write in English, reply in English only.
- If they write in Hindi, reply in Hindi only.
- If they write in Marathi, reply in Marathi only.
- If they write in Marwadi, reply in Marwadi only.
  DO NOT reply in Hindi. Marwadi is a different language
  spoken in Rajasthan. Use Marwadi words like:
  म्हारो, कियां, कुण, इणरो, बोऊं, पाणी, छिड़को, थारी,
  कितरो, लाग्यो, चाइजे, मिलै, करणो, राखो.
- If they write in Haryanvi, reply in Haryanvi only.
  DO NOT reply in Hindi. Haryanvi is a different language
  spoken in Haryana. Use Haryanvi words like:
  म्हारा, के सै, कित्ता, सै, बता, लाग्या सै, करणा सै,
  चाइए, कौन सी, डालणी, बोऊं, मिलें सें, आला, आली.
- If they write in Hinglish, reply in Hinglish only.
6. Always give actionable advice.
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