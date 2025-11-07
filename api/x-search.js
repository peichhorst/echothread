// api/x-search.js
export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q || req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  const apiKey = process.env.XAI_API_KEY;  // ← FROM VERCEL ENV

  if (!apiKey) {
    console.error('[X proxy] Missing XAI_API_KEY');
    return res.status(200).json({
      data: buildFallbackPosts(query),
      meta: { fallback: true, message: 'Missing XAI_API_KEY' },
    });
  }

  try {
    const response = await fetch('https://api.x.ai/v1/x-search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,  // ← CORRECT: FROM ENV
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 10,
        mode: 'Latest',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`xAI failed: ${response.status} - ${err}`);
    }

    const result = await response.json();
    const data = Array.isArray(result.posts) ? result.posts : [];

    return res.status(200).json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[X proxy] ERROR:', message);
    return res.status(200).json({
      data: buildFallbackPosts(query),
      meta: { fallback: true, message },
    });
  }
}

function buildFallbackPosts(query) {
  const now = new Date().toISOString();
  return [
    {
      id: `fallback-${Date.now()}`,
      text: `Live X feed is warming up. Keeping an eye on "${query}" while we reconnect.`,
      user: { name: "Signal Relay", username: "echo-thread" },
      url: "#",
      created_at: now,
      likes: 0,
      replies: 0,
    },
  ];
}