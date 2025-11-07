// api/x-search.js
import { XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';

export const config = { runtime: 'nodejs' };

// --- tiny helpers ---
const withTimeout = async (url, opts = {}, ms = 8000) => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
};

function buildFallbackPosts(query) {
  const now = new Date().toISOString();
  return [
    {
      id: `fallback-${Date.now()}`,
      text: `Live X feed is warming up. Keeping an eye on "${query}" while we reconnect.`,
      user: { name: 'Signal Relay', username: 'echo-thread' },
      url: '#',
      created_at: now,
      likes: 0,
      replies: 0,
    },
  ];
}

function safeTweetIdFromLink(link) {
  try {
    const u = new URL(link);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || randomUUID();
  } catch {
    return randomUUID();
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q || req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  const apiKey = process.env.JINA_API_KEY;

  // Helpful caching (tune to taste)
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  // === 1) RSS PRIMARY (no key required) ===
  try {
    // NOTE: RSSHub has moved many paths from /twitter/* to /x/*; this search feed works on public mirrors.
    const rssHubUrl = `https://rsshub.app/x/search/${encodeURIComponent(query)}`;
    const wrapped = `https://api.allorigins.win/get?url=${encodeURIComponent(rssHubUrl)}`;

    const rssRes = await withTimeout(wrapped, { headers: { 'User-Agent': 'echothread-proxy/1.0' } }, 8000);
    if (rssRes.ok) {
      const { contents } = await rssRes.json();
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: 'text',
        trimValues: true,
        cdataPropName: 'cdata', // keep CDATA if present
      });

      const doc = parser.parse(contents);
      const items = doc?.rss?.channel?.item || [];

      const rssData = (Array.isArray(items) ? items : [items])
        .slice(0, 10)
        .map((item) => {
          const link = item.link || '#';
          const title = item.title || '';
          const description = item.description || '';
          const created = item.pubDate || new Date().toISOString();
          const author =
            item.author ||
            (item['dc:creator'] ?? 'Unknown');

          return {
            id: safeTweetIdFromLink(link),
            text: (title || description || '').toString().trim(),
            user: {
              name: author || 'Unknown',
              username: (author || 'unknown').toString().replace(/^@/, ''),
            },
            url: link,
            created_at: created,
            likes: 0,
            replies: 0,
          };
        });

      if (rssData.length > 0) {
        return res.status(200).json({ data: rssData });
      }
    }
  } catch (err) {
    console.error('[X proxy] RSS step failed:', err);
  }

  // === 2) JINA SECONDARY (if key present) ===
  if (apiKey) {
    try {
      const jinaRes = await withTimeout(
        'https://jsearch.jina.ai/v1/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey, // correct header
            'User-Agent': 'echothread-proxy/1.0',
          },
          body: JSON.stringify({
            query,
            source: 'x',      // Jina supports 'x'
            limit: 10,
            reasoning: false,
          }),
        },
        8000
      );

      const raw = await jinaRes.text();
      if (!jinaRes.ok) throw new Error(`Jina HTTP ${jinaRes.status}: ${raw?.slice(0, 160)}`);

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error('Invalid JSON from Jina');
      }
      const data = Array.isArray(payload?.data) ? payload.data : [];
      if (data.length > 0) {
        return res.status(200).json({ data });
      }
    } catch (err) {
      console.warn('[X proxy] Jina step failed:', err.message);
    }
  }

  // === 3) FINAL FALLBACK ===
  return res.status(200).json({
    data: buildFallbackPosts(query),
    meta: { fallback: true, message: 'All sources failed' },
  });
}
