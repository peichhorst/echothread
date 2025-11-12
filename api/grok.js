// api/grok.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return res.status(401).json({ error: 'Missing XAI_API_KEY' });

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          {
            role: 'system',
            content: `You are Grok, a real-time intelligence engine. For query "${query}":
1. Search X for the latest 10 posts (latest mode).
2. Analyze them and return:
   - posts: array of {id, text, author{name,username}, url, created_at, likes, replies}
   - ai: {summary, takeaways[3], sentiment}

Return ONLY valid JSON.`
          },
          { role: 'user', content: `Search and analyze: "${query}"` }
        ],
        max_tokens: 2500,
        temperature: 0.3
      }),
    });

    if (!response.ok) throw new Error(`xAI failed: ${response.status}`);

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);

    return res.status(200).json({
      posts: result.posts || [],
      ai: result.ai || null
    });
  } catch (error) {
    console.error('[Grok API] ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
}