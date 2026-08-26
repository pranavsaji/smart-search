'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Clock, AtSign, Terminal, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const SLASH_COMMANDS = [
  { cmd: '\\reset',        desc: 'Clear the current session and start fresh' },
  { cmd: '\\save-session', desc: 'Save this session to your chat history' },
  { cmd: '\\home',         desc: 'Return to the home screen' },
  { cmd: '\\exit',         desc: 'Save and exit the current stage' },
]

const DEFAULT_EXAMPLES = [
  'Plan a 3-day Paris trip with @alex — flights from London, mid-range hotel',
  'Find me a beach vacation for 2 in Bali, luxury, next month',
  'Weekend in Amsterdam with @sarah — budget friendly, include experiences',
  'Solo trip to Tokyo for 5 days — culture, food, no car needed',
]

interface RecentSearch {
  stageId: string
  prompt: string
  destination: string
  createdAt: string
}

interface UserSuggestion {
  handle: string
  name?: string
}

interface MentionState {
  query: string
  startIndex: number
}

interface IntentInputProps {
  userId?: string
  handle?: string
  className?: string
  examples?: string[]
  /** Pre-fills the box without submitting — see initialPrompt handling below. */
  initialPrompt?: string
}

interface ClarificationState {
  question: string       // what Smart Search is asking
  previousPrompt: string // the user's original message
}

