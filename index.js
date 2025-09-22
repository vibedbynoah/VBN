// index.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON + CORS
app.use(express.json());
app.use(cors());

// Claude Proxy Endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Call Anthropic Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY, // put your Claude API key in Render env vars
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-opus-20240229", // or your chosen Claude model
        max_tokens: 500,
        system: "You are a helpful IGCSE tutor. Generate IGCSE-level questions and explain answers clearly.",
        messages: [
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error });
    }

    // Send Claude’s reply back to the frontend
    res.json({ reply: data.content[0].text });
  } catch (error) {
    console.error("Error contacting Claude:", error);
    res.status(500).json({ error: "Failed to reach Claude API" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Claude proxy running on port ${PORT}`);
});
