export const config = { runtime: "nodejs" }

const DEFAULT_ENDPOINTS = [
  "https://api.elections.kalshi.com/trade-api/v2/markets",
  "https://trading-api.kalshi.com/trade-api/v2/markets",
  "https://trading.kalshi.com/trade-api/v2/markets",
  "https://api.kalshi.com/trade-api/v2/markets",
]
const CACHE_TTL_MS = 60 * 1000
const cache = new Map()

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

function getQueryParam(value) {
  if (Array.isArray(value)) return value[0]
  return value
}

function normalizeMarket(market) {
  return {
    title: market?.title ?? "Kalshi market",
    yesPrice: typeof market?.yes_bid === "number" ? Math.round(market.yes_bid * 100) : 0,
    noPrice: typeof market?.no_bid === "number" ? Math.round(market.no_bid * 100) : 0,
    volume: typeof market?.volume === "number" ? market.volume : 0,
    url: market?.ticker ? `https://kalshi.com/markets/${market.ticker}` : "https://kalshi.com/markets",
  }
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET,OPTIONS")
    return res.status(405).json({ error: "Method Not Allowed" })
  }

  const queryParam = getQueryParam(req.query?.q ?? req.query?.query) ?? ""
  const limitParam = Number(getQueryParam(req.query?.limit)) || 5
  const limit = Math.max(1, Math.min(limitParam, 10))

  const cacheKey = `${queryParam}-${limit}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180")
    return res.status(200).json(cached.payload)
  }

  const endpoints = process.env.KALSHI_ENDPOINT
    ? [process.env.KALSHI_ENDPOINT.trim(), ...DEFAULT_ENDPOINTS]
    : DEFAULT_ENDPOINTS

  let lastError = null

  for (const endpoint of endpoints) {
    try {
      const upstream = await fetch(`${endpoint}?limit=40`, {
        headers: { Accept: "application/json" },
      })
      const raw = await upstream.text()

      if (!upstream.ok) {
        console.error("[Kalshi proxy]", endpoint, upstream.status, raw.slice(0, 200))
        lastError = new Error(`Kalshi upstream ${upstream.status}`)
        continue
      }

      let payload
      try {
        payload = JSON.parse(raw)
      } catch {
        console.error("[Kalshi proxy] Invalid JSON payload from", endpoint)
        lastError = new Error("Kalshi invalid JSON")
        continue
      }

      const markets = Array.isArray(payload?.markets) ? payload.markets : []
      const normalized = markets
        .filter((market) => {
          if (!queryParam) return true
          const title = market?.title ? String(market.title).toLowerCase() : ""
          return title.includes(queryParam.toLowerCase())
        })
        .slice(0, limit)
        .map(normalizeMarket)

      const responsePayload = { data: normalized }
      cache.set(cacheKey, { timestamp: now, payload: responsePayload })

      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180")
      return res.status(200).json(responsePayload)
    } catch (error) {
      console.error("[Kalshi proxy] Request failed for", endpoint, error)
      lastError = error
      continue
    }
  }

  return res.status(502).json({ error: "Failed to reach Kalshi", detail: lastError?.message ?? null })
}
