export const config = { runtime: "nodejs" }

const MARKETS_ENDPOINT = "https://api.elections.kalshi.com/trade-api/v2/markets"
const EVENTS_ENDPOINT = "https://api.elections.kalshi.com/trade-api/v2/events"
const MAX_MARKETS = 200
const EVENTS_PAGE_SIZE = 200
const MAX_EVENT_PAGES = 8
const DIRECT_EVENT_LIMIT = 6
const MARKETS_PER_EVENT = 3
const TRENDING_BATCH_LIMIT = 200
const PREFERRED_CATEGORIES = new Set([
  "Politics",
  "Economy",
  "World",
  "Science and Technology",
  "Elections",
])
const SPORTS_KEYWORDS = ["sports", "nfl", "nba", "mlb", "nhl", "ncaa", "soccer", "football", "basketball"]

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

function safeTokens(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function computeScore(query, eventTitle, marketTitle, category) {
  const needle = query.toLowerCase()
  const tokens = safeTokens(query)
  const eventLower = eventTitle?.toLowerCase?.() ?? ""
  const marketLower = marketTitle?.toLowerCase?.() ?? ""

  let score = 0
  let matched = false

  if (!needle) {
    score = 0.5
    matched = true
  }

  if (needle && eventLower.includes(needle)) {
    score += 1
    matched = true
  }

  if (needle && marketLower.includes(needle)) {
    score += 0.6
    matched = true
  }

  if (!score && tokens.length) {
    if (tokens.some((token) => eventLower.includes(token))) score += 0.5
    if (tokens.some((token) => marketLower.includes(token))) score += 0.3
    if (score > 0) matched = true
  }

  if (matched && category) {
    if (PREFERRED_CATEGORIES.has(category)) score += 0.2
    if (SPORTS_KEYWORDS.some((keyword) => category.toLowerCase().includes(keyword))) score -= 0.3
  }

  return Math.max(score, 0)
}

function normalizeMarket(market, event, score, matchType) {
  return {
    title: market?.title ?? "Kalshi market",
    yesPrice: Math.round((market?.yes_bid ?? 0) * 100),
    noPrice: Math.round((market?.no_bid ?? 0) * 100),
    volume: market?.volume24h ?? market?.volume ?? 0,
    url: market?.ticker ? `https://kalshi.com/market/${market.ticker}` : "https://kalshi.com/markets",
    category: event?.category ?? "",
    eventTitle: event?.title ?? "",
    eventUrl: event?.event_ticker ? `https://kalshi.com/event/${event.event_ticker}` : "https://kalshi.com/events",
    score,
    matchType,
  }
}

async function fetchEventsForQuery(query, maxEvents) {
  if (!query) return []

  const matches = []
  const seenTickers = new Set()
  let cursor = ""
  let pages = 0

  while (pages < MAX_EVENT_PAGES && matches.length < maxEvents) {
    const url = new URL(EVENTS_ENDPOINT)
    url.searchParams.set("limit", EVENTS_PAGE_SIZE.toString())
    if (cursor) url.searchParams.set("cursor", cursor)

    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Kalshi events ${resp.status}`)
    const data = await resp.json()
    const events = Array.isArray(data?.events) ? data.events : []

    for (const event of events) {
      const score = computeScore(query, event?.title ?? "", event?.sub_title ?? "", event?.category ?? "")
      if (score > 0 && event?.event_ticker && !seenTickers.has(event.event_ticker)) {
        matches.push({ event, score })
        seenTickers.add(event.event_ticker)
      }
      if (matches.length >= maxEvents) break
    }

    if (!data?.cursor) break
    cursor = data.cursor
    pages += 1
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, maxEvents)
}

async function fetchMarketsForEvents(eventMatches, perEventLimit, query) {
  if (!eventMatches.length) return []

  const tasks = eventMatches.map(({ event, score: eventScore }) =>
    (async () => {
      const url = new URL(MARKETS_ENDPOINT)
      url.searchParams.set("event_ticker", event.event_ticker)
      url.searchParams.set("limit", perEventLimit.toString())
      url.searchParams.set("status", "open")

      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`Kalshi markets for ${event.event_ticker} ${resp.status}`)
      const data = await resp.json()
      const markets = Array.isArray(data?.markets) ? data.markets : []

      return markets.map((market) => {
        const combinedScore = eventScore + computeScore(query, event?.title ?? "", market?.title ?? "", event?.category ?? "")
        return {
          ticker: market?.ticker ?? `${event.event_ticker}-${Math.random().toString(16).slice(2, 6)}`,
          normalized: normalizeMarket(market, event, combinedScore, "direct"),
          score: combinedScore,
        }
      })
    })()
  )

  const settled = await Promise.allSettled(tasks)
  const seen = new Set()
  const combined = []

  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") {
      console.warn("[Kalshi] event batch failed", outcome.reason)
      continue
    }
    for (const entry of outcome.value) {
      if (!entry?.ticker || seen.has(entry.ticker)) continue
      seen.add(entry.ticker)
      combined.push({ normalized: entry.normalized, score: entry.score })
    }
  }

  return combined.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.normalized.volume ?? 0) - (a.normalized.volume ?? 0)
  })
}

async function fetchTrendingMarkets(limit) {
  const url = new URL(MARKETS_ENDPOINT)
  url.searchParams.set("limit", TRENDING_BATCH_LIMIT.toString())
  url.searchParams.set("status", "open")

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Kalshi trending ${resp.status}`)
  const data = await resp.json()
  const markets = Array.isArray(data?.markets) ? data.markets : []

  return markets
    .map((market) => ({
      normalized: normalizeMarket(market, null, 0, "fallback"),
      score: 0,
    }))
    .sort((a, b) => (b.normalized.volume ?? 0) - (a.normalized.volume ?? 0))
    .slice(0, limit)
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" })

  const query = req.query.q?.toString().trim() ?? ""
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 20)

  try {
    let directMatches = []
    if (query) {
      try {
        const matchingEvents = await fetchEventsForQuery(query, DIRECT_EVENT_LIMIT)
        directMatches = await fetchMarketsForEvents(matchingEvents, MARKETS_PER_EVENT, query)
      } catch (error) {
        console.warn("[Kalshi] direct match lookup failed", error)
      }
    }

    const fallbackNeeded = Math.max(0, limit - directMatches.length)
    let fallbackMatches = []
    if (fallbackNeeded) {
      const fallbackTarget = Math.min(TRENDING_BATCH_LIMIT, Math.max(limit, fallbackNeeded * 2))
      try {
        fallbackMatches = await fetchTrendingMarkets(fallbackTarget)
      } catch (error) {
        console.warn("[Kalshi] fallback fetch failed", error)
      }
    }

    const combined = [...directMatches, ...fallbackMatches]
    const sorted = combined.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.normalized.volume ?? 0) - (a.normalized.volume ?? 0)
    })

    const selection = sorted.slice(0, limit).map((entry) => entry.normalized)

    return res.status(200).json({
      data: selection,
      matchType: directMatches.length ? "direct" : "fallback",
    })
  } catch (error) {
    console.error("[Kalshi] ERROR:", error)
    return res.status(500).json({ error: "Kalshi fetch failed" })
  }
}
