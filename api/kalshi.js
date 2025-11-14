// api/kalshi.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = req.query.q?.trim() || '';
  const limit = Math.min(parseInt(req.query.limit || '10'), 20);

  try {
    // Current working endpoint (Nov 13, 2025)
    const url = `https://api.elections.kalshi.com/trade-api/v2/markets?limit=40&status=open`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`Kalshi ${response.status}`);

    const data = await response.json();
    const markets = Array.isArray(data.markets) ? data.markets : [];

    // Filter by query
    const filtered = query
      ? markets.filter(m => 
          m.title.toLowerCase().includes(query.toLowerCase())
        )
      : markets;

    // Sort by volume desc
    const sorted = filtered
      .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
      .slice(0, limit);

    const result = sorted.map(m => ({
      title: m.title,
      yesPrice: Math.round((m.yes_bid || 0) * 100),
      noPrice: Math.round((m.no_bid || 0) * 100),
      volume: m.volume24h || m.volume || 0,
      url: `https://kalshi.com/markets/${m.ticker}`,
    }));

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error('[Kalshi] ERROR:', error.message);
    return res.status(500).json({ error: 'Kalshi fetch failed' });
  }
}