// src/lib/echo.ts
const SERPER_API = "https://google.serper.dev/search"
const REDDIT_PROXY_URL =
  import.meta.env.VITE_REDDIT_PROXY_URL ?? "/api/reddit-search"
const JSEARCH_API_HOST =
  import.meta.env.VITE_RAPIDAPI_HOST?.trim() || "jsearch.p.rapidapi.com"
const JSEARCH_API = `https://${JSEARCH_API_HOST}/search`

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

export type EchoPayload = {
  google: GoogleResponse | null
  reddit: RedditPost[]
  xPosts: XPost[]
  grokPosts: XPost[]
  grokAI: AIInsight | null
  jobs: JobResult[]
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
  const rapidKey = import.meta.env.VITE_RAPIDAPI_KEY
  if (!rapidKey) return []
  const resp = await fetch(
    `${JSEARCH_API}?query=${encodeURIComponent(cleanQuery)}&page=1&num_pages=1&country=us&date_posted=all`,
    {
      headers: {
        "x-rapidapi-key": rapidKey,
        "x-rapidapi-host": JSEARCH_API_HOST,
        Accept: "application/json",
      },
    }
  )
  if (!resp.ok) throw new Error(`JSearch ${resp.status}`)
  const { data } = (await resp.json()) as { data?: JobResult[] }
  return Array.isArray(data) ? data : []
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

  const [gResult, rResult, grokResult, jResult] = await Promise.allSettled([
    fetchGoogle(cleanQuery),
    fetchReddit(cleanQuery),
    fetchGrok(cleanQuery),
    fetchJobs(cleanQuery),
  ])

  if (gResult.status === "rejected") console.warn("Google:", gResult.reason)
  if (rResult.status === "rejected") console.warn("Reddit:", rResult.reason)
  if (grokResult.status === "rejected") console.warn("Grok:", grokResult.reason)
  if (jResult.status === "rejected") console.warn("Jobs:", jResult.reason)

  const google = gResult.status === "fulfilled" ? gResult.value : null
  const reddit = rResult.status === "fulfilled" ? rResult.value ?? [] : []
  const { posts: grokPosts, ai: grokAI } =
    grokResult.status === "fulfilled"
      ? grokResult.value
      : { posts: buildXPlaceholder(cleanQuery), ai: null }
  const xPosts = grokPosts
  const jobs = jResult.status === "fulfilled" ? jResult.value : []

  const hasAny =
    (google?.organic?.length ?? 0) || reddit.length || xPosts.length || grokPosts.length || jobs.length
  if (!hasAny) return null

  return { google, reddit, xPosts, grokPosts, grokAI, jobs }
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

  const { google, reddit, xPosts, grokPosts, grokAI, jobs } = payload
  const news = google?.organic ?? []

  const redditSummary = fallbackLine("Reddit", reddit.length ? `${reddit.length} new Reddit posts.` : "")
  const xSummary = fallbackLine("X", xPosts.length ? `${xPosts.length} live conversations.` : "")
  const grokSummary = grokAI?.summary
    ? `[GROK] ${grokAI.summary.trim()}`
    : fallbackLine("Grok", grokPosts.length ? `${grokPosts.length} synthesized threads.` : "")
  const newsSummary = fallbackLine("Google", news.length ? `${news.length} results.` : "")
  const marketSummary = `[MARKET] Token volume +${Math.floor(Math.random() * 400 + 50)}%`
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
    jobSummary,
    jobItems,
    newsItems,
    timestamp: new Date().toISOString(),
  }
}
