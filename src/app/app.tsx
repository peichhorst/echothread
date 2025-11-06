import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Waves, Sparkles, Loader2, X as CloseIcon } from "lucide-react"
import { motion } from "framer-motion"
import { useState } from "react"
import { buildEchoInsight, type EchoInsight } from "@/lib/echo"

export default function App() {
  const [echoCount, setEchoCount] = useState(0)
  const [echoes, setEchoes] = useState<EchoInsight[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [customQuery, setCustomQuery] = useState("")
  const [lastQuery, setLastQuery] = useState<string | null>(null)

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
          "prose prose-invert max-w-none focus:outline-none min-h-[60vh] text-base lg:text-lg",
      },
    },
  })

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
        setFeedback("No live signals right now. Give it another shot in a few seconds.")
        return false
      }

      setEchoes((prev) => [insight, ...prev])
      setEchoCount((count) => count + 1)
      setLastQuery(trimmed)
      return true
    } catch (error) {
      console.error("Echo fetch failed", error)
      setFeedback("We hit a snag fetching live data. Please try again shortly.")
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

  const contextQueryPreview = computeContextQuery()

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-blue-950 text-white">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 pt-20 pb-32 space-y-12">
        <header className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg p-10 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-5">
                <Sparkles className="w-16 h-16 text-yellow-400 animate-pulse" />
                <h1 className="text-5xl sm:text-6xl font-black tracking-tight">
                  EchoThread
                </h1>
              </div>
              <p className="mt-4 text-lg text-white/80 max-w-2xl">
                Highlight anything you've written and we'll surface the freshest social, news, and market signals that reference it.
              </p>
            </div>
            <div className="rounded-2xl border border-yellow-400/40 bg-yellow-500/10 px-6 py-5 text-center">
              <p className="text-sm uppercase tracking-wide text-yellow-200/80">Echoes triggered</p>
              <p className="text-4xl font-bold text-yellow-300">{echoCount}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 border-b border-white/10">
              <h2 className="text-2xl font-semibold">Editor canvas</h2>
              <p className="text-sm text-white/70 mt-1">
                Draft your notes, highlight any phrase, then hit the wave button to drop a live echo card into the feed.
              </p>
            </div>
            <div className="p-6 sm:p-8">
              <EditorContent editor={editor} />
            </div>
          </div>

          <aside className="space-y-6">
            {feedback && (
              <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/15 text-yellow-100 px-4 py-3 text-sm">
                {feedback}
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl space-y-4">
              <div>
                <p className="text-sm font-semibold text-white/80 uppercase tracking-wide">
                  Custom echo
                </p>
                <p className="text-xs text-white/60 mt-1">
                  Prefer to query something other than the highlighted text? Drop it here or re-run your last echo instantly.
                </p>
              </div>
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

            {echoes.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 text-white/80 p-8 leading-relaxed shadow-2xl">
                Highlight any text in the editor and press the wave button. The live feed will populate with signal cards pulling directly from your configured APIs.
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
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
                    <div>
                      <p className="text-xs uppercase tracking-wide text-purple-200/70">Echo request</p>
                      <h3 className="text-xl font-bold text-purple-50 mt-1">
                        "{echo.selection}"
                      </h3>
                    </div>
                    <div className="space-y-3 text-purple-50/90 text-sm leading-relaxed">
                      <p>{echo.tweetSummary}</p>
                      <p>{echo.newsSummary}</p>
                      <p>{echo.marketSummary}</p>
                    </div>
                    <p className="text-xs text-purple-200/60 mt-auto">
                      {new Date(echo.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      <motion.div
        initial={{ scale: 0, rotate: -360 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="fixed bottom-6 right-6 sm:bottom-10 sm:right-10 z-50"
      >
        <Button
          onClick={handleEcho}
          disabled={isFetching}
          className="rounded-full w-32 h-32 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-4xl text-6xl font-black flex items-center justify-center disabled:opacity-70"
        >
          {isFetching ? (
            <Loader2 className="w-16 h-16 animate-spin" />
          ) : (
            <Waves className="w-20 h-20" />
          )}
        </Button>
      </motion.div>
    </div>
  )
}
