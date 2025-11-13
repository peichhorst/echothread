export const config = { runtime: "nodejs" }

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

function getRapidCredentials() {
  const apiKey = process.env.RAPIDAPI_KEY || process.env.VITE_RAPIDAPI_KEY || ""
  const apiHost =
    process.env.RAPIDAPI_HOST ||
    process.env.VITE_RAPIDAPI_HOST ||
    "jsearch.p.rapidapi.com"
  return { apiKey, apiHost }
}

function sendCached(res, cached, state) {
  res.setHeader("x-jobs-cache", state)
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

  const queryParam = getQueryParam(req.query?.q ?? req.query?.query)
  const query = typeof queryParam === "string" ? queryParam.trim() : ""
  if (!query) {
    return res.status(400).json({ error: "Missing query parameter (?q=...)" })
  }

  const key = query.toLowerCase()
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return sendCached(res, cached, "HIT")
  }
  const stale = cached && now - cached.timestamp < STALE_TTL_MS ? cached : null

  const { apiKey, apiHost } = getRapidCredentials()
  if (!apiKey) {
    if (stale) return sendCached(res, stale, "STALE_NO_KEY")
    console.error("[Jobs proxy] Missing RAPIDAPI_KEY")
    return res.status(500).json({ error: "Jobs proxy misconfigured" })
  }

  const url = new URL(`https://${apiHost}/search`)
  url.searchParams.set("query", query)
  url.searchParams.set("page", "1")
  url.searchParams.set("num_pages", "1")
  url.searchParams.set("country", "us")
  url.searchParams.set("date_posted", "all")

  try {
    const upstream = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
        Accept: "application/json",
      },
    })
    const raw = await upstream.text()

    if (!upstream.ok) {
      console.error("[Jobs proxy] Upstream error", upstream.status, raw.slice(0, 200))
      if (stale) return sendCached(res, stale, "STALE")
      const message =
        upstream.status === 429
          ? "JSearch rate limit reached. Try again shortly."
          : "JSearch upstream error."
      return res.status(upstream.status).json({ error: message })
    }

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      console.error("[Jobs proxy] Non-JSON response from JSearch")
      if (stale) return sendCached(res, stale, "STALE_BAD_JSON")
      return res.status(502).json({ error: "Invalid jobs payload" })
    }

    const jobs = Array.isArray(payload?.data) ? payload.data : []
    const responsePayload = { data: jobs }
    cache.set(key, { timestamp: now, payload: responsePayload })
    return sendCached(res, { payload: responsePayload }, cached ? "REFRESH" : "MISS")
  } catch (error) {
    console.error("[Jobs proxy] Request failed", error)
    if (stale) return sendCached(res, stale, "STALE_FETCH_ERR")
    return res.status(502).json({ error: "Jobs proxy request failed" })
  }
}
