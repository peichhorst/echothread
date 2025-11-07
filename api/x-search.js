export const config = {
  runtime: "nodejs",
}

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

  try {
    const response = await fetch('https://jsearch.jina.ai/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    return res.status(500).json({ error: message });
  }
}
