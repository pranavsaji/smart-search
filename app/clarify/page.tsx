'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plane, Hotel, Car, Utensils, Sparkles, MapPin, Calendar,
  Users, Wallet, ArrowRight, Loader2, Check, ChevronLeft,
  Wrench, Stethoscope, ShoppingBag, Code2, CalendarClock, Clock, UserPlus,
} from 'lucide-react'
import { format, addDays, getDay } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { classifyDestination } from '@/lib/geo/destinations'

const SERVICE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  flights:         { label: 'Flights',          icon: Plane,         color: 'text-blue-600',    bg: 'bg-blue-50' },
  stays:           { label: 'Hotels',           icon: Hotel,         color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  cars:            { label: 'Rental Cars',      icon: Car,           color: 'text-emerald-600', bg: 'bg-emerald-50' },
  restaurants:     { label: 'Restaurants',      icon: Utensils,      color: 'text-orange-600',  bg: 'bg-orange-50' },
  experiences:     { label: 'Experiences',      icon: Sparkles,      color: 'text-violet-600',  bg: 'bg-violet-50' },
  appointments:    { label: 'Appointments',     icon: CalendarClock, color: 'text-teal-600',    bg: 'bg-teal-50' },
  home_services:   { label: 'Home Services',    icon: Wrench,        color: 'text-lime-600',    bg: 'bg-lime-50' },
  health_services: { label: 'Health',           icon: Stethoscope,   color: 'text-rose-600',    bg: 'bg-rose-50' },
  digital_services:{ label: 'Digital Services', icon: Code2,         color: 'text-purple-600',  bg: 'bg-purple-50' },
  products:        { label: 'Shopping',         icon: ShoppingBag,   color: 'text-amber-600',   bg: 'bg-amber-50' },
}

const BUDGET_OPTIONS = [
  { value: 'budget',    label: 'Budget',    desc: 'Best value' },
  { value: 'mid-range', label: 'Mid-range', desc: 'Comfort' },
  { value: 'premium',   label: 'Premium',   desc: 'Luxury' },
]

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

const VERB_WORDS = /^(drive|fly|go|get|travel|visit|be|do|see|find|book|look|make|check|work|help|plan|buy|rent|need|want|try)\b/

