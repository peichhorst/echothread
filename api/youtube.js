export const config = { runtime: "nodejs" }

const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search"
const DEFAULT_MAX_RESULTS = 10

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

function getQueryParam(value) {
  if (Array.isArray(value)) return value[0]
  return value
}

function normalizeItem(item) {
  const id = item?.id?.videoId ?? item?.id
  const snippet = item?.snippet ?? {}
  return {
    id: id || null,
    title: snippet?.title ?? "Untitled video",
    description: snippet?.description ?? "",
    channelTitle: snippet?.channelTitle ?? "Unknown channel",
    publishedAt: snippet?.publishedAt ?? "",
    thumbnail:
      snippet?.thumbnails?.high?.url ||
      snippet?.thumbnails?.medium?.url ||
      snippet?.thumbnails?.default?.url ||
      null,
    url: id ? `https://www.youtube.com/watch?v=${id}` : "https://www.youtube.com",
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

  const queryParam = getQueryParam(req.query?.q ?? req.query?.query)
  const query = typeof queryParam === "string" ? queryParam.trim() : ""
  if (!query) {
    return res.status(400).json({ error: "Missing query parameter (?q=...)" })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.error("[YouTube proxy] Missing YOUTUBE_API_KEY")
    return res.status(500).json({ error: "YouTube proxy misconfigured" })
  }

  const searchParams = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    q: query,
    type: "video",
    order: "relevance",
    maxResults: String(DEFAULT_MAX_RESULTS),
    safeSearch: "moderate",
  })

  try {
    const upstream = await fetch(`${SEARCH_ENDPOINT}?${searchParams}`, {
      headers: { Accept: "application/json" },
    })
    const raw = await upstream.text()

    if (!upstream.ok) {
      console.error("[YouTube proxy]", upstream.status, raw.slice(0, 200))
      const message =
        upstream.status === 403
          ? "YouTube quota exceeded. Try again later."
          : "YouTube upstream error."
      return res.status(upstream.status).json({ error: message })
    }

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      console.error("[YouTube proxy] Invalid JSON payload")
      return res.status(502).json({ error: "Invalid YouTube payload" })
    }

    const items = Array.isArray(payload?.items) ? payload.items : []
    const normalized = items.map(normalizeItem)

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180")
    return res.status(200).json({ data: normalized })
  } catch (error) {
    console.error("[YouTube proxy] Request failed", error)
    return res.status(502).json({ error: "Failed to reach YouTube" })
  }
}
