// src/lib/echo.ts
const SERPER_API = "https://google.serper.dev/search"
const REDDIT_PROXY_URL =
  import.meta.env.VITE_REDDIT_PROXY_URL ?? "/api/reddit-search"
const JOBS_PROXY_URL =
  import.meta.env.VITE_JOBS_PROXY_URL?.trim() || "/api/jobs"
const POLYMARKET_PROXY_URL =
  import.meta.env.VITE_POLYMARKET_PROXY_URL?.trim() || "/api/polymarket"
const YOUTUBE_PROXY_URL =
  import.meta.env.VITE_YOUTUBE_PROXY_URL?.trim() || "/api/youtube"
const KALSHI_PROXY_URL =
  import.meta.env.VITE_KALSHI_PROXY_URL?.trim() || "/api/kalshi"

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------
type GoogleOrganicResult = {
  title?: string
  snippet?: string
  link?: string
  source?: string
  date?: string
}
type GoogleResponse = { organic?: GoogleOrganicResult[] }

type RedditPost = {
  id: string
  title: string
  selftext?: string
  permalink?: string
  url?: string
  author?: string
  created_utc?: number
  num_comments?: number
  score?: number
  subreddit?: string
}

type XPost = {
  id?: string
  text?: string
  user?: { name?: string; username?: string }
  url?: string
  created_at?: string
  likes?: number
  replies?: number
}

type AIInsight = {
  summary: string
  takeaways: string[]
  sentiment: "positive" | "negative" | "neutral"
}

type JobResult = {
  job_id?: string
  job_title?: string
  job_city?: string
  job_country?: string
  employer_name?: string
  job_description?: string
  job_apply_link?: string
  job_posted_at_datetime_utc?: string
  job_employment_type?: string
}

type MarketContract = {
  id?: string
  question?: string
  slug?: string
  url?: string
  icon?: string | null
  probability?: number | null
  bestBid?: number | null
  bestAsk?: number | null
  lastTradePrice?: number | null
  change24h?: number | null
  volume24h?: number | null
  volume7d?: number | null
  startDate?: string | null
  endDate?: string | null
  outcomes?: string[]
  group?: string | null
}

type YoutubeVideo = {
  id?: string
  title?: string
  description?: string
  channelTitle?: string
  publishedAt?: string
  thumbnail?: string | null
  url?: string
}

type KalshiMarket = {
  title: string
  yesPrice: number
  noPrice: number
  volume: number
  url: string
}

export type EchoPayload = {
  google: GoogleResponse | null
  reddit: RedditPost[]
  xPosts: XPost[]
  grokPosts: XPost[]
  grokAI: AIInsight | null
  jobs: JobResult[]
  markets: MarketContract[]
  youtube: YoutubeVideo[]
  kalshi: KalshiMarket[]
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------
const fallbackLine = (label: string, content: string) =>
  content ? `[${label}] ${content}` : `[${label}] No fresh data right now.`

const stripLinks = (value: string) =>
  value.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim()

const IMAGE_EXTENSIONS = [
  ".png",".jpg",".jpeg",".gif",".webp",".bmp",".svg",".heic",".heif",
]
const isImageUrl = (value?: string | null) => {
  const t = value?.trim()
  if (!t || !/^https?:\/\//i.test(t)) return false
  try {
    const p = new URL(t).pathname.toLowerCase()
    return IMAGE_EXTENSIONS.some(e => p.endsWith(e))
  } catch { return false }
}

// -----------------------------------------------------------------
// Fetchers
// -----------------------------------------------------------------
const fetchGoogle = async (cleanQuery: string): Promise<GoogleResponse | null> => {
  const serperKey = import.meta.env.VITE_SERPER_KEY
  if (!serperKey) return null
  const resp = await fetch(SERPER_API, {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ q: cleanQuery }),
  })
  if (!resp.ok) throw new Error(`Serper ${resp.status}`)
  return (await resp.json()) as GoogleResponse
}