function extractFromPrompt(prompt: string) {
  const lower = prompt.toLowerCase()
  let origin: string | null = null
  let destination: string | null = null

  // Most specific: "from X to Y"
  const fromToMatch = lower.match(/from\s+([a-z][a-z\s,]+?)\s+to\s+([a-z][a-z\s,]+?)(?=\s+(?:next|this|on|in|for|,)|$)/i)
  if (fromToMatch) {
    origin = fromToMatch[1].trim()
    destination = fromToMatch[2].trim()
  } else {
    // Find ALL "to X" matches, reverse, pick the last non-verb one
    const toMatches = [...lower.matchAll(/\bto\s+([a-z][a-z\s]{1,30}?)(?=\s+(?:from|next|this|on|in|for|with|and|,)|$)/gi)]
    for (const m of [...toMatches].reverse()) {
      const candidate = m[1].trim()
      if (candidate.length >= 2 && !VERB_WORDS.test(candidate)) {
        destination = candidate
        break
      }
    }
    // "in X" as fallback destination
    if (!destination) {
      const inMatch = lower.match(/\bin\s+([a-z][a-z\s]{2,25}?)(?=\s+(?:next|this|on|for|with|,)|$)/i)
      if (inMatch && !VERB_WORDS.test(inMatch[1])) destination = inMatch[1].trim()
    }
    // origin from "from X"
    const originMatch = lower.match(/\bfrom\s+([a-z][a-z\s,]+?)(?=\s+(?:to|next|on|,)|$)/i)
    if (originMatch) origin = originMatch[1].trim()
  }

  // Date parsing
  let departureDate: string | null = null
  const dayMatch = lower.match(/(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)
  if (dayMatch) {
    const targetDay = DAY_MAP[dayMatch[1].toLowerCase()]
    const today = new Date()
    const isNext = dayMatch[0].toLowerCase().startsWith('next')
    let daysUntil = (targetDay - getDay(today) + 7) % 7 || 7
    if (isNext && daysUntil <= 7) daysUntil += 7
    departureDate = format(addDays(today, daysUntil), 'yyyy-MM-dd')
  }

  // Service detection
  const services: string[] = []
  if (/\bfl(y|ight|ights)\b/.test(lower))                          services.push('flights')
  if (/\b(hotel|stay|resort|airbnb|lodge|accommodation)\b/.test(lower)) services.push('stays')
  if (/\b(drive|driving|car\b|rental|hire|road\s*trip)\b/.test(lower)) services.push('cars')
  if (/\b(eat|restaurant|food|dinner|lunch|dining|cuisine)\b/.test(lower)) services.push('restaurants')
  if (/\b(tour|activity|experience|things\s*to\s*do)\b/.test(lower))  services.push('experiences')
  if (/\b(appointment|consult|dentist|doctor|physio|therapist)\b/.test(lower)) services.push('health_services')
  if (/\b(plumber|electrician|cleaner|handyman|repair)\b/.test(lower)) services.push('home_services')
  if (/\b(buy|shop|order|purchase|product)\b/.test(lower))          services.push('products')

  return { destination, origin, departureDate, services }
}

// Derive which form sections to show based on detected services
function deriveLayout(services: string[]) {
  const isTravel    = services.some(s => ['flights','stays','cars','experiences'].includes(s))
  const hasFlights  = services.includes('flights')
  const hasCars     = services.includes('cars')
  const hasRestaurant = services.includes('restaurants')
  const hasLocal    = services.some(s => ['home_services','health_services','appointments'].includes(s))
  const hasProducts = services.includes('products')

  return {
    showOrigin:      hasFlights || hasCars,
    showDestination: true,
    showDates:       isTravel || hasRestaurant || hasLocal,
    showTripType:    hasFlights || (services.includes('stays') && !hasCars),
    showTimeSlot:    hasRestaurant || hasLocal,
    showBudget:      !hasLocal,
    showTravelerNames: isTravel,
  }
}

function ClarifyInner() {
  const router = useRouter()
  const params = useSearchParams()
  const originalPrompt = params.get('q') ?? ''

  const [previewLoading, setPreviewLoading] = useState(true)
  const [detectedServices, setDetectedServices] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const clientExtracted = extractFromPrompt(originalPrompt)
  const defaultStart = clientExtracted.departureDate ?? format(addDays(new Date(), 7), 'yyyy-MM-dd')

  const [destination, setDestination] = useState(clientExtracted.destination ?? '')
  const [origin, setOrigin] = useState(clientExtracted.origin ?? '')
  const [departureDate, setDepartureDate] = useState(defaultStart)
  const [returnDate, setReturnDate] = useState(format(addDays(new Date(defaultStart), 3), 'yyyy-MM-dd'))
  const [groupSize, setGroupSize] = useState(1)
  const [travelerNames, setTravelerNames] = useState<string[]>([])
  const [budget, setBudget] = useState('mid-range')
  const [extraNotes, setExtraNotes] = useState('')
  const [tripType, setTripType] = useState<'one-way' | 'return'>('one-way')
  const [timeSlot, setTimeSlot] = useState('')

  const minDate = format(new Date(), 'yyyy-MM-dd')

  // Sync traveler name array length with groupSize
  useEffect(() => {
    setTravelerNames(prev => {
      const next = [...prev]
      while (next.length < groupSize - 1) next.push('')
      return next.slice(0, Math.max(0, groupSize - 1))
    })
  }, [groupSize])

  // Phase A enhancement in background
  useEffect(() => {
    if (!originalPrompt) { router.replace('/'); return }
    fetch('/api/intent/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: originalPrompt }),
    })
      .then(r => r.json())
      .then((data: { services: string[]; extracted: { destination: string | null; origin: string | null; departureDate: string | null } }) => {
        if (data.services?.length) setDetectedServices(data.services.filter(s => !['weather','maps'].includes(s)))
        if (data.extracted?.destination && !clientExtracted.destination) setDestination(data.extracted.destination)
        if (data.extracted?.origin && !clientExtracted.origin) setOrigin(data.extracted.origin)
        if (data.extracted?.departureDate && !clientExtracted.departureDate) {
          setDepartureDate(data.extracted.departureDate)
          setReturnDate(format(addDays(new Date(data.extracted.departureDate), 3), 'yyyy-MM-dd'))
        }
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allServices = [...new Set([...clientExtracted.services, ...detectedServices])]
  const displayServices = allServices.filter(s => !['weather','maps'].includes(s))
  const layout = deriveLayout(allServices)
  // Flag country-level destinations ("India") so we can prompt for a city + airport.
  const destClass = classifyDestination(destination)

  const handleSearch = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const parts: string[] = [originalPrompt]
      if (destination) parts.push(`destination: ${destination}`)
      if (origin) parts.push(`from: ${origin}`)
      if (departureDate) parts.push(`departing: ${departureDate}`)
      if (tripType === 'return' && returnDate) parts.push(`returning: ${returnDate}`)
      if (groupSize > 1) {
        parts.push(`${groupSize} people`)
        const names = travelerNames.filter(Boolean)
        if (names.length) parts.push(`travelers: me, ${names.join(', ')}`)
      }
      if (budget !== 'mid-range') parts.push(`${budget} budget`)
      if (timeSlot) parts.push(`preferred time: ${timeSlot}`)
      if (extraNotes.trim()) parts.push(extraNotes.trim())

      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: parts.join(', ') }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      if (data.clarificationNeeded) {
        toast.error(data.clarificationMessage ?? 'Please add more details')
        setSubmitting(false)
        return
      }
      router.push(`/stage/${data.stageId}`)
    } catch (err) {
      toast.error(String(err))
      setSubmitting(false)
    }
  }, [submitting, originalPrompt, destination, origin, departureDate, returnDate, tripType, groupSize, travelerNames, budget, timeSlot, extraNotes, router])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-800">iAM</span>
        <div className="mx-4 h-5 w-px bg-slate-200" />
        <p className="text-sm text-slate-500 truncate max-w-xl">"{originalPrompt}"</p>
        {(displayServices.length > 0 || previewLoading) && (
          <div className="ml-auto flex items-center gap-2">
            {displayServices.map(svc => {
              const meta = SERVICE_META[svc]
              if (!meta) return null
              const Icon = meta.icon
              return (
                <div key={svc} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', meta.bg, meta.color)}>
                  <Icon className="h-3 w-3" />{meta.label}
                </div>
              )
            })}
            {previewLoading && (
              <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />Detecting…
              </div>
            )}
          </div>
        )}
      </header>

      {/* Body — fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Where + When */}
        <div className="flex w-1/2 flex-col gap-6 overflow-y-auto border-r border-slate-200 bg-white p-8">
          {/* WHERE */}
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-base font-bold text-slate-800">
              <MapPin className="h-5 w-5 text-blue-500" /> Where
            </p>
            <div className={cn('grid gap-4', layout.showOrigin ? 'grid-cols-2' : 'grid-cols-1')}>
              {layout.showOrigin && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-500">From</label>
                  <input
                    value={origin}
                    onChange={e => setOrigin(e.target.value)}
                    placeholder="e.g. London"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-500">
                  {layout.showOrigin ? 'To' : 'Location / Destination'}
                </label>
                <input
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="e.g. Miami"
                  aria-describedby={destClass.kind === 'country' ? 'dest-airport-hint' : undefined}
                  className={cn(
                    'w-full rounded-xl border bg-slate-50 px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none transition-colors',
                    destClass.kind === 'country' ? 'border-amber-300 focus:border-amber-400' : 'border-slate-200 focus:border-blue-400'
                  )}
                />
                {destClass.kind === 'country' && destClass.airports && (
                  <div id="dest-airport-hint" className="mt-2.5">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <Plane className="h-3.5 w-3.5" />
                      {destClass.country} has several airports — pick a city:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {destClass.airports.map(a => (
                        <button
                          key={a.iata}
                          type="button"
                          onClick={() => setDestination(`${a.city} (${a.iata})`)}
                          title={a.name}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                        >
                          {a.city} <span className="text-slate-400">{a.iata}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* WHEN */}
          {layout.showDates && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-base font-bold text-slate-800">
                <Calendar className="h-5 w-5 text-blue-500" /> When
              </p>
              {layout.showTripType && (
                <div className="flex gap-2">
                  {(['one-way', 'return'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTripType(t)}
                      className={cn(
                        'rounded-full border px-5 py-2 text-sm font-medium transition-all',
                        tripType === t ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      )}
                    >
                      {t === 'one-way' ? 'One way' : 'Return'}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-4 grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-500">
                    {layout.showTimeSlot ? 'Date' : 'Departure'}
                  </label>
                  <input
                    type="date"
                    value={departureDate}
                    min={minDate}
                    onChange={e => setDepartureDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>
                {layout.showTimeSlot ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-500 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Preferred time
                    </label>
                    <input
                      value={timeSlot}
                      onChange={e => setTimeSlot(e.target.value)}
                      placeholder="e.g. 7pm, morning"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                ) : tripType === 'return' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-500">Return</label>
                    <input
                      type="date"
                      value={returnDate}
                      min={departureDate || minDate}
                      onChange={e => setReturnDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — People + Budget + Notes + Search */}
        <div className="flex w-1/2 flex-col gap-6 overflow-y-auto bg-slate-50 p-8">
          {/* PEOPLE */}
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-base font-bold text-slate-800">
              <Users className="h-5 w-5 text-blue-500" /> People
            </p>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-500 w-28">
                {layout.showTravelerNames ? 'Travellers' : 'Group size'}
              </label>
              <button
                onClick={() => setGroupSize(g => Math.max(1, g - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >−</button>
              <span className="w-8 text-center text-xl font-bold text-slate-800">{groupSize}</span>
              <button
                onClick={() => setGroupSize(g => Math.min(12, g + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >+</button>
              <span className="text-sm text-slate-400">{groupSize === 1 ? 'just me' : `${groupSize} people`}</span>
            </div>
            {groupSize > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4" /> Who's coming?
                </p>
                <div className="grid gap-2 grid-cols-2">
                  <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">1</div>
                    <span className="text-sm text-blue-700 font-medium">You</span>
                  </div>
                  {travelerNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{i + 2}</div>
                      <input
                        value={name}
                        onChange={e => { const next = [...travelerNames]; next[i] = e.target.value; setTravelerNames(next) }}
                        placeholder={`Traveller ${i + 2}`}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* BUDGET */}
          {layout.showBudget && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-base font-bold text-slate-800">
                <Wallet className="h-5 w-5 text-blue-500" /> Budget
              </p>
              <div className="grid grid-cols-3 gap-3">
                {BUDGET_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBudget(opt.value)}
                    className={cn(
                      'flex flex-col items-center rounded-xl border py-4 text-sm font-medium transition-all',
                      budget === opt.value
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'
                    )}
                  >
                    {budget === opt.value && <Check className="mb-1 h-4 w-4 text-blue-500" />}
                    <span className="font-bold text-base">{opt.label}</span>
                    <span className="text-xs opacity-60 mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* EXTRA NOTES */}
          <div className="space-y-3 flex-1">
            <label className="block text-base font-bold text-slate-800">
              Anything else? <span className="text-sm font-normal text-slate-400">optional</span>
            </label>
            <textarea
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              placeholder="e.g. window seat, pet-friendly hotel, vegetarian, direct flight only…"
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none transition-colors"
            />
          </div>

          {/* SEARCH BUTTON */}
          <div className="space-y-2">
            <button
              onClick={handleSearch}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-5 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
            >
              {submitting
                ? <><Loader2 className="h-5 w-5 animate-spin" /> Assembling results…</>
                : <><Sparkles className="h-5 w-5" /> Search <ArrowRight className="h-5 w-5" /></>}
            </button>
            <p className="text-center text-xs text-slate-400">All services load in parallel — results stream in live</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClarifyPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    }>
      <ClarifyInner />
    </Suspense>
  )
}
