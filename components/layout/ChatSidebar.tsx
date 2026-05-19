'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, MessageSquare, LayoutDashboard, Package, Settings, ChevronLeft, ChevronRight, Zap } from 'lucide-react'

interface ChatSessionSummary {
  _id: string
  title: string
  isBrandSession: boolean
  brandId: string | null
  createdAt: string
  updatedAt: string
}

interface ChatSidebarProps {
  collapsed: boolean
  onToggle: () => void
  activeChatId?: string | null
  onNewChat: () => void
  onLoadChat: (id: string) => void
}

export function ChatSidebar({ collapsed, onToggle, activeChatId, onNewChat, onLoadChat }: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [loading, setLoading] = useState(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chats')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions ?? [])
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Group by date
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  const grouped = sessions.reduce<Record<string, ChatSessionSummary[]>>((acc, s) => {
    const d = new Date(s.updatedAt).toDateString()
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(s.updatedAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
    acc[label] = [...(acc[label] ?? []), s]
    return acc
  }, {})

  return (
    <aside
      className={`relative flex flex-col bg-black/60 border-r border-white/5 transition-all duration-300 ease-in-out overflow-hidden ${collapsed ? 'w-0' : 'w-64'}`}
      style={{ minWidth: collapsed ? 0 : 256 }}
    >
      <div className="flex flex-col h-full min-w-64">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <span className="text-sm font-semibold text-white/70 tracking-wide uppercase">Chats</span>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* New Chat */}
        <div className="p-3">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2.5 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-2.5 text-sm text-white/70 hover:text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>

        {/* Sessions list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
          {loading && (
            <div className="px-3 py-2 text-xs text-white/30">Loading...</div>
          )}
          {Object.entries(grouped).map(([label, group]) => (
            <div key={label}>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">{label}</div>
              {group.map(s => (
                <button
                  key={s._id}
                  onClick={() => onLoadChat(s._id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeChatId === s._id
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  {s.isBrandSession ? (
                    <span className="h-2 w-2 rounded-full bg-purple-400 flex-shrink-0" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                  )}
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          ))}
          {!loading && sessions.length === 0 && (
            <div className="px-3 py-4 text-xs text-white/25 text-center">No sessions yet</div>
          )}
        </nav>

        {/* Navigation */}
        <nav className="p-3 border-t border-white/5 space-y-1">
          <Link href="/genie" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors">
            <Zap className="h-4 w-4" />
            Genie
          </Link>
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link href="/orders" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
            <Package className="h-4 w-4" />
            Bookings
          </Link>
          <Link href="/settings/style" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
            <Settings className="h-4 w-4" />
            Style Profile
          </Link>
        </nav>
      </div>
    </aside>
  )
}

interface ChatSidebarToggleProps {
  onClick: () => void
}

export function ChatSidebarToggle({ onClick }: ChatSidebarToggleProps) {
  return (
    <button
      onClick={onClick}
      className="fixed left-0 top-1/2 -translate-y-1/2 z-20 flex h-10 w-5 items-center justify-center rounded-r-lg bg-white/5 border border-white/10 border-l-0 hover:bg-white/10 transition-colors"
    >
      <ChevronRight className="h-3.5 w-3.5 text-white/40" />
    </button>
  )
}
