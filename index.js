const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.json());

// ── Config ────────────────────────────────────────────────────────────────────
const VERIFY_TOKEN    = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ── Agriculture guardrail system prompt ──────────────────────────────────────
const SYSTEM_PROMPT = `
You are KrishiBot / FarmBot — an expert agricultural assistant for Indian farmers.

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

3. If an image is provided, analyze it for:
   - Crop disease identification
   - Pest identification
   - Soil condition assessment
   - Plant health evaluation
   Always relate your analysis back to agricultural advice.

4. Keep answers practical, simple, and suitable for Indian farmers.
5. Use a mix of Hindi and English if helpful (Hinglish is fine).
6. Always give actionable advice.
`;

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "FarmBot is running 🌾", version: "1.0" });
});

// ── Webhook verification (GET) ────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

// ── Webhook events (POST) ─────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // always ack Meta immediately

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
      const userText = message.text.body;
      reply = await askGeminiText(userText);

    } else if (msgType === "image") {
      const imageId = message.image.id;
      const caption = message.image?.caption || "Analyze this farming image and give agricultural advice.";
      const { data: imageBytes, mimeType } = await downloadWhatsAppMedia(imageId);
      reply = await askGeminiImage(imageBytes, mimeType, caption);

    } else {
      reply = "Please send a text message or a photo of your crop/field and I'll help you! 🌾";
    }

    await sendWhatsAppMessage(from, reply);

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ── Gemini: text ──────────────────────────────────────────────────────────────
async function askGeminiText(userMessage) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent(userMessage);
    return result.response.text().trim();
  } catch (err) {
    console.error("Gemini text error:", err.message);
    return "Sorry, I'm having trouble right now. Please try again in a moment. 🙏";
  }
}

// ── Gemini: image + text ──────────────────────────────────────────────────────
async function askGeminiImage(imageBytes, mimeType, caption) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
    });

    const imagePart = {
      inlineData: {
        data: imageBytes.toString("base64"),
        mimeType: mimeType || "image/jpeg",
      },
    };

    const result = await model.generateContent([caption, imagePart]);
    return result.response.text().trim();
  } catch (err) {
    console.error("Gemini image error:", err.message);
    return "I couldn't analyze the image. Please try again or describe what you see. 🌿";
  }
}

// ── Download media from WhatsApp ──────────────────────────────────────────────
async function downloadWhatsAppMedia(mediaId) {
  const headers = { Authorization: `Bearer ${WHATSAPP_TOKEN}` };

  // Step 1: get media URL
  const urlResp = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers }
  );
  const mediaUrl  = urlResp.data.url;
  const mimeType  = urlResp.data.mime_type;

  // Step 2: download bytes
  const mediaResp = await axios.get(mediaUrl, {
    headers,
    responseType: "arraybuffer",
  });

  return { data: Buffer.from(mediaResp.data), mimeType };
}

// ── Send WhatsApp message ─────────────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  try {
    const url     = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    };
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };

    const resp = await axios.post(url, payload, { headers });
    console.log(`✅ Message sent to ${to} | status: ${resp.status}`);
  } catch (err) {
    console.error("❌ Send message error:", err.response?.data || err.message);
  }
}

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.get("/test", async (req, res) => {
    const reply = await askGeminiText("What fertilizer for tomatoes?");
    res.json({ reply });
  });
app.listen(PORT, () => {
  console.log(`🌾 FarmBot server running on port ${PORT}`);
});