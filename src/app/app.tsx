import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Waves, Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"
import { buildEchoInsight, type EchoInsight } from "@/lib/echo"

const INITIAL_BATCH = 5
const SNIPPET_LIMIT = 500

type SectionKey = "reddit" | "x" | "grok" | "news" | "youtube" | "kalshi" | "jobs" | "market"
const SECTION_LABELS: Record<SectionKey, string> = {
  reddit: "Reddit",
  x: "X",
  grok: "Grok",
  news: "Google",
  youtube: "YouTube",
  kalshi: "Kalshi",
  jobs: "Jobs",
  market: "Polymarket",
}
const SECTION_STORAGE_KEY = "echothread-section-visibility"

const createDefaultSections = (): Record<SectionKey, boolean> => ({
  reddit: true,
  x: true,
  grok: true,
  news: true,
  youtube: true,
  kalshi: true,
  jobs: true,
  market: true,
})

const readStoredSections = (): Record<SectionKey, boolean> => {
  const base = createDefaultSections()
  if (typeof window === "undefined") return base
  try {
    const raw = window.localStorage.getItem(SECTION_STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean" && (SECTION_LABELS as Record<string, string>)[key]) {
        base[key as SectionKey] = value
      }
    }
  } catch (error) {
    console.warn("Failed to parse section preferences", error)
  }
  return base
}

const truncate = (text: string) =>
  text.length > SNIPPET_LIMIT ? `${text.slice(0, SNIPPET_LIMIT)}…` : text

const formatDateTime = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "" || value === 0) {
    return ""
  }

  let date: Date | null = null

  if (typeof value === "number") {
    date = new Date(value > 1e12 ? value : value * 1000)
  } else {
    const trimmed = value.trim()
    if (!trimmed) return ""

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed)
      date = new Date(trimmed.length > 12 ? numeric : numeric * 1000)
    } else {
      date = new Date(trimmed)
    }
  }

  if (!date || Number.isNaN(date.getTime())) return ""

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

const formatPercentValue = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

const formatFractionPercent = (fraction?: number | null) =>
  fraction === null || fraction === undefined ? "—" : formatPercentValue(fraction * 100)

const formatChangeValue = (fraction?: number | null) => {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return ""
  const percent = Math.round(fraction * 10000) / 100
  const sign = percent > 0 ? "+" : ""
  return `${sign}${percent}%`
}