const fetchReddit = async (cleanQuery: string): Promise<RedditPost[]> => {
  const params = new URLSearchParams({ q: cleanQuery })
  const resp = await fetch(`${REDDIT_PROXY_URL}?${params}`, {
    headers: { Accept: "application/json" },
  })
  if (!resp.ok) throw new Error(`Reddit ${resp.status}`)
  const raw = await resp.text()
  let payload: any
  try { payload = JSON.parse(raw) } catch { throw new Error("Reddit non-JSON") }
  const children = payload?.data?.children ?? []
  if (!Array.isArray(children)) throw new Error("Reddit shape")
  return children
    .map((c: any) => c?.data)
    .filter(Boolean)
    .map((e: any) => {
      let permalink = e?.permalink ?? ""
      if (!permalink && e?.url) {
        try { permalink = new URL(e.url).pathname } catch {}
      }
      return {
        id: e?.id ?? crypto.randomUUID(),
        title: e?.title ?? "Untitled",
        selftext: e?.selftext ?? "",
        permalink,
        url: e?.url ?? "",
        author: e?.author ?? "unknown",
        created_utc: e?.created_utc ?? 0,
        num_comments: e?.num_comments ?? 0,
        score: e?.score ?? 0,
        subreddit: e?.subreddit ?? "",
      } as RedditPost
    })
}

const fetchJobs = async (cleanQuery: string): Promise<JobResult[]> => {
  const endpoint = JOBS_PROXY_URL.startsWith("http")
    ? JOBS_PROXY_URL
    : `${JOBS_PROXY_URL}` // relative path (default)

  const resp = await fetch(`${endpoint}?q=${encodeURIComponent(cleanQuery)}`, {
    headers: { Accept: "application/json" },
  })
  const raw = await resp.text()

  if (!resp.ok) {
    let details = ""
    try {
      const parsed = JSON.parse(raw)
      details = parsed?.error ? `: ${parsed.error}` : ""
    } catch {
      // ignore JSON parse error, fall back to status
    }
    throw new Error(`Jobs proxy ${resp.status}${details}`)
  }

  let payload: { data?: JobResult[] } = {}
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error("Jobs proxy non-JSON")
  }
  const { data } = payload
  return Array.isArray(data) ? data : []
}

const fetchMarkets = async (cleanQuery: string): Promise<MarketContract[]> => {
  const endpoint = POLYMARKET_PROXY_URL.startsWith("http")
    ? POLYMARKET_PROXY_URL
    : `${POLYMARKET_PROXY_URL}`
  const params = new URLSearchParams({ limit: "12" })
  if (cleanQuery) params.set("q", cleanQuery)

  const resp = await fetch(`${endpoint}?${params}`, {
    headers: { Accept: "application/json" },
  })
  const raw = await resp.text()

  if (!resp.ok) {
    let details = ""
    try {
      const parsed = JSON.parse(raw)
      details = parsed?.error ? `: ${parsed.error}` : ""
    } catch {
      // ignore JSON parse error
    }
    throw new Error(`Polymarket proxy ${resp.status}${details}`)
  }

  try {
    const payload = JSON.parse(raw) as { data?: MarketContract[] }
    const list = payload?.data
    if (!Array.isArray(list)) return []
    return list
  } catch {
    throw new Error("Polymarket proxy non-JSON")
  }
}

const fetchYoutube = async (cleanQuery: string): Promise<YoutubeVideo[]> => {
  if (!cleanQuery) return []
  const endpoint = YOUTUBE_PROXY_URL.startsWith("http")
    ? YOUTUBE_PROXY_URL
    : `${YOUTUBE_PROXY_URL}`

  const params = new URLSearchParams({ q: cleanQuery })
  const resp = await fetch(`${endpoint}?${params}`, {
    headers: { Accept: "application/json" },
  })
  const raw = await resp.text()

  if (!resp.ok) {
    let details = ""
    try {
      const parsed = JSON.parse(raw)
      details = parsed?.error ? `: ${parsed.error}` : ""
    } catch {
      // ignore parse error
    }
    throw new Error(`YouTube proxy ${resp.status}${details}`)
  }

  try {
    const payload = JSON.parse(raw) as { data?: YoutubeVideo[] }
    const list = payload?.data
    return Array.isArray(list) ? list : []
  } catch {
    throw new Error("YouTube proxy non-JSON")
  }
}

