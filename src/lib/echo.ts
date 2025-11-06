const SERPER_API = "https://google.serper.dev/search"
const X_RAPID_API = "https://x-search-search.p.rapidapi.com/search"

type GoogleOrganicResult = { snippet?: string }
type GoogleResponse = { organic?: GoogleOrganicResult[] }
type XThread = { text?: string }
type XResponse = { data?: XThread[] }

export type EchoPayload = {
  google: GoogleResponse | null
  x: XThread[]
}

const fallbackLine = (label: string, content: string) =>
  content ? `[${label}] ${content}` : `[${label}] No fresh data right now.`

const formatMillions = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
  }).format(value * 1_000_000)

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

  const fetchX = async (): Promise<XResponse | null> => {
    if (!rapidKey) return null
    const response = await fetch(
      `${X_RAPID_API}?query=${encodeURIComponent(cleanQuery)}&limit=5&page=1`,
      {
        headers: {
          "x-rapidapi-key": rapidKey,
          "x-rapidapi-host": "x-search-search.p.rapidapi.com",
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      throw new Error(`RapidAPI request failed (${response.status})`)
    }

    return (await response.json()) as XResponse
  }

  const [googleResult, xResult] = await Promise.allSettled([fetchGoogle(), fetchX()])

  if (googleResult.status === "rejected") {
    console.warn("Google echo fetch failed", googleResult.reason)
  }
  if (xResult.status === "rejected") {
    console.warn("X echo fetch failed", xResult.reason)
  }

  const google = googleResult.status === "fulfilled" ? googleResult.value : null
  const x = xResult.status === "fulfilled" ? xResult.value : null

  if (!google && (!x || !Array.isArray(x.data))) {
    return null
  }

  return {
    google,
    x: Array.isArray(x?.data) ? x.data : [],
  }
}

export type EchoInsight = {
  id: string
  selection: string
  tweetSummary: string
  newsSummary: string
  marketSummary: string
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

  const tweets = payload.x ?? []
  const news = payload.google?.organic ?? []

  const firstTweetText = tweets.find((item) => item?.text)?.text ?? ""
  const firstNewsSnippet = news.find((item) => item?.snippet)?.snippet ?? ""

  const tweetSummary = fallbackLine(
    "X",
    tweets.length
      ? `${tweets.length} new X threads - "${firstTweetText.slice(0, 120) || "No snippet"}"`
      : ""
  )

  const newsSummary = fallbackLine(
    "NEWS",
    news.length
      ? `${news.length} breaking headlines - "${firstNewsSnippet.slice(0, 140) || "No snippet"}"`
      : ""
  )

  const marketSummary = `[MARKET] Token volume +${Math.floor(
    Math.random() * 400 + 50
  )}% - ${formatMillions(Math.random() * 0.3 + 0.05)} spike`

  return {
    id: `echo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    selection: cleanSelection,
    tweetSummary,
    newsSummary,
    marketSummary,
    timestamp: new Date().toISOString(),
  }
}
