'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Zap, Send, Loader2, Sparkles, Search, ArrowLeft, User, MapPin, Wallet, Shirt, SquarePen } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = [
  { label: 'Plan a weekend trip', icon: '✈️' },
  { label: 'Find a doctor near me', icon: '🏥' },
  { label: 'My travel preferences?', icon: '🎯' },
  { label: 'Book a home repair', icon: '🔧' },
  { label: 'Recommend a restaurant', icon: '🍽️' },
  { label: 'Shopping suggestions', icon: '🛍️' },
]

function MessageContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*\[Search: "([^"]+)"\]\*\*)/g)
  const router = useRouter()
  const nodes: React.ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (i % 3 === 1) {
      const query = parts[i + 1]
      nodes.push(
        <button
          key={i}
          onClick={() => router.push(`/clarify?q=${encodeURIComponent(query)}`)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors my-0.5"
        >
          <Search className="h-3 w-3" /> {query}
        </button>
      )
      i++
    } else if (i % 3 === 0) {
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g)
      boldParts.forEach((bp, bi) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          nodes.push(<strong key={`${i}-${bi}`}>{bp.slice(2, -2)}</strong>)
        } else {
          nodes.push(<span key={`${i}-${bi}`} className="whitespace-pre-wrap">{bp}</span>)
        }
      })
    }
  }

  return <>{nodes}</>
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

export default function GeniePage() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const userName = session?.user?.name ?? 'there'
  const userInitial = userName.charAt(0).toUpperCase()

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Hey ${userName}! I'm Genie — your personal concierge. I know your travel style, budget preferences, and booking history.\n\nAsk me anything: plan a trip, find a doctor, recommend restaurants, or just tell me what you need.`,
    }])
  }, [userName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return

    const userMsg: Message = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/genie/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: accumulated }])
      }
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }, [input, messages, streaming])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const hasUserMessages = messages.some(m => m.role === 'user')

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Smart Search
          </Link>
          <button
            onClick={() => setMessages([{
              role: 'assistant',
              content: `Hey ${userName}! I'm Genie — your personal concierge. I know your travel style, budget preferences, and booking history.\n\nAsk me anything: plan a trip, find a doctor, recommend restaurants, or just tell me what you need.`,
            }])}
            title="New chat"
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <SquarePen className="h-3.5 w-3.5" /> New chat
          </button>
        </div>

        {/* Genie identity */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm">Genie</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] text-muted-foreground">Online</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your personal AI concierge with full context of your profile, preferences, and history.
          </p>
        </div>

        {/* User context */}
        {session?.user && (
          <div className="p-5 border-b border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Context</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {userInitial}
                </div>
                <span className="truncate font-medium text-foreground">{userName}</span>
              </div>
              {[
                { icon: User, label: 'Profile loaded' },
                { icon: MapPin, label: 'Destinations indexed' },
                { icon: Wallet, label: 'Spend signals active' },
                { icon: Shirt, label: 'Style profile ready' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick prompts */}
        <div className="p-5 flex-1 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Start</p>
          <div className="space-y-1">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p.label}
                onClick={() => send(p.label)}
                disabled={streaming}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-left disabled:opacity-40"
              >
                <span className="text-sm leading-none">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Mobile header */}
        <header className="lg:hidden flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 bg-card">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">Genie</p>
            <p className="text-[11px] text-muted-foreground">Personal concierge</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-muted-foreground">Online</span>
            </div>
            <button
              onClick={() => setMessages([{
                role: 'assistant',
                content: `Hey ${userName}! I'm Genie — your personal concierge. I know your travel style, budget preferences, and booking history.\n\nAsk me anything: plan a trip, find a doctor, recommend restaurants, or just tell me what you need.`,
              }])}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="New chat"
            >
              <SquarePen className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-3xl px-4 py-8 space-y-5">

            {/* Mobile quick prompts */}
            {!hasUserMessages && (
              <div className="lg:hidden mb-4">
                <p className="text-center text-xs text-muted-foreground mb-3">Try asking…</p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_PROMPTS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => send(p.label)}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-left"
                    >
                      <span className="text-base">{p.icon}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm mt-0.5">
                    <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}

                <div className={cn(
                  'max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm'
                    : 'bg-card border border-border text-foreground rounded-tl-sm shadow-sm'
                )}>
                  {msg.role === 'assistant' && msg.content === '' ? (
                    <TypingDots />
                  ) : msg.role === 'assistant' ? (
                    <MessageContent text={msg.content} />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary border border-border mt-0.5 text-xs font-bold text-foreground">
                    {userInitial}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-border bg-card px-4 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex gap-3 items-end rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-sm">
              <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground mb-0.5 mt-1" />
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask Genie anything…"
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 leading-relaxed"
                style={{ minHeight: '24px', maxHeight: '120px' }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || streaming}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-sm"
              >
                {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Genie knows your profile · Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