const fetchKalshi = async (cleanQuery: string): Promise<KalshiMarket[]> => {
  if (!cleanQuery) return []
  const endpoint = KALSHI_PROXY_URL.startsWith("http")
    ? KALSHI_PROXY_URL
    : `${KALSHI_PROXY_URL}`
  const params = new URLSearchParams({ q: cleanQuery, limit: "5" })

  try {
    const resp = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    })
    const raw = await resp.text()

    if (!resp.ok) {
      let details = ""
      try {
        const parsed = JSON.parse(raw)
        details = parsed?.error ? `: ${parsed.error}` : ""
      } catch {
        // ignore parse errors
      }
      throw new Error(`Kalshi proxy ${resp.status}${details}`)
    }

    const payload = JSON.parse(raw) as { data?: KalshiMarket[] }
    return Array.isArray(payload?.data) ? payload.data : []
  } catch {
    return []
  }
}


const fetchGrok = async (cleanQuery: string): Promise<{ posts: XPost[]; ai: AIInsight | null }> => {
  if (!cleanQuery) return { posts: buildXPlaceholder("your latest note"), ai: null }
  try {
    const resp = await fetch(`/api/grok?q=${encodeURIComponent(cleanQuery)}`)
    if (!resp.ok) throw new Error("Grok proxy failed")
    const { posts, ai } = await resp.json()
    const normalized =
      Array.isArray(posts) && posts.length > 0 ? posts : buildXPlaceholder(cleanQuery)
    return {
      posts: normalized,
      ai: ai ?? null,
    }
  } catch (error) {
    console.warn("Grok proxy failed:", error)
    return { posts: buildXPlaceholder(cleanQuery), ai: null }
  }
}


const buildXPlaceholder = (query: string): XPost[] => [
  {
    id: `x-placeholder-${Date.now()}`,
    text: `Live X scan is offline. Still watching for mentions of "${query}".`,
    user: { name: "Signal Relay", username: "echo-thread" },
    url: "#",
    created_at: new Date().toISOString(),
    likes: 0,
    replies: 0,
  },
]




// -----------------------------------------------------------------
// fetchEcho
// -----------------------------------------------------------------
export async function fetchEcho(query: string): Promise<EchoPayload | null> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return null

  const hasKeys = import.meta.env.VITE_SERPER_KEY || 
                  import.meta.env.VITE_RAPIDAPI_KEY || 
                  import.meta.env.VITE_XAI_API_KEY

  if (!hasKeys) {
    console.warn("Set at least one API key")
    return null
  }

  const [gResult, rResult, grokResult, jResult, mResult, yResult, kResult] = await Promise.allSettled([
    fetchGoogle(cleanQuery),
    fetchReddit(cleanQuery),
    fetchGrok(cleanQuery),
    fetchJobs(cleanQuery),
    fetchMarkets(cleanQuery),
    fetchYoutube(cleanQuery),
    fetchKalshi(cleanQuery),
  ])

  if (gResult.status === "rejected") console.warn("Google:", gResult.reason)
  if (rResult.status === "rejected") console.warn("Reddit:", rResult.reason)
  if (grokResult.status === "rejected") console.warn("Grok:", grokResult.reason)
  if (jResult.status === "rejected") console.warn("Jobs:", jResult.reason)
  if (mResult.status === "rejected") console.warn("Markets:", mResult.reason)
  if (yResult.status === "rejected") console.warn("YouTube:", yResult.reason)
  if (kResult.status === "rejected") console.warn("Kalshi:", kResult.reason)

  const google = gResult.status === "fulfilled" ? gResult.value : null
  const reddit = rResult.status === "fulfilled" ? rResult.value ?? [] : []
  const { posts: grokPosts, ai: grokAI } =
    grokResult.status === "fulfilled"
      ? grokResult.value
      : { posts: buildXPlaceholder(cleanQuery), ai: null }
  const xPosts = grokPosts
  const jobs = jResult.status === "fulfilled" ? jResult.value : []
  const markets = mResult.status === "fulfilled" ? mResult.value ?? [] : []
  const youtube = yResult.status === "fulfilled" ? yResult.value ?? [] : []
  const kalshi = kResult.status === "fulfilled" ? kResult.value ?? [] : []

  const hasAny =
    (google?.organic?.length ?? 0) ||
    reddit.length ||
    xPosts.length ||
    grokPosts.length ||
    jobs.length ||
    markets.length ||
    youtube.length ||
    kalshi.length
  if (!hasAny) return null

  return { google, reddit, xPosts, grokPosts, grokAI, jobs, markets, youtube, kalshi }
}

