// api/x-search.js
export const config = {
  runtime: "nodejs",
};

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q || req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  const apiKey = process.env.JINA_API_KEY;

  // === 1. RSS PRIMARY (ALWAYS WORKS) ===
  try {
    const rssUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
      `https://rsshub.app/twitter/search?q=${encodeURIComponent(query)}`
    )}`;
    const rssRes = await fetch(rssUrl);
    if (rssRes.ok) {
      const { contents } = await rssRes.json();
      const parser = new DOMParser();
      const doc = parser.parseFromString(contents, 'text/xml');
      const items = doc.querySelectorAll('item');
      const rssData = Array.from(items).map(item => {
        const link = item.querySelector('link')?.textContent || '#';
        const id = link.split('/').pop() || crypto.randomUUID();
        return {
          id,
          text: (item.querySelector('title')?.textContent || item.querySelector('description')?.textContent || '').trim(),
          user: {
            name: item.querySelector('author')?.textContent || 'Unknown',
            username: item.querySelector('dc\\:creator')?.textContent || 'unknown',
          },
          url: link,
          created_at: item.querySelector('pubDate')?.textContent || new Date().toISOString(),
          likes: 0,
          replies: 0,
        };
      }).slice(0, 10);

      if (rssData.length > 0) {
        return res.status(200).json({ data: rssData });
      }
    }
  } catch (rssError) {
    console.error('[X proxy] RSS backup failed:', rssError);
  }

  // === 2. JINA SECONDARY (IF KEY) ===
  if (apiKey) {
    try {
      const response = await fetch('https://jsearch.jina.ai/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,  // ← CORRECT HEADER (not Bearer)
          'User-Agent': 'echothread-proxy/1.0',
        },
        body: JSON.stringify({
          query,
          source: 'x',
          limit: 10,
          reasoning: false,
        }),
      });

      const text = await response.text();
      if (response.ok) {
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error('Invalid JSON from JSearch');
        }
        const data = Array.isArray(payload?.data) ? payload.data : [];
        if (data.length > 0) {
          return res.status(200).json({ data });
        }
      }
    } catch (error) {
      console.warn('[X proxy] JSearch failed:', error.message);
    }
  }

  // === 3. FINAL FALLBACK ===
  return res.status(200).json({
    data: buildFallbackPosts(query),
    meta: { fallback: true, message: 'All sources failed' },
  });
}