const formatVolumeValue = (value?: number | null) => {
  if (!value || Number.isNaN(value)) return ""
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${Math.round(value)}`
}

export default function App() {
  const [echoes, setEchoes] = useState<EchoInsight[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [customQuery, setCustomQuery] = useState("")
  const [visibleRedditCounts, setVisibleRedditCounts] = useState<Record<string, number>>({})
  const [visibleXCounts, setVisibleXCounts] = useState<Record<string, number>>({})
  const [visibleNewsCounts, setVisibleNewsCounts] = useState<Record<string, number>>({})
  const [visibleJobCounts, setVisibleJobCounts] = useState<Record<string, number>>({})
  const [visibleYoutubeCounts, setVisibleYoutubeCounts] = useState<Record<string, number>>({})
  const [visibleMarketCounts, setVisibleMarketCounts] = useState<Record<string, number>>({})
  const [visibleKalshiCounts, setVisibleKalshiCounts] = useState<Record<string, number>>({})
  const [sectionVisibility, setSectionVisibility] = useState<Record<SectionKey, boolean>>(
    readStoredSections
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sectionVisibility))
    } catch (error) {
      console.warn("Failed to persist section preferences", error)
    }
  }, [sectionVisibility])

  useEffect(() => {
    setVisibleXCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
    setVisibleRedditCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
    setVisibleNewsCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
    setVisibleJobCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
    setVisibleYoutubeCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
    setVisibleKalshiCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
    setVisibleMarketCounts((prev) => {
      const next: Record<string, number> = {}
      for (const echo of echoes) {
        next[echo.id] = prev[echo.id] ?? INITIAL_BATCH
      }
      return next
    })
  }, [echoes])

  const runEcho = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      setFeedback("Need some text to echo. Highlight something or enter a custom phrase.")
      return false
    }

    setFeedback(null)
    setIsFetching(true)
    try {
      const insight = await buildEchoInsight(trimmed)
      if (!insight) {
        setFeedback("No live signals returned. Try a broader search or check your API keys.")
        return false
      }

      setEchoes((prev) => [insight, ...prev])
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error"
      console.error("Echo fetch failed", error)
      setFeedback(`Live data request failed: ${message}`)
      return false
    } finally {
      setIsFetching(false)
    }
  }

  const loadMoreReddit = (id: string) =>
    setVisibleRedditCounts((prev) => ({
      ...prev,
      [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
    }))

  const loadMoreX = (id: string) =>
    setVisibleXCounts((prev) => ({
      ...prev,
      [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
    }))


const loadMoreNews = (id: string) =>
  setVisibleNewsCounts((prev) => ({
    ...prev,
    [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
  }))

const loadMoreYoutube = (id: string) =>
  setVisibleYoutubeCounts((prev) => ({
    ...prev,
    [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
  }))

const loadMoreKalshi = (id: string) =>
  setVisibleKalshiCounts((prev) => ({
    ...prev,
    [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
  }))

const loadMoreJobs = (id: string) =>
  setVisibleJobCounts((prev) => ({
    ...prev,
    [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
  }))

const loadMoreMarkets = (id: string) =>
  setVisibleMarketCounts((prev) => ({
    ...prev,
    [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
  }))

  const toggleSection = (section: SectionKey) =>
    setSectionVisibility((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-blue-950 text-white overflow-x-hidden flex flex-col">
      <header className="sticky top-0 z-50 bg-gradient-to-br from-purple-950 via-indigo-950 to-blue-950/95 border-b border-white/10 shadow-2xl">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-6 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-5">
                <Sparkles className="w-12 h-12 text-yellow-400 animate-pulse" />
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
                  Echo<span className="text-yellow-400">&nbsp;</span>Thread
                </h1>
              </div>
            </div>
            <div className="w-full lg:max-w-2xl lg:flex-1">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Input
                  value={customQuery}
                  onChange={(event) => setCustomQuery(event.target.value)}
                  placeholder="Global echo... type anything"
                  disabled={isFetching}
                  className="bg-transparent border-white/20 flex-1 min-w-0 text-base sm:text-lg py-3"
                />
                <Button
                  type="button"
                  onClick={() => runEcho(customQuery)}
                  disabled={isFetching || !customQuery.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-400 text-white font-semibold w-full sm:w-auto flex items-center gap-2"
                >
                  {isFetching ? (
                    <div className="animate-spin">
                      <Waves className="w-5 h-5" />
                    </div>
                  ) : (
                    <Waves className="w-5 h-5" />
                  )}
                  Echo
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl p-6">
            <h2 className="text-2xl font-semibold mb-4">Signal filters</h2>
            <p className="text-sm text-white/70 mb-4">
              Choose which data sources appear on every echo card. Use this to focus on the feeds that matter
              for the current session.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["reddit", "x", "grok", "news", "youtube", "kalshi", "jobs", "market"] as SectionKey[]).map(
                (section) => (
                  <label
                    key={section}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/30 bg-transparent text-purple-500 focus:ring-purple-400"
                      checked={sectionVisibility[section]}
                      onChange={() => toggleSection(section)}
                    />
                    <span>{SECTION_LABELS[section]}</span>
                  </label>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 lg:px-10 pt-8 pb-6 flex flex-col">
        <section className="mt-auto flex flex-col gap-6 w-full">
        {feedback && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/15 text-yellow-100 px-4 py-3 text-sm">
            {feedback}
          </div>
        )}

        {echoes.length === 0 ? (
          <div className="flex items-end">
            <div className="rounded-3xl border border-white/10 bg-white/5 text-white/80 p-8 leading-relaxed shadow-2xl w-full">
              &copy; Peter Eichhorst
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {echoes.map((echo) => (
              <article
                key={echo.id}
                className="rounded-3xl border border-purple-500/40 bg-purple-900/40 backdrop-blur-md shadow-2xl p-6 flex flex-col gap-4 relative"
              >
                <button
                  type="button"
                  onClick={() =>
                    setEchoes((prev) => prev.filter((item) => item.id !== echo.id))
                  }
                  className="absolute top-4 right-4 rounded-full border border-purple-300/30 bg-purple-900/60 p-1 text-purple-200 hover:bg-purple-800 hover:text-white transition"
                  aria-label="Remove echo card"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-purple-200/60">
                    {new Date(echo.timestamp).toLocaleString()}
                  </p>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-purple-200/70">Echo request</p>
                    <h3 className="text-xl font-bold text-purple-50 mt-1">
                      "{echo.selection}"
                    </h3>
                  </div>
                </div>
                <div className="space-y-4 text-purple-50/90 text-sm leading-relaxed">
                    {sectionVisibility.reddit && (
                      <section className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                          Reddit
                        </h4>
                        <p>{echo.redditSummary}</p>
                        {echo.redditItems.length > 0 && (
                          <div className="space-y-2">
                            {echo.redditItems
                              .slice(0, visibleRedditCounts[echo.id] ?? INITIAL_BATCH)
                              .map((item) => {
                              const createdAtDisplay = formatDateTime(item.createdAt)
                              return (
                                <article
                                  key={item.id}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 space-y-1.5"
                                >
                                  <a
                                    href={
                                      item.url ||
                                      (item.permalink
                                        ? `https://reddit.com${item.permalink}`
                                        : "#")
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-purple-50 hover:text-white transition"
                                  >
                                    {item.title}
                                  </a>
                                  <p className="text-[11px] uppercase tracking-wide text-purple-200/60">
                                    {item.subreddit ? `r/${item.subreddit}` : "Reddit"} •{" "}
                                    {item.author}
                                  </p>
                                  {createdAtDisplay && (
                                    <p className="text-[11px] text-purple-200/70">
                                      {createdAtDisplay}
                                    </p>
                                  )}
                                  <p className="text-xs text-purple-200/80 whitespace-pre-line leading-relaxed">
                                    {truncate(item.selftext)}
                                  </p>
                                </article>
                              )
                            })}
                          {echo.redditItems.length >
                            (visibleRedditCounts[echo.id] ?? INITIAL_BATCH) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-purple-200"
                              onClick={() => loadMoreReddit(echo.id)}
                            >
                              Read more Reddit posts
                            </Button>
                          )}
                        </div>
                        )}
                      </section>
                    )}

                    {sectionVisibility.x && (
                      <section className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                          X
                        </h4>
                        <p>{echo.xSummary}</p>
                        {echo.xItems.length > 0 && (
                          <div className="space-y-2">
                            {echo.xItems
                              .slice(0, visibleXCounts[echo.id] ?? INITIAL_BATCH)
                              .map((item) => (
                                <article
                                  key={item.id}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 space-y-1.5"
                                >
                                  <p className="text-sm text-purple-50">
                                    {truncate(item.text || "No content available.")}
                                  </p>
                                  <p className="text-[11px] uppercase tracking-wide text-purple-200/60 flex flex-wrap gap-1">
                                    <span>{item.author || "Unknown"}</span>
                                    {item.username && <span>• @{item.username}</span>}
                                    {item.publishedAt && (
                                      <span>
                                        • {new Date(item.publishedAt).toLocaleString()}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-purple-200/70">
                                    ❤️ {item.likes ?? 0} • 💬 {item.replies ?? 0}
                                  </p>
                                  {item.url && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-purple-200 underline"
                                    >
                                      View thread
                                    </a>
                                  )}
                                </article>
                              ))}
                            {echo.xItems.length >
                              (visibleXCounts[echo.id] ?? INITIAL_BATCH) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs text-purple-200"
                                onClick={() => loadMoreX(echo.id)}
                              >
                                Read more X posts
                              </Button>
                            )}
                          </div>
                        )}
                      </section>
                    )}

                    {sectionVisibility.grok && (
                      <section className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                          Grok
                        </h4>
                        <p>{echo.grokSummary}</p>
                        {echo.grokAI?.takeaways && echo.grokAI.takeaways.length > 0 && (
                          <ul className="text-xs text-purple-200/80 list-disc list-inside space-y-1">
                            {echo.grokAI.takeaways.map((item, idx) => (
                              <li key={`${echo.id}-grok-tip-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        )}
                        {echo.grokAI?.sentiment && (
                          <p className="text-[11px] uppercase tracking-wide text-purple-200/60">
                            Sentiment: {echo.grokAI.sentiment}
                          </p>
                        )}
                      </section>
                    )}

                    {sectionVisibility.news && (
                      <section className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                          Google
                        </h4>
                        <p>{echo.newsSummary}</p>
                      {echo.newsItems.length > 0 && (
                        <div className="space-y-2">
                          {echo.newsItems
                            .slice(0, visibleNewsCounts[echo.id] ?? INITIAL_BATCH)
                            .map((item) => {
                              const publishedAtDisplay = formatDateTime(item.publishedAt)
                              return (
                                <article
                                  key={item.id}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 space-y-2"
                                >
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-purple-50 hover:text-white transition"
                                  >
                                    {item.title}
                                  </a>
                                  <p className="text-xs text-purple-200/70 flex flex-wrap gap-1">
                                    <span>{item.source}</span>
                                    {publishedAtDisplay && (
                                      <>
                                        <span>•</span>
                                        <span className="text-purple-200/60">
                                          {publishedAtDisplay}
                                        </span>
                                      </>
                                    )}
                                  </p>
                                  <p className="text-xs text-purple-200/80 whitespace-pre-line leading-relaxed">
                                    {truncate(item.snippet)}
                                  </p>
                                </article>
                              )
                            })}
                          {echo.newsItems.length >
                            (visibleNewsCounts[echo.id] ?? INITIAL_BATCH) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs text-purple-200"
                                onClick={() => loadMoreNews(echo.id)}
                              >
                                Read more Google results
                              </Button>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {sectionVisibility.youtube && (
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                        YouTube
                      </h4>
                      <p>{echo.youtubeSummary}</p>
                      {echo.youtubeItems.length > 0 && (
                        <div className="space-y-2">
                          {echo.youtubeItems
                            .slice(0, visibleYoutubeCounts[echo.id] ?? INITIAL_BATCH)
                            .map((video) => {
                              const publishedAtDisplay = formatDateTime(video.publishedAt)
                              return (
                                <article
                                  key={video.id}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 flex gap-3"
                                >
                                  {video.thumbnail && (
                                    <a
                                      href={video.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-shrink-0 w-28 h-20 overflow-hidden rounded-lg border border-purple-400/20"
                                    >
                                      <img
                                        src={video.thumbnail}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </a>
                                  )}
                                  <div className="space-y-1">
                                    <a
                                      href={video.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold text-purple-50 hover:text-white transition"
                                    >
                                      {video.title}
                                    </a>
                                    <p className="text-[11px] uppercase tracking-wide text-purple-200/60">
                                      {video.channel}
                                      {publishedAtDisplay && ` • ${publishedAtDisplay}`}
                                    </p>
                                    <p className="text-xs text-purple-200/80">
                                      {truncate(video.description)}
                                    </p>
                                  </div>
                                </article>
                              )
                            })}
                          {echo.youtubeItems.length >
                            (visibleYoutubeCounts[echo.id] ?? INITIAL_BATCH) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-purple-200"
                              onClick={() => loadMoreYoutube(echo.id)}
                            >
                              Watch more videos
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                    {sectionVisibility.kalshi && (
                      <section className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                          Kalshi
                        </h4>
                        <p>{echo.kalshiSummary}</p>
                        {echo.kalshiItems.length > 0 && (
                          <div className="space-y-2">
                            {echo.kalshiItems
                              .slice(0, visibleKalshiCounts[echo.id] ?? INITIAL_BATCH)
                              .map((market, idx) => (
                                <article
                                  key={`${market.id}-${idx}`}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <a
                                        href={market.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold text-purple-50 hover:text-white transition"
                                      >
                                        {market.title}
                                      </a>
                                      {market.eventTitle && (
                                        <a
                                          href={market.eventUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] text-purple-200/70 underline-offset-2 hover:underline"
                                        >
                                          {market.eventTitle}
                                        </a>
                                      )}
                                    </div>
                                    <span className="text-[11px] uppercase tracking-wide text-purple-200/60">
                                      {market.category || "Kalshi"}
                                    </span>
                                  </div>
                                  {market.matchType === "fallback" && (
                                    <p className="text-[11px] text-amber-300 uppercase tracking-wide">
                                      Similar high-volume market (no direct match)
                                    </p>
                                  )}
                                  <p className="text-xs text-purple-200/80 flex flex-wrap gap-3">
                                    <span>YES {market.yesPrice}%</span>
                                    <span>NO {market.noPrice}%</span>
                                    <span>Vol {formatVolumeValue(market.volume)}</span>
                                  </p>
                                </article>
                              ))}
                          {echo.kalshiItems.length >
                            (visibleKalshiCounts[echo.id] ?? INITIAL_BATCH) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-purple-200"
                              onClick={() => loadMoreKalshi(echo.id)}
                            >
                              See more Kalshi markets
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {sectionVisibility.jobs && (
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                        Jobs
                      </h4>
                      <p>{echo.jobSummary}</p>
                      {echo.jobItems.length > 0 && (
                        <div className="space-y-2">
                          {echo.jobItems
                            .slice(0, visibleJobCounts[echo.id] ?? INITIAL_BATCH)
                            .map((job) => {
                              const jobPostedAt = formatDateTime(job.postedAt)
                              return (
                                <article
                                  key={job.id}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 space-y-2"
                                >
                                  <a
                                    href={job.applyLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-purple-50 hover:text-white transition"
                                  >
                                    {job.title}
                                  </a>
                                  <p className="text-xs text-purple-200/70">
                                    {job.employer}
                                    {job.location ? ` • ${job.location}` : ""}
                                    {jobPostedAt ? ` • ${jobPostedAt}` : ""}
                                    {job.employmentType ? ` • ${job.employmentType}` : ""}
                                  </p>
                                  <p className="text-xs text-purple-200/80 whitespace-pre-line leading-relaxed">
                                    {truncate(job.description)}
                                  </p>
                                </article>
                              )
                            })}
                          {echo.jobItems.length >
                            (visibleJobCounts[echo.id] ?? INITIAL_BATCH) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-purple-200"
                              onClick={() => loadMoreJobs(echo.id)}
                            >
                              Read more jobs
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {sectionVisibility.market && (
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                        Market
                      </h4>
                      <p>{echo.marketSummary}</p>
                      {echo.marketItems.length > 0 && (
                        <div className="space-y-2">
                          {echo.marketItems
                            .slice(0, visibleMarketCounts[echo.id] ?? INITIAL_BATCH)
                            .map((item) => {
                              const closesAtDisplay = formatDateTime(item.closesAt)
                              const probabilityDisplay = formatPercentValue(item.probability)
                              const changeDisplay = formatChangeValue(item.change24h)
                              const volumeDisplay = formatVolumeValue(item.volume24h)
                              const bidDisplay = formatFractionPercent(item.bestBid)
                              const askDisplay = formatFractionPercent(item.bestAsk)
                              return (
                                <article
                                  key={item.id}
                                  className="border border-purple-300/20 rounded-xl bg-purple-900/30 p-4 space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold text-purple-50 hover:text-white transition"
                                      >
                                        {item.title}
                                      </a>
                                      {item.group && (
                                        <p className="text-[11px] uppercase tracking-wide text-purple-200/60">
                                          {item.group}
                                        </p>
                                      )}
                                    </div>
                                    {item.icon && (
                                      <img
                                        src={item.icon}
                                        alt=""
                                        className="w-10 h-10 rounded-lg object-cover border border-purple-400/20"
                                      />
                                    )}
                                  </div>
                                  <div className="text-xs text-purple-200/80 flex flex-wrap gap-3">
                                    <span className="font-semibold text-purple-50">
                                      Odds {probabilityDisplay}
                                    </span>
                                    {changeDisplay && (
                                      <span
                                        className={
                                          changeDisplay.startsWith("+")
                                            ? "text-emerald-300"
                                            : "text-rose-300"
                                        }
                                      >
                                        {changeDisplay} 24h
                                      </span>
                                    )}
                                    {volumeDisplay && <span>Vol {volumeDisplay}</span>}
                                  </div>
                                  <div className="text-[11px] text-purple-200/70 flex flex-wrap gap-3">
                                    <span>Bid {bidDisplay}</span>
                                    <span>Ask {askDisplay}</span>
                                    {closesAtDisplay && <span>Closes {closesAtDisplay}</span>}
                                  </div>
                                  {item.advice && (
                                    <p className="text-xs text-purple-100/80 italic">{item.advice}</p>
                                  )}
                                </article>
                              )
                            })}
                          {echo.marketItems.length >
                            (visibleMarketCounts[echo.id] ?? INITIAL_BATCH) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-purple-200"
                              onClick={() => loadMoreMarkets(echo.id)}
                            >
                              Track more markets
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        </section>
      </main>

    </div>
  )
}