// -----------------------------------------------------------------
// buildEchoInsight
// -----------------------------------------------------------------
export type EchoInsight = {
  id: string
  selection: string
  redditSummary: string
  redditItems: Array<{
    id: string
    title: string
    author: string
    subreddit: string
    permalink: string
    url: string
    createdAt: number
    score: number
    commentCount: number
    selftext: string
  }>
  xSummary: string
  xItems: Array<{
    id: string
    text: string
    author: string
    username: string
    url: string
    publishedAt: string
    likes: number
    replies: number
  }>
  grokSummary: string
  grokAI: AIInsight | null
  newsSummary: string
  marketSummary: string
  marketItems: Array<{
    id: string
    title: string
    probability: number | null
    bestBid: number | null
    bestAsk: number | null
    change24h: number | null
    volume24h: number | null
    closesAt: string
    url: string
    group: string
    icon: string | null
    advice: string
  }>
  youtubeSummary: string
  youtubeItems: Array<{
    id: string
    title: string
    channel: string
    url: string
    publishedAt: string
    description: string
    thumbnail: string | null
  }>
  kalshiSummary: string
  kalshiItems: Array<{
    id: string
    title: string
    yesPrice: number
    noPrice: number
    volume: number
    url: string
  }>
  jobSummary: string
  jobItems: Array<{
    id: string
    title: string
    employer: string
    location: string
    postedAt: string
    description: string
    applyLink: string
    employmentType: string
  }>
  newsItems: Array<{
    id: string
    title: string
    snippet: string
    link: string
    source: string
    publishedAt: string
  }>
  timestamp: string
}

