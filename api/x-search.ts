// api/x-search.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' })

  const query = (req.query.q || req.query.query) as string | undefined
  if (!query) return res.status(400).json({ error: 'Missing ?q=...' })

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
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`JSearch failed: ${response.status} - ${body}`)
    }

    const payload = await response.json()
    const data = Array.isArray(payload?.data) ? payload.data : []

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120')
    return res.status(200).json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[X proxy]', message)
    return res.status(500).json({ error: message })
  }
}