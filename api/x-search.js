// api/x-search.js
export const config = {
  runtime: "nodejs",
};

/**
 * @typedef {Object} VercelRequest
 * @property {string} [method]
 * @property {Record<string, string | string[] | undefined>} query
 */
/**
 * @typedef {Object} VercelResponse
 * @property {(name: string, value: string | readonly string[]) => void} setHeader
 * @property {(code: number) => VercelResponse} status
 * @property {(payload: any) => VercelResponse} json
 * @property {() => void} end
 */

/**
 * @param {VercelRequest} req
 * @param {VercelResponse} res
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q || req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' });

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.error('[X proxy] Missing JINA_API_KEY');
    return res.status(200).json({
      data: buildFallbackPosts(query),
      meta: { fallback: true, message: 'Missing JINA_API_KEY' },
    });
  }

  try {
    const response = await fetch('https://jsearch.jina.ai/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
    if (!response.ok) throw new Error(`JSearch failed: ${response.status}`);

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON from JSearch');
    }

    const data = Array.isArray(payload?.data) ? payload.data : [];

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
      user: {
        name: "Signal Relay",
        username: "echo-thread",
      },
      url: "#",
      created_at: now,
      likes: 0,
      replies: 0,
    },
  ];
}