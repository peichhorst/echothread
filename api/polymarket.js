import { randomUUID } from "node:crypto"

export const config = { runtime: "nodejs" }

const GAMMA_ENDPOINT = "https://gamma-api.polymarket.com/markets"
const CACHE_TTL_MS = 60 * 1000
const STALE_TTL_MS = 5 * 60 * 1000
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

const toNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value) : null

function normalizeMarket(market) {
  const outcomes = []
  try {
    const parsed = JSON.parse(market?.outcomes ?? "[]")
    if (Array.isArray(parsed)) outcomes.push(...parsed.filter((o) => typeof o === "string"))
  } catch {
    // ignore malformed JSON
  }

  const bestBid = toNumber(market?.bestBid)
  const bestAsk = toNumber(market?.bestAsk)
  const lastPrice = toNumber(market?.lastTradePrice)
  const price = bestBid ?? lastPrice ?? null

  return {
    id: market?.id ?? market?.slug ?? `polymarket-${randomUUID()}`,
    question: market?.question?.trim() || "Untitled Polymarket",
    slug: market?.slug ?? "",
    url: market?.slug ? `https://polymarket.com/market/${market.slug}` : "https://polymarket.com/markets",
    icon: market?.icon || market?.image || null,
    bestBid,
    bestAsk,
    lastTradePrice: lastPrice,
    probability: price !== null ? Math.round(price * 1000) / 10 : null,
    change24h: toNumber(market?.oneDayPriceChange),
    volume24h: toNumber(market?.volume24hrClob) ?? toNumber(market?.volume24hrAmm) ?? 0,
    volume7d: toNumber(market?.volume1wkClob) ?? toNumber(market?.volume1wkAmm) ?? 0,
    startDate: market?.startDate ?? null,
    endDate: market?.endDate ?? null,
    restricted: Boolean(market?.restricted),
    group: market?.groupItemTitle ?? market?.events?.[0]?.title ?? null,
    outcomes,
  }
}

function sendCached(res, cached, state) {
  res.setHeader("x-polymarket-cache", state)
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300")
  return res.status(200).json(cached.payload)
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

  const limitParam = Number(getQueryParam(req.query?.limit)) || 12
  const limit = Math.max(1, Math.min(limitParam, 40))
  const tagId = getQueryParam(req.query?.tag)
  const queryParam = getQueryParam(req.query?.q ?? req.query?.query)
  const query = typeof queryParam === "string" ? queryParam.trim() : ""

  const cacheKey = JSON.stringify({ limit, tagId, query })
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return sendCached(res, cached, "HIT")
  }
  const stale = cached && now - cached.timestamp < STALE_TTL_MS ? cached : null

  const url = new URL(GAMMA_ENDPOINT)
  url.searchParams.set("closed", "false")
  url.searchParams.set("order", "id")
  url.searchParams.set("ascending", "false")
  const upstreamLimit = query ? Math.min(limit * 3, 60) : limit
  url.searchParams.set("limit", String(upstreamLimit))
  if (tagId) {
    url.searchParams.set("tag_id", tagId)
  }

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
    })
    const raw = await upstream.text()

    if (!upstream.ok) {
      console.error("[Polymarket proxy]", upstream.status, raw.slice(0, 300))
      if (stale) return sendCached(res, stale, "STALE")
      const message =
        upstream.status === 429
          ? "Polymarket rate limit reached. Try again soon."
          : "Polymarket upstream error."
      return res.status(upstream.status).json({ error: message })
    }

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      console.error("[Polymarket proxy] Invalid JSON payload")
      if (stale) return sendCached(res, stale, "STALE_BAD_JSON")
      return res.status(502).json({ error: "Invalid Polymarket payload" })
    }

    const markets = Array.isArray(payload) ? payload : payload?.data ?? []
    const normalized = markets
      .filter((m) => m && m.question)
      .map((m) => normalizeMarket(m))

    let filtered = normalized
    if (query) {
      const needle = query.toLowerCase()
      filtered = normalized.filter((m) => {
        const haystacks = [
          m.question,
          m.slug,
          m.group,
          ...(m.outcomes ?? []),
        ]
        return haystacks.some((value) =>
          typeof value === "string" ? value.toLowerCase().includes(needle) : false
        )
      })
      if (filtered.length === 0) {
        filtered = normalized
      }
    }

    const responsePayload = { data: filtered.slice(0, limit) }
    cache.set(cacheKey, { timestamp: now, payload: responsePayload })
    return sendCached(res, { payload: responsePayload }, cached ? "REFRESH" : "MISS")
  } catch (error) {
    console.error("[Polymarket proxy] Request failed", error)
    if (stale) return sendCached(res, stale, "STALE_FETCH_ERR")
    return res.status(502).json({ error: "Failed to reach Polymarket" })
  }
}
