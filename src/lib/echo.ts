const SERPER_API = "https://google.serper.dev/search"
const REDDIT_PROXY_URL =
  import.meta.env.VITE_REDDIT_PROXY_URL ?? "/api/reddit-search"
const LOCAL_X_PROXY = "/api/x-search"
const REMOTE_X_PROXY = "https://echothread-eta.vercel.app/api/x-search"
const X_PROXY_URL =
  import.meta.env.VITE_X_PROXY_URL?.trim() ||
  (import.meta.env.DEV ? REMOTE_X_PROXY : LOCAL_X_PROXY)
const JSEARCH_API_HOST =
  import.meta.env.VITE_RAPIDAPI_HOST?.trim() || "jsearch.p.rapidapi.com"
const JSEARCH_API = `https://${JSEARCH_API_HOST}/search`

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
  user?: {
    name?: string
    username?: string
  }
  url?: string
  created_at?: string
  likes?: number
  replies?: number
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
  jobs: JobResult[]
}

const fallbackLine = (label: string, content: string) =>
  content ? `[${label}] ${content}` : `[${label}] No fresh data right now.`

const formatMillions = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
  }).format(value * 1_000_000)

const stripLinks = (value: string) =>
  value.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim()

export async function fetchEcho(query: string): Promise<EchoPayload | null> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return null

  const serperKey = import.meta.env.VITE_SERPER_KEY
  const rapidKey = import.meta.env.VITE_RAPIDAPI_KEY

  if (!serperKey && !rapidKey) {
    console.warn(
      "EchoThread fetch skipped: set VITE_SERPER_KEY and/or VITE_RAPIDAPI_KEY in your .env file."
    )
    return null
  }


  
  const fetchGoogle = async (): Promise<GoogleResponse | null> => {
    if (!serperKey) return null
    const response = await fetch(SERPER_API, {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ q: cleanQuery }),
    })

    if (!response.ok) {
      throw new Error(`Serper request failed (${response.status})`)
    }

    return (await response.json()) as GoogleResponse
  }

  const fetchReddit = async (): Promise<RedditPost[] | null> => {
    const params = new URLSearchParams({
      q: cleanQuery,
    })

    const response = await fetch(`${REDDIT_PROXY_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`Reddit search request failed (${response.status})`)
    }

    const raw = await response.text()
    let payload: any
    try {
      payload = JSON.parse(raw)
    } catch (error) {
      throw new Error("Reddit proxy returned non-JSON payload.")
    }
    const children = payload?.data?.children ?? []
    if (!Array.isArray(children)) {
      throw new Error("Unexpected Reddit response shape.")
    }

    return children
      .map((child: any) => child?.data)
      .filter(Boolean)
      .map((entry: any) => {
        let permalink = entry?.permalink ?? ""
        if (!permalink && entry?.url) {
          try {
            const url = new URL(entry.url)
            permalink = url.pathname
          } catch {
            permalink = ""
          }
        }

        return {
          id: entry?.id ?? crypto.randomUUID(),
          title: entry?.title ?? "Untitled post",
          selftext: entry?.selftext ?? "",
          permalink,
          url: entry?.url ?? "",
          author: entry?.author ?? "unknown",
          created_utc: entry?.created_utc ?? 0,
          num_comments: entry?.num_comments ?? 0,
          score: entry?.score ?? 0,
          subreddit: entry?.subreddit ?? "",
        } as RedditPost
      })
  }

const fetchX = async (): Promise<XPost[]> => {
  if (!cleanQuery) return []

  const fetchFrom = async (baseUrl: string): Promise<XPost[] | null> => {
    try {
      const params = new URLSearchParams({ q: cleanQuery })
      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      })

      const raw = await response.text()
      if (!response.ok) {
        throw new Error(`X proxy request failed (${response.status}): ${raw}`)
      }

      const trimmed = raw.trim()
      if (
        trimmed.startsWith("function ") ||
        trimmed.startsWith("export default") ||
        trimmed.startsWith("<!DOCTYPE")
      ) {
        console.warn("[X proxy] Received source instead of JSON; falling back.")
        return null
      }

      let payload: any
      try {
        payload = JSON.parse(raw)
      } catch {
        console.warn("[X proxy] Non-JSON payload:", raw.slice(0, 200))
        return null
      }

      const posts = Array.isArray(payload?.data) ? payload.data : []

      return posts.map((post: any, index: number) => ({
        id:
          post?.id ||
          globalThis.crypto?.randomUUID?.() ||
          `x-post-${Date.now()}-${index}`,
        text: stripLinks(post?.text || post?.content || "No text"),
        user: {
          name: post?.user?.name || post?.author?.name || post?.author || "Unknown",
          username: post?.user?.username || post?.username || "unknown",
        },
        url: post?.url || (post?.id ? `https://x.com/i/status/${post.id}` : "#"),
        created_at: post?.created_at || post?.timestamp || new Date().toISOString(),
        likes: post?.likes ?? post?.like_count ?? 0,
        replies: post?.replies ?? post?.reply_count ?? 0,
      }))
    } catch (error) {
      console.warn("X feed fetch failed", error)
      return null
    }
  }

  let posts = await fetchFrom(X_PROXY_URL)
  if (!posts && X_PROXY_URL === LOCAL_X_PROXY) {
    posts = await fetchFrom(REMOTE_X_PROXY)
  }
  return posts ?? []
}

  const fetchJobs = async (): Promise<JobResult[]> => {
    if (!rapidKey) return []
    const response = await fetch(
      `${JSEARCH_API}?query=${encodeURIComponent(
        cleanQuery
      )}&page=1&num_pages=1&country=us&date_posted=all`,
      {
        headers: {
          "x-rapidapi-key": rapidKey,
          "x-rapidapi-host": JSEARCH_API_HOST,
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      throw new Error(`JSearch request failed (${response.status})`)
    }

    const payload = (await response.json()) as { data?: JobResult[] }
    return Array.isArray(payload.data) ? payload.data : []
  }

  const [googleResult, redditResult, xResult, jobResult] = await Promise.allSettled([
    fetchGoogle(),
    fetchReddit(),
    fetchX(),
    fetchJobs(),
  ])

  if (googleResult.status === "rejected") {
    console.warn("Google echo fetch failed", googleResult.reason)
  }
  if (redditResult.status === "rejected") {
    console.warn("Reddit echo fetch failed", redditResult.reason)
  }
  if (xResult.status === "rejected") {
    console.warn("X feed fetch failed", xResult.reason)
  }
  if (jobResult.status === "rejected") {
    console.warn("JSearch echo fetch failed", jobResult.reason)
  }

  const google = googleResult.status === "fulfilled" ? googleResult.value : null
  const reddit = redditResult.status === "fulfilled" ? redditResult.value ?? [] : []
  const xPosts = xResult.status === "fulfilled" ? xResult.value ?? [] : []
  const jobs = jobResult.status === "fulfilled" ? jobResult.value : []

  const hasNews = google && (google.organic?.length ?? 0) > 0
  const hasReddit = reddit.length > 0
  const hasX = xPosts.length > 0
  const hasJobs = jobs.length > 0

  if (!hasNews && !hasReddit && !hasX && !hasJobs) {
    return null
  }

  return {
    google,
    reddit,
    xPosts,
    jobs,
  }
}

const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
]

