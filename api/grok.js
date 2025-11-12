// api/grok.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const query = req.query.q?.trim();
  if (!query) return res.status(400).json({ error: "Missing ?q=..." });

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("Missing XAI_API_KEY");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content: `
You are a JSON API. Return ONLY a valid JSON object with no extra text, markdown, or code blocks.
Structure:
{
  "posts": [
    {
      "id": "string",
      "text": "string",
      "author": { "name": "string", "username": "string" },
      "url": "string",
      "created_at": "string",
      "likes": number,
      "replies": number
    }
  ],
  "ai": {
    "summary": "string",
    "takeaways": ["string", "string", "string"],
    "sentiment": "positive" | "negative" | "neutral"
  }
}
`.trim(),
          },
          {
            role: "user",
            content: `Search X for "${query}" — latest 10 posts. Include AI summary.`,
          },
        ],
        max_tokens: 2500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`xAI ${response.status}: ${err}`);
    }

    const { choices } = await response.json();
    const content = choices[0].message.content.trim();

    // Extract JSON
    const jsonStr = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .match(/\{[\s\S]*\}/)?.[0];

    if (!jsonStr) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonStr);

    // Normalize
    const posts = Array.isArray(parsed.posts)
      ? parsed.posts.map((p) => ({
          id: p.id ?? null,
          text: p.text ?? "No text",
          author: p.author?.name ?? p.author?.username ?? "Unknown",
          username: p.author?.username ?? "unknown",
          url: p.url ?? (p.id ? `https://x.com/i/status/${p.id}` : "#"),
          created_at: p.created_at ?? "",
          likes: p.likes ?? 0,
          replies: p.replies ?? 0,
        }))
      : [];

    const ai = parsed.ai
      ? {
          summary: parsed.ai.summary ?? "No summary.",
          takeaways: Array.isArray(parsed.ai.takeaways)
            ? parsed.ai.takeaways.slice(0, 3)
            : [],
          sentiment: ["positive", "negative", "neutral"].includes(parsed.ai.sentiment)
            ? parsed.ai.sentiment
            : "neutral",
        }
      : null;

    return res.status(200).json({ posts, ai });
  } catch (error) {
    console.error("Grok API error:", error.message);
    return res.status(500).json({ error: "Failed to fetch from Grok" });
  }
}