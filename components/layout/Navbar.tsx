'use client'
import Link from 'next/link'
import {
  Sparkles, Search, User, LogOut, Zap, Grid3x3,
  Wallet, Bot, Bell, BarChart3, Mic, Building2, Eye, Sparkle, FlaskConical, Network,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface NavbarProps {
  user?: { name?: string | null; handle?: string } | null
}

const APP_LINKS: Array<{ href: string; label: string; icon: typeof Wallet; group: string }> = [
  { href: '/wallet', label: 'Wallet & Credits', icon: Wallet, group: 'Money' },
  { href: '/agents', label: 'AI Agents', icon: Bot, group: 'Agents' },
  { href: '/watchlist', label: 'Watchlist', icon: Eye, group: 'Agents' },
  { href: '/life-events', label: 'Life Events', icon: Sparkle, group: 'Agents' },
  { href: '/proactive', label: 'Suggestions', icon: Bell, group: 'Agents' },
  { href: '/insights', label: 'Your Insights', icon: Sparkles, group: 'Intelligence' },
  { href: '/analytics', label: 'Vendor Analytics', icon: BarChart3, group: 'Intelligence' },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical, group: 'Intelligence' },
  { href: '/graph', label: 'Knowledge Graph', icon: Network, group: 'Intelligence' },
  { href: '/voice', label: 'Voice', icon: Mic, group: 'More' },
  { href: '/org', label: 'Teams (B2B)', icon: Building2, group: 'More' },
]

function AppsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const groups = Array.from(new Set(APP_LINKS.map(l => l.group)))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Apps menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Grid3x3 className="h-3 w-3" />
        <span className="hidden sm:inline">Apps</span>
      </button>
      {open && (
        <div role="menu" aria-label="Apps" className="absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-xl">
          {groups.map(group => (
            <div key={group} className="mb-1 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
              {APP_LINKS.filter(l => l.group === group).map(l => {
                const Icon = l.icon
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {l.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Navbar({ user }: NavbarProps) {
  return (
    <header className="fixed top-5 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl">
      <nav className="glass-strong flex h-12 items-center justify-between rounded-full px-4 shadow-lg shadow-blue-500/10 ring-1 ring-blue-100">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-sky-400/15 ring-1 ring-blue-200">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <span className="gradient-text-brand text-[15px] font-bold tracking-tight">iAM</span>
        </Link>

        {/* Nav actions */}
        <div className="flex items-center gap-1">
          {user ? (
            <>
              <Link href="/genie">
                <button className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20">
                  <Zap className="h-3 w-3" />
                  <span className="hidden sm:inline">Genie</span>
                </button>
              </Link>
              <Link href="/orders">
                <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700">
                  <Search className="h-3 w-3" />
                  <span className="hidden sm:inline">My Trips</span>
                </button>
              </Link>
              <AppsMenu />
              <Link href={`/@${user.handle ?? 'me'}`}>
                <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700">
                  <User className="h-3 w-3" />
                  <span className="hidden sm:inline">{user.handle ? `@${user.handle}` : user.name}</span>
                </button>
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">
                <button className="rounded-full px-4 py-1.5 text-xs text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700">
                  Sign in
                </button>
              </Link>
              <Link href="/signup">
                <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-blue-500/25">
                  Get started
                </button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
