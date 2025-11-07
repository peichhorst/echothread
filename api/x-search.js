// api/x-search.js — call Grok's X tool
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q || req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  try {
    // Call Grok's X search (via xAI endpoint — replace with actual)
    const grokRes = await fetch('https://api.x.ai/v1/x-search', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer your_xai_key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit: 10,
        mode: 'Latest'
      })
    });

    if (!grokRes.ok) throw new Error(`Grok X search failed: ${grokRes.status}`);

    const grokData = await grokRes.json();
    const data = grokData.posts || [];

    return res.status(200).json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[X proxy] ERROR:', message);
    return res.status(200).json({
      data: buildFallbackPosts(query),
      meta: { fallback: true, message }
    });
  }
}