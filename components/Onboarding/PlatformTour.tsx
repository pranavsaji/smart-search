'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, AtSign, Rows3, Lock, Zap, LayoutGrid,
  ArrowRight, ArrowLeft, X, HelpCircle, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SEEN_KEY = 'ss-platform-tour-v1'

const EXAMPLE_QUERY =
  '@nike show me running shoes for my Dubai trip next Friday, flying from London, for three nights.'

const STEPS = [
  {
    icon: Sparkles,
    iconBg: 'bg-blue-600',
    title: 'Welcome to Smart Search',
    body: 'Type what you want in plain language — one search assembles every service you need: flights, hotels, products, restaurants, home services and more, all in parallel.',
    hint: '"Plan a 3-day Paris trip with flights from London, mid-range"',
  },
  {
    icon: AtSign,
    iconBg: 'bg-violet-600',
    title: 'Mention @brands and @friends',
    body: 'Start with @nike or @adidas to shop a brand directly — the whole experience adapts to that brand. Mention a friend like @alex to plan a trip together; they see the same live results.',
    hint: '"@adidas running shoes for my Spain trip next Tuesday"',
  },
  {
    icon: Rows3,
    iconBg: 'bg-cyan-600',
    title: 'The Stage — live, ranked results',
    body: 'Results stream in row by row as each service responds. Everything is ranked to fit your intent and your taste — irrelevant results are filtered out before ranking, and no vendor can pay their way past that gate.',
    hint: 'Flights · Hotels · Products · Weather · Points of Interest',
  },
  {
    icon: Lock,
    iconBg: 'bg-emerald-600',
    title: 'Lock what you like, pay once',
    body: 'Tap Lock on any card to add it to your trip. When you’re ready, one checkout pays across all vendors — flights, hotels and products together. You can also send any result as a gift.',
    hint: 'Lock → Checkout → one payment, many vendors',
  },
  {
    icon: Zap,
    iconBg: 'bg-amber-500',
    title: 'Genie books for you',
    body: 'For appointments, home services and health visits, Genie can negotiate the slot and complete the booking autonomously — it only ever confirms real bookings, and emails you the confirmation.',
    hint: 'Dentists · Plumbers · Therapists · Consultations',
  },
  {
    icon: LayoutGrid,
    iconBg: 'bg-rose-500',
    title: 'Your whole toolkit lives in Apps',
    body: 'Open the Apps menu for your Wallet (1% cashback credits), AI Agents that hunt deals long-term, price-drop Watchlists, weekly Insights about your spending, and more.',
    hint: 'Wallet · AI Agents · Watchlist · Insights · Voice',
  },
] as const

export function PlatformTour() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        const t = setTimeout(() => setOpen(true), 800)
        return () => clearTimeout(t)
      }
    } catch { /* storage unavailable — skip auto-open */ }
  }, [])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())) } catch { /* ignore */ }
    setOpen(false)
    setStep(0)
  }, [])

  const tryExample = useCallback(() => {
    dismiss()
    router.push(`/clarify?q=${encodeURIComponent(EXAMPLE_QUERY)}`)
  }, [dismiss, router])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, STEPS.length - 1))
      if (e.key === 'ArrowLeft') setStep(s => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <>
      {/* Re-open affordance */}
      <button
        onClick={() => { setStep(0); setOpen(true) }}
        aria-label="Open platform tour"
        className="fixed bottom-5 left-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-md transition-colors hover:text-blue-600 hover:border-blue-200"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-label="Platform tour"
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative flex flex-col items-center gap-4 px-8 pt-10 pb-6 text-center">
              <button
                onClick={dismiss}
                aria-label="Close tour"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>

              <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg', current.iconBg)}>
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{current.title}</h2>
              <p className="text-sm leading-relaxed text-slate-500">{current.body}</p>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-500">
                {current.hint}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`Go to step ${i + 1}`}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === step ? 'w-6 bg-blue-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400',
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {step === 0 ? (
                  <button onClick={dismiss} className="rounded-full px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600">
                    Skip
                  </button>
                ) : (
                  <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                )}
                {isLast ? (
                  <button
                    onClick={tryExample}
                    className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                  >
                    <Search className="h-3.5 w-3.5" /> Try an example search
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    className="flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                  >
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