const isImageUrl = (value?: string | null) => {
  const trimmed = value?.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    const lowerPath = url.pathname.toLowerCase()
    return IMAGE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))
  } catch {
    return false
  }
}

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
  const cleanSelection = selection.trim()
  if (!cleanSelection) return null

  const payload = await fetcher(cleanSelection)
  if (!payload) return null

  const redditPosts = payload.reddit ?? []
  const xPosts = payload.xPosts ?? []
  const news = payload.google?.organic ?? []
  const jobs = payload.jobs ?? []

  const redditSummary = fallbackLine(
    "Reddit",
    redditPosts.length
      ? `${redditPosts.length} new Reddit posts streaming in.`
      : ""
  )

  const xSummary = fallbackLine(
    "X",
    xPosts.length ? `${xPosts.length} live conversations captured.` : ""
  )

  const newsSummary = fallbackLine(
    "NEWS",
    news.length ? `${news.length} breaking headlines` : ""
  )

  const marketSummary = `[MARKET] Token volume +${Math.floor(
    Math.random() * 400 + 50
  )}% - ${formatMillions(Math.random() * 0.3 + 0.05)} spike`

  const jobSummary = fallbackLine(
    "JOBS",
    jobs.length ? `${jobs.length} openings surfaced via JSearch.` : ""
  )

  const newsItems = news
    .filter((item) => (item?.title || item?.snippet))
    .map((item, index) => ({
      id: item?.link || `${selection}-news-${index}`,
      title: item?.title?.trim() || item?.snippet?.slice(0, 120) || "Untitled headline",
      snippet: stripLinks(item?.snippet || "No snippet available"),
      link: item?.link || "#",
      source: item?.source?.trim() || "Unknown source",
      publishedAt: item?.date?.trim() || "",
    }))

  const redditItems = redditPosts
    .filter((post) => !((post.selftext || "").toLowerCase().includes("https://preview.redd.it")))
    .map((post, index) => {
      const permalink = post.permalink || ""
      const externalUrl = post.url?.trim()
      const safeExternalUrl =
        externalUrl && !isImageUrl(externalUrl) ? externalUrl : ""
      const rawSelftext = stripLinks(post.selftext?.trim() || "")

      return {
        id: post.id || `${selection}-reddit-${index}`,
      title: post.title?.trim() || "Untitled post",
      author: post.author || "unknown",
      subreddit: post.subreddit || "",
      permalink,
      url: safeExternalUrl,
      createdAt: post.created_utc ?? 0,
      score: post.score ?? 0,
      commentCount: post.num_comments ?? 0,
      selftext: isImageUrl(rawSelftext) ? "" : rawSelftext,
    }
    })

   
  const xItems = xPosts.map((post, index) => ({
    id: post.id || `${selection}-x-${index}`,
    text: stripLinks(post.text || "No post text provided."),
    author: post.user?.name || post.user?.username || "Unknown",
    username: post.user?.username || "unknown",
    url: post.url || (post.id ? `https://x.com/i/status/${post.id}` : "#"),
    publishedAt: post.created_at || "",
    likes: post.likes ?? 0,
    replies: post.replies ?? 0,
  }))
   
 /*
  const xItems = xPosts.map((post, index) => ({
  id: post.id || `${selection}-x-${index}`,
  text: stripLinks(post.text || "No post text provided."),
  author: post.user?.name || post.user?.username || "Unknown",
  username: post.user?.username || "unknown",
  url: post.url || `https://x.com/i/status/${post.id}`,
  publishedAt: post.created_at || "",
  likes: post.likes || 0,
  replies: post.replies || 0
}))
 */

  const jobItems = jobs.map((job, index) => ({
    id: job.job_id || job.job_apply_link || `${selection}-job-${index}`,
    title: job.job_title || "Untitled role",
    employer: job.employer_name || "Unknown employer",
    location: [job.job_city, job.job_country].filter(Boolean).join(", "),
    postedAt: job.job_posted_at_datetime_utc || "",
    description: stripLinks(job.job_description || "No description available."),
    applyLink: job.job_apply_link || "#",
    employmentType: job.job_employment_type || "",
  }))

  return {
    id: `echo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    selection: cleanSelection,
    redditSummary,
    redditItems,
    xSummary,
    xItems,
    newsSummary,
    marketSummary,
    jobSummary,
    jobItems,
    newsItems,
    timestamp: new Date().toISOString(),

  }
}
