import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Waves, Sparkles, Loader2, X as CloseIcon } from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { buildEchoInsight, type EchoInsight } from "@/lib/echo"

const INITIAL_BATCH = 5
const SNIPPET_LIMIT = 500

type SectionKey = "reddit" | "news" | "jobs" | "market"
const SECTION_LABELS: Record<SectionKey, string> = {
  reddit: "Reddit",
  news: "News",
  jobs: "Jobs",
  market: "Market pulse",
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

export default function App() {
  const [echoCount, setEchoCount] = useState(0)
  const [echoes, setEchoes] = useState<EchoInsight[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [customQuery, setCustomQuery] = useState("")
  const [lastQuery, setLastQuery] = useState<string | null>(null)
  const [visibleRedditCounts, setVisibleRedditCounts] = useState<Record<string, number>>({})
  const [visibleNewsCounts, setVisibleNewsCounts] = useState<Record<string, number>>({})
  const [visibleJobCounts, setVisibleJobCounts] = useState<Record<string, number>>({})
  const [sectionVisibility, setSectionVisibility] = useState<Record<SectionKey, boolean>>({
    reddit: true,
    news: true,
    jobs: true,
    market: true,
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder:
          "Start typing, highlight a phrase, then smash the big echo button.",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[200px] max-h-[260px] overflow-auto text-base lg:text-lg",
      },
    },
  })

  useEffect(() => {
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
  }, [echoes])

  const computeContextQuery = () => {
    if (!editor) return null
    const { selection } = editor.state
    if (!selection.empty) {
      const highlighted = editor.state.doc.textBetween(selection.from, selection.to, " ").trim()
      if (highlighted) return highlighted
    }

    const currentParagraph = selection.$from.parent?.textContent?.trim()
    if (currentParagraph) return currentParagraph

    const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ").trim()
    return docText || null
  }

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
      setEchoCount((count) => count + 1)
      setLastQuery(trimmed)
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

  const handleEcho = async () => {
    if (isFetching) return
    const query = computeContextQuery()
    if (!query) {
      setFeedback("Type something in the editor first, then trigger an echo.")
      return
    }
    await runEcho(query)
  }

  const handleCustomEcho = async () => {
    if (isFetching) return
    const success = await runEcho(customQuery)
    if (success) {
      setCustomQuery("")
    }
  }

  const handleInstantEcho = async () => {
    if (isFetching) return
    const query = lastQuery ?? computeContextQuery()
    if (!query) {
      setFeedback("No previous query to replay yet. Try highlighting something or entering a custom phrase first.")
      return
    }
    await runEcho(query)
  }

  const loadMoreReddit = (id: string) =>
    setVisibleRedditCounts((prev) => ({
      ...prev,
      [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
    }))

  const loadMoreNews = (id: string) =>
    setVisibleNewsCounts((prev) => ({
      ...prev,
      [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
    }))

  const loadMoreJobs = (id: string) =>
    setVisibleJobCounts((prev) => ({
      ...prev,
      [id]: (prev[id] ?? INITIAL_BATCH) + INITIAL_BATCH,
    }))

  const toggleSection = (section: SectionKey) =>
    setSectionVisibility((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))

  const contextQueryPreview = computeContextQuery()

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-blue-950 text-white">
      <header className="sticky top-0 z-50 bg-gradient-to-br from-purple-950 via-indigo-950 to-blue-950/95 border-b border-white/10 shadow-2xl">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-6 grid gap-6 lg:grid-cols-3 items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-5">
              <Sparkles className="w-16 h-16 text-yellow-400 animate-pulse" />
              <h1 className="text-5xl sm:text-6xl font-black tracking-tight">Echo<br />Thread</h1>
            </div>
         
          </div>
          <div className="rounded-2xl border border-yellow-400/40 bg-yellow-500/10 px-6 py-5 text-center">
            <p className="text-sm uppercase tracking-wide text-yellow-200/80">Echoes triggered</p>
            <p className="text-4xl font-bold text-yellow-300">{echoCount}</p>
          </div>
          <motion.div
            initial={{ scale: 0, rotate: -360 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="flex justify-center lg:justify-end"
          >
            <Button
              onClick={handleEcho}
              disabled={isFetching}
              className="rounded-full w-24 h-24 lg:w-28 lg:h-28 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-4xl text-4xl font-black flex items-center justify-center disabled:opacity-70"
            >
              {isFetching ? (
                <Loader2 className="w-10 h-10 lg:w-12 lg:h-12 animate-spin" />
              ) : (
                <Waves className="w-12 h-12 lg:w-14 lg:h-14" />
              )}
            </Button>
          </motion.div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 lg:px-10 pt-28 pb-32 space-y-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl">
          <div className="px-6 lg:px-8 py-6 border-b border-white/10">
            <h2 className="text-2xl font-semibold">Signal filters</h2>
            <p className="text-sm text-white/70 mt-1">
              Choose which data sources appear on every echo card. Use this to focus on the feeds that matter
              for the current session.
            </p>
          </div>
          <div className="p-6 sm:p-8 grid gap-4 sm:grid-cols-2">
            {(["reddit", "news", "jobs", "market"] as SectionKey[]).map((section) => (
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
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl overflow-hidden">
          <div className="px-6 lg:px-8 py-6 border-b border-white/10 space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">Editor canvas</h2>
                   <p className="text-lg text-white/80 max-w-2xl">
              Highlight anything you've written and we'll surface the freshest social, news, and jobs that reference it.
            </p>
                <p className="text-sm text-white/70 mt-1">
                  Draft your notes, highlight any phrase, then hit the wave button to drop a live echo card into the feed.
                </p>
                
              </div>
            </div>
            <div className="p-6 sm:p-8 space-y-5">
              <EditorContent editor={editor} />
              <details className="rounded-2xl border border-white/10 bg-white/5 text-white/80">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white/70">
                  Custom echo controls
                </summary>
                <div className="px-4 sm:px-6 py-4 space-y-4">
                  <p className="text-xs text-white/60">
                    Prefer to query something other than the highlighted text? Drop it here or re-run your last echo instantly.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      value={customQuery}
                      onChange={(event) => setCustomQuery(event.target.value)}
                      placeholder="Type a keyword, ticker, or phrase..."
                      disabled={isFetching}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCustomEcho}
                      disabled={isFetching}
                    >
                      Custom echo
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleInstantEcho}
                      disabled={isFetching || (!lastQuery && !contextQueryPreview)}
                      className="justify-start sm:justify-center"
                    >
                      Instant echo
                    </Button>
                    <p className="text-xs text-white/50">
                      {lastQuery
                        ? `Last echo: "${lastQuery}"`
                        : "We reuse your latest selection or the current paragraph if nothing is highlighted."}
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {feedback && (
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/15 text-yellow-100 px-4 py-3 text-sm">
              {feedback}
            </div>
          )}

          {echoes.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 text-white/80 p-8 leading-relaxed shadow-2xl">
              &copy; Peter Eichhorst
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
                    <CloseIcon className="w-4 h-4" />
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
                        <p>{echo.tweetSummary}</p>
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

                    {sectionVisibility.news && (
                      <section className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-200/70">
                          News
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
                                Read more news
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
                      <section>
                        <p>{echo.marketSummary}</p>
                      </section>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
      </main>

    </div>
  )
}
