const cron = require("node-cron");
const axios = require("axios");

const SELF_URL = "https://your-farmbot-render-url.onrender.com";

cron.schedule("*/12 * * * *", async () => {
  try {
    await axios.get(`${SELF_URL}/ping`);
    console.log("🔁 Health check ping:", new Date().toISOString());
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
  }
});