export async function buildEchoInsight(
  selection: string,
  fetcher: typeof fetchEcho = fetchEcho
): Promise<EchoInsight | null> {
  const clean = selection.trim()
  if (!clean) return null

  const payload = await fetcher(clean)
  if (!payload) return null

  const { google, reddit, xPosts, grokPosts, grokAI, jobs, markets, youtube, kalshi } = payload
  const news = google?.organic ?? []

  const redditSummary = fallbackLine("Reddit", reddit.length ? `${reddit.length} new Reddit posts.` : "")
  const xSummary = fallbackLine("X", xPosts.length ? `${xPosts.length} live conversations.` : "")
  const grokSummary = grokAI?.summary
    ? `[GROK] ${grokAI.summary.trim()}`
    : fallbackLine("Grok", grokPosts.length ? `${grokPosts.length} synthesized threads.` : "")
  const newsSummary = fallbackLine("Google", news.length ? `${news.length} results.` : "")
  const marketItems = markets
    .filter((m) => m?.question)
    .map((m, idx) => {
      const probability =
        typeof m?.probability === "number"
          ? m.probability
          : typeof m?.bestBid === "number"
            ? Math.round(m.bestBid * 1000) / 10
            : typeof m?.lastTradePrice === "number"
              ? Math.round(m.lastTradePrice * 1000) / 10
              : null
      const changePercent =
        typeof m?.change24h === "number" ? Math.round(m.change24h * 10000) / 100 : null
      const prettyOdds =
        probability !== null
          ? `${Number.isInteger(probability) ? probability.toFixed(0) : probability.toFixed(1)}%`
          : null
      const advice = (() => {
        if (probability === null) {
          if ((m?.volume24h ?? 0) <= 0) return "Liquidity is thin; wait for tighter spreads."
          return "Quotes are active, but odds are unclear—watch order flow before committing."
        }
        if (probability >= 65) {
          return `YES dominates at ~${prettyOdds}; fade it only if you spot a strong reversal catalyst.`
        }
        if (probability <= 35) {
          return `Market leans NO (~${prettyOdds} YES). Upside exists if you expect bullish news soon.`
        }
        if (changePercent !== null && Math.abs(changePercent) >= 1) {
          const direction = changePercent > 0 ? "YES" : "NO"
          return `${direction} gained ${Math.abs(changePercent).toFixed(1)} pts today—momentum may keep running if new data lands.`
        }
        return "Odds are balanced; stay patient until a catalyst breaks the tie."
      })()

      return {
        id: m?.id || `${clean}-market-${idx}`,
        title: m?.question?.trim() || "Unknown Polymarket",
        probability,
        bestBid: typeof m?.bestBid === "number" ? m.bestBid : null,
        bestAsk: typeof m?.bestAsk === "number" ? m.bestAsk : null,
        change24h: typeof m?.change24h === "number" ? m.change24h : null,
        volume24h:
          typeof m?.volume24h === "number"
            ? Math.round(m.volume24h)
            : typeof m?.volume7d === "number"
              ? Math.round(m.volume7d)
              : 0,
        closesAt: m?.endDate ?? "",
        url: m?.url || (m?.slug ? `https://polymarket.com/market/${m.slug}` : "#"),
        group: m?.group || "",
        icon: m?.icon ?? null,
        advice,
      }
    })

    /*
  const marketSummary = fallbackLine(
    "Polymarket",
    marketItems.length ? `${marketItems.length} live prediction contracts.` : ""
  )
    */

// POLYMARKET — QUERY-AWARE CROWD WISDOM (copy-paste this entire block)
const marketSummary = (() => {
  // Step 1: Find markets that actually match your search query
  const relevantMarkets = marketItems.filter(m =>
    m.title.toLowerCase().includes(clean.toLowerCase()) ||
    clean.toLowerCase().includes(m.title.toLowerCase().split(" ")[0].toLowerCase())
  )

  // Step 2: If no exact match, fall back to high-volume markets only
  const candidates = relevantMarkets.length > 0
    ? relevantMarkets
    : marketItems.filter(m => (m.volume24h ?? 0) >= 1_000_000)

  // Step 3: Pick the best one (highest volume)
  const best = candidates.reduce((a, b) => 
    (b.volume24h ?? 0) > (a.volume24h ?? 0) ? b : a, candidates[0] ?? null
  )

  if (!best) return `[POLYMARKET] No meaningful market found`

  const yesProb = Math.round(best.probability ?? 50)
  const noProb = 100 - yesProb
  const winner = yesProb > 50 ? "YES" : "NO"
  const probability = Math.max(yesProb, noProb)

  const strength =
    probability >= 80 ? "VERY STRONG" :
    probability >= 70 ? "STRONG" :
    probability >= 60 ? "CLEAR" :
    probability >= 55 ? "SLIGHT" : "WEAK"

  const volumeTier =
    (best.volume24h ?? 0) >= 10_000_000 ? "MASSIVE volume" :
    (best.volume24h ?? 0) >= 5_000_000 ? "HIGH volume" :
    (best.volume24h ?? 0) >= 1_000_000 ? "decent volume" : "low volume"

  const shortTitle = best.title.length > 90 
    ? best.title.slice(0, 87) + "..." 
    : best.title

  return `[POLYMARKET] Crowd says ${probability}% → ${winner} on "${shortTitle}" (${strength} signal, ${volumeTier})`
})()

const youtubeItems = youtube.map((video: YoutubeVideo, idx) => ({
  id: video.id || `${clean}-yt-${idx}`,
  title: video.title?.trim() || "Untitled video",
  channel: video.channelTitle || "Unknown channel",
  url: video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : "#"),
  publishedAt: video.publishedAt || "",
  description: stripLinks(video.description || ""),
  thumbnail: video.thumbnail ?? null,
}))