export function IntentInput({ userId, handle, className, examples, initialPrompt }: IntentInputProps) {
  const EXAMPLES = examples ?? DEFAULT_EXAMPLES
  // Seeded once as initial state rather than in an effect: an effect would
  // clobber whatever the user had already started typing.
  const [value, setValue] = useState(initialPrompt ?? '')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const [statusText, setStatusText] = useState<string | null>(null)
  const [clarification, setClarification] = useState<ClarificationState | null>(null)

  // @mention state
  const [mention, setMention] = useState<MentionState | null>(null)
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [suggestionIndex, setSuggestionIndex] = useState(0)

  // slash command state
  const [showCommands, setShowCommands] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const uid = userId ?? 'anonymous'
    fetch(`/api/searches?userId=${uid}`)
      .then(r => r.json())
      .then(d => setRecentSearches(d.searches ?? []))
      .catch(() => {})
  }, [userId])

  // Fetch user suggestions when mention query changes
  useEffect(() => {
    if (!mention) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    fetch(`/api/users/search?q=${encodeURIComponent(mention.query)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setSuggestions((d.users ?? []).filter((u: UserSuggestion) => u?.handle)); setSuggestionIndex(0) })
      .catch(() => {})
    return () => controller.abort()
  }, [mention?.query])

  /** Detect if cursor is inside an @word and return the mention state. */
  const detectMention = (text: string, cursor: number): MentionState | null => {
    const before = text.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    if (!match) return null
    return { query: match[1], startIndex: match.index! }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    autoResize()
    setMention(detectMention(newValue, e.target.selectionStart ?? newValue.length))

    // Slash command detection
    if (newValue.startsWith('\\')) {
      setShowCommands(true)
      setCommandFilter(newValue.slice(1).toLowerCase())
      setCommandIndex(0)
    } else {
      setShowCommands(false)
      setCommandFilter('')
    }
  }

  /** Insert a chosen @handle at the current mention position. */
  const selectSuggestion = useCallback((user: UserSuggestion) => {
    if (!mention) return
    const before = value.slice(0, mention.startIndex)
    const after = value.slice(mention.startIndex + 1 + mention.query.length) // +1 for the @
    const inserted = `@${user.handle} `
    const newValue = before + inserted + after
    setValue(newValue)
    setMention(null)
    setSuggestions([])
    // Restore focus + move cursor after inserted text
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const pos = before.length + inserted.length
      el.setSelectionRange(pos, pos)
      autoResize()
    })
  }, [mention, value])

  const filteredCommands = SLASH_COMMANDS.filter(c =>
    c.cmd.slice(1).startsWith(commandFilter)
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command keyboard navigation
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIndex(i => (i + 1) % filteredCommands.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCommandIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && filteredCommands.length === 1)) {
        e.preventDefault()
        setValue(filteredCommands[commandIndex].cmd)
        setShowCommands(false)
        return
      }
      if (e.key === 'Escape') { setShowCommands(false); return }
    }

    // @mention keyboard navigation
    if (mention && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(suggestions[suggestionIndex]); return }
      if (e.key === 'Escape') { setMention(null); setSuggestions([]); return }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSubmit = useCallback(async () => {
    const prompt = value.trim()
    if (!prompt || loading) return
    setMention(null)
    setSuggestions([])
    setShowCommands(false)
    setLoading(true)

    try {
      setStatusText('Resolving @mentions…')
      const resolveRes = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      }).catch(() => null)
      const resolveData = resolveRes?.ok ? await resolveRes.json() : {}

      setStatusText('Parsing intent…')

      // If we're answering a clarification, send the full conversation thread
      const intentBody = clarification
        ? {
            messages: [
              { role: 'user', content: clarification.previousPrompt },
              { role: 'assistant', content: clarification.question },
              { role: 'user', content: prompt },
            ],
            userId,
            handle: handle ?? 'me',
            resolverContext: resolveData.enrichedPrompt ?? null,
          }
        : {
            prompt,
            userId,
            handle: handle ?? 'me',
            resolverContext: resolveData.enrichedPrompt ?? null,
          }

      // Route through clarify page for rich intent refinement
      // (skip if this is already a clarification answer — send straight to stage)
      if (!clarification) {
        setClarification(null)
        router.push(`/clarify?q=${encodeURIComponent(prompt)}`)
        return
      }

      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intentBody),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to parse intent')

      if (data.clarificationNeeded) {
        setClarification({
          question: data.clarificationMessage ?? 'Could you give me more details?',
          previousPrompt: clarification.previousPrompt,
        })
        setValue('')
        setStatusText(null)
        setLoading(false)
        setTimeout(() => textareaRef.current?.focus(), 50)
        return
      }

      setClarification(null)
      setStatusText('Assembling results…')
      router.push(`/stage/${data.stageId}`)
    } catch (err) {
      toast.error(String(err))
      setStatusText(null)
      setLoading(false)
    }
  }, [value, loading, userId, handle, router, clarification])

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const showDropdown = !!mention && suggestions.length > 0

  return (
    <div className={cn('w-full', className)}>
      {/* Input box */}
      <div
        className={cn(
          'relative rounded-2xl border-2 transition-all duration-300',
          focused
            ? 'border-blue-400 bg-white shadow-xl shadow-blue-500/15 glow'
            : 'border-blue-100 bg-white hover:border-blue-200'
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setTimeout(() => { setMention(null); setSuggestions([]) }, 150)
          }}
          placeholder={clarification ? 'Type your answer…' : "What do you want? e.g. 'Paris trip with @alex next month' or 'find a dentist near me'…"}
          className="w-full resize-none rounded-2xl bg-transparent px-6 py-5 pr-20 text-base leading-relaxed text-foreground placeholder:text-slate-400 focus:outline-none min-h-[72px]"
          rows={1}
          disabled={loading}
        />

        <button
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className={cn(
            'absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200',
            value.trim() && !loading
              ? 'bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary/90 hover:scale-105'
              : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50'
          )}
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <ArrowRight className="h-4 w-4" />
          }
        </button>
      </div>

      {/* Slash command popover */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl shadow-blue-500/10">
          {filteredCommands.map((c, i) => (
            <button
              key={c.cmd}
              onMouseDown={e => { e.preventDefault(); setValue(c.cmd); setShowCommands(false) }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                i === commandIndex ? 'bg-blue-50 text-foreground' : 'text-foreground/80 hover:bg-slate-50'
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-mono text-primary">
                <Terminal className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-mono font-medium text-sm">{c.cmd}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.desc}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Inline clarification bubble */}
      {clarification && !loading && (
        <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary mb-0.5">Smart Search needs one more thing</p>
            <p className="text-sm text-foreground/90">{clarification.question}</p>
          </div>
          <button
            onClick={() => { setClarification(null); setValue('') }}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Status text during loading */}
      {loading && statusText && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce [animation-delay:-0.3s]">·</span>
            <span className="animate-bounce [animation-delay:-0.15s]">·</span>
            <span className="animate-bounce">·</span>
          </span>
          {statusText}
        </div>
      )}

      {/* @mention dropdown */}
      {showDropdown && (
        <div
          ref={mentionRef}
          className="mt-1 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl shadow-blue-500/10"
        >
          {suggestions.map((user, i) => (
            <button
              key={user.handle}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(user) }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                i === suggestionIndex ? 'bg-blue-50 text-foreground' : 'text-foreground/80 hover:bg-slate-50'
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-primary">
                {user.handle?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium">@{user.handle}</span>
                {user.name && <span className="ml-2 text-xs text-muted-foreground truncate">{user.name}</span>}
              </div>
              <AtSign className="h-3.5 w-3.5 shrink-0 text-primary/50" />
            </button>
          ))}
        </div>
      )}

      {/* Recent searches */}
      {!value && !loading && recentSearches.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="h-3 w-3 text-slate-400" />
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Recent searches</span>
          </div>
          <div className="flex flex-col gap-1">
            {recentSearches.slice(0, 4).map(s => (
              <button
                key={s.stageId}
                onClick={() => router.push(`/stage/${s.stageId}`)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-blue-50"
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                <span className="truncate text-sm text-slate-500 hover:text-slate-700">
                  {s.prompt.length > 80 ? s.prompt.slice(0, 77) + '…' : s.prompt}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Example prompts */}
      {!value && !loading && recentSearches.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => { setValue(ex); textareaRef.current?.focus() }}
              className="rounded-full border border-blue-100 bg-blue-50/70 px-3.5 py-1.5 text-xs text-slate-600 transition-all duration-150 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-700"
            >
              {ex.length > 52 ? ex.slice(0, 49) + '…' : ex}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