const youtubeSummary = fallbackLine(
  "YouTube",
  youtubeItems.length ? `${youtubeItems.length} new videos.` : ""
)

const formatNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}
// — KALSHI (REAL REGULATED MARKETS) —
const kalshiItems = kalshi
  .filter(m => m.title.toLowerCase().includes(clean.toLowerCase()))
  .slice(0, 3)
  .map((market, idx) => ({
    id: `kalshi-${idx}`,
    title: market.title,
    yesPrice: market.yesPrice || 0,
    noPrice: market.noPrice || 0,
    volume: market.volume || 0,
    url: market.url,
    // score is no longer needed — we use volume + relevance
  }))
  .sort((a, b) => b.volume - a.volume)

const topKalshi = kalshiItems[0]
const totalKalshiVolume = kalshiItems.reduce((sum, m) => sum + m.volume, 0)

const kalshiSummary = kalshiItems.length > 0
  ? topKalshi
    ? `[KALSHI] "${topKalshi.title}" — ${topKalshi.yesPrice}% YES ($${formatNumber(topKalshi.volume)} vol)`
    : `[KALSHI] ${kalshiItems.length} regulated markets — $${formatNumber(totalKalshiVolume)} total volume`
  : "[KALSHI] No active regulated markets"




  const jobSummary = fallbackLine("JOBS", jobs.length ? `${jobs.length} openings.` : "")

  const newsItems = news
    .filter(i => i?.title || i?.snippet)
    .map((i, idx) => ({
      id: i?.link || `${clean}-news-${idx}`,
      title: (i?.title?.trim() || i?.snippet?.slice(0, 120) || "Untitled"),
      snippet: stripLinks(i?.snippet || ""),
      link: i?.link || "#",
      source: i?.source?.trim() || "Unknown",
      publishedAt: i?.date?.trim() || "",
    }))

  const redditItems = reddit
    .filter(p => !(p.selftext?.toLowerCase().includes("https://preview.redd.it")))
    .map((p, idx) => {
      const safeUrl = p.url && !isImageUrl(p.url) ? p.url : ""
      return {
        id: p.id || `${clean}-reddit-${idx}`,
        title: p.title?.trim() || "Untitled",
        author: p.author || "unknown",
        subreddit: p.subreddit || "",
        permalink: p.permalink || "",
        url: safeUrl,
        createdAt: p.created_utc ?? 0,
        score: p.score ?? 0,
        commentCount: p.num_comments ?? 0,
        selftext: isImageUrl(p.selftext) ? "" : stripLinks(p.selftext || ""),
      }
    })

  const xItems = xPosts.map((p, idx) => ({
    id: p.id || `${clean}-x-${idx}`,
    text: stripLinks(p.text || "No text"),
    author: p.user?.name || p.user?.username || "Unknown",
    username: p.user?.username || "unknown",
    url: p.url || (p.id ? `https://x.com/i/status/${p.id}` : "#"),
    publishedAt: p.created_at || "",
    likes: p.likes ?? 0,
    replies: p.replies ?? 0,
  }))
  const jobItems = jobs.map((j, idx) => ({
    id: j.job_id || j.job_apply_link || `${clean}-job-${idx}`,
    title: j.job_title || "Untitled",
    employer: j.employer_name || "Unknown",
    location: [j.job_city, j.job_country].filter(Boolean).join(", "),
    postedAt: j.job_posted_at_datetime_utc || "",
    description: stripLinks(j.job_description || ""),
    applyLink: j.job_apply_link || "#",
    employmentType: j.job_employment_type || "",
  }))

  return {
    id: `echo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    selection: clean,
    redditSummary,
    redditItems,
    xSummary,
    xItems,
    grokSummary,
    grokAI,
    newsSummary,
    marketSummary,
    marketItems,
    youtubeSummary,
    youtubeItems,
    kalshiSummary,
    kalshiItems,
    jobSummary,
    jobItems,
    newsItems,
    timestamp: new Date().toISOString(),
  }
}
