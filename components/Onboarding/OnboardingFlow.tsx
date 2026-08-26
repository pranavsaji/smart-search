'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, Check, Loader2, MapPin, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BudgetSignal, ActivityType } from '@/lib/intent/types'
import { buildSuggestedPrompt } from '@/lib/onboarding/suggestPrompt'

type TravelStyle = 'solo' | 'couple' | 'group'

const BUDGET_OPTIONS: { value: BudgetSignal; label: string; desc: string }[] = [
  { value: 'budget',    label: 'Budget',    desc: 'I look for deals and value' },
  { value: 'mid-range', label: 'Mid-range', desc: 'Comfort without going overboard' },
  { value: 'premium',   label: 'Premium',   desc: 'Quality and experience first' },
]

const STYLE_OPTIONS: { value: TravelStyle; label: string; emoji: string }[] = [
  { value: 'solo',   label: 'Solo',   emoji: '🧍' },
  { value: 'couple', label: 'Couple', emoji: '👫' },
  { value: 'group',  label: 'Group',  emoji: '👥' },
]

const ACTIVITY_OPTIONS: { type: ActivityType; label: string; emoji: string }[] = [
  { type: 'flights',          label: 'Flights',         emoji: '✈️' },
  { type: 'stays',            label: 'Hotels & Stays',  emoji: '🏨' },
  { type: 'experiences',      label: 'Experiences',     emoji: '🎭' },
  { type: 'restaurants',      label: 'Dining',          emoji: '🍽️' },
  { type: 'products',         label: 'Shopping',        emoji: '🛍️' },
  { type: 'health_services',  label: 'Health',          emoji: '🏥' },
  { type: 'home_services',    label: 'Home Services',   emoji: '🔧' },
  { type: 'digital_services', label: 'Digital Services',emoji: '💻' },
  { type: 'appointments',     label: 'Appointments',    emoji: '📅' },
]

// Popular starting points — a blank text box gets abandoned, a pill gets tapped.
const DESTINATION_SUGGESTIONS = [
  'Paris', 'Tokyo', 'New York', 'Barcelona', 'Dubai',
  'London', 'Rome', 'Bali', 'Lisbon', 'Reykjavik',
]

const MAX_DESTINATIONS = 3

// GAP_ANALYSIS 1.2 — email and @handle are collected during signup (and the
// address is proven by the OTP), so onboarding picks up from preferences.
// 5: destinations, 6: confirm what was learned + suggest a first prompt.
const TOTAL_STEPS = 6

export function OnboardingFlow() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [budget, setBudget] = useState<BudgetSignal | null>(null)
  const [style, setStyle] = useState<TravelStyle | null>(null)
  const [activities, setActivities] = useState<Set<ActivityType>>(new Set())
  const [destinations, setDestinations] = useState<string[]>([])
  const [destinationDraft, setDestinationDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleActivity = (type: ActivityType) => {
    setActivities(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const addDestination = (value: string) => {
    const clean = value.trim()
    if (!clean) return
    setDestinationDraft('')
    setDestinations(prev =>
      // Case-insensitive de-dupe, capped — three signals is plenty to seed on.
      prev.length >= MAX_DESTINATIONS ||
      prev.some(d => d.toLowerCase() === clean.toLowerCase())
        ? prev
        : [...prev, clean]
    )
  }

  const removeDestination = (value: string) =>
    setDestinations(prev => prev.filter(d => d !== value))

  const canAdvance = () => {
    if (step === 2) return budget !== null
    if (step === 3) return style !== null
    if (step === 4) return activities.size > 0
    // Destinations are optional: forcing one on someone who does not travel is
    // a worse first impression than an unseeded graph.
    return true
  }

  const suggestedPrompt = buildSuggestedPrompt({
    destination: destinations[0],
    travelStyle: style,
    activities: [...activities],
  })

  const handleFinish = async (opts: { withPrompt: boolean }) => {
    setSaving(true)
    try {
      await fetch('/api/profile/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetSignal: budget,
          travelStyle: style,
          activityPreferences: Object.fromEntries(
            ACTIVITY_OPTIONS.map(a => [a.type, activities.has(a.type) ? 0.8 : 0.2])
          ),
          destinations,
        }),
      })
    } finally {
      setSaving(false)
      // Pre-fill only — never auto-submit. The suggestion is a starting point
      // for them to edit, not a search we ran on their behalf.
      router.push(opts.withPrompt ? `/?prompt=${encodeURIComponent(suggestedPrompt)}` : '/')
    }
  }

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4">
      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 h-1 bg-border">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <div className="w-full max-w-lg space-y-8">
        {/* Step indicator */}
        <p className="text-center text-xs text-muted-foreground">
          Step {step} of {TOTAL_STEPS}
        </p>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Welcome to Smart Search</h1>
              <p className="mt-3 text-muted-foreground">
                The internet, assembled around you. Let&apos;s spend 30 seconds setting up your profile so every Stage is personalised to you.
              </p>
            </div>
          </div>
        )}

        {/* Step 2 — Budget */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">What&apos;s your usual budget?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Used to rank results to your spending level</p>
            </div>
            <div className="space-y-3">
              {BUDGET_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBudget(opt.value)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-xl border p-4 text-left transition-all',
                    budget === opt.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/60 hover:bg-secondary/40'
                  )}
                >
                  <div>
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-sm text-muted-foreground">{opt.desc}</p>
                  </div>
                  {budget === opt.value && (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Travel style */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">How do you usually plan?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Helps merge preferences when you add collaborators</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStyle(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-3 rounded-xl border p-5 transition-all',
                    style === opt.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/60 hover:bg-secondary/40'
                  )}
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 — Interests */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">What do you search for?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Pick everything that applies — shapes your Stage results</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {ACTIVITY_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => toggleActivity(opt.type)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                    activities.has(opt.type)
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/60 hover:bg-secondary/40'
                  )}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-xs font-medium text-center leading-tight">{opt.label}</span>
                  {activities.has(opt.type) && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5 — Destinations (seeds intentGraph.destinations) */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Anywhere you keep meaning to go?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Up to {MAX_DESTINATIONS}. We use these to rank results — skip if you&apos;d rather not.
              </p>
            </div>

            <form
              onSubmit={e => { e.preventDefault(); addDestination(destinationDraft) }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Add a city or country"
                  value={destinationDraft}
                  onChange={e => setDestinationDraft(e.target.value)}
                  disabled={destinations.length >= MAX_DESTINATIONS}
                  aria-label="Add a destination"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={!destinationDraft.trim() || destinations.length >= MAX_DESTINATIONS}
              >
                Add
              </Button>
            </form>

            {destinations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {destinations.map(d => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeDestination(d)}
                      aria-label={`Remove ${d}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {DESTINATION_SUGGESTIONS
                .filter(d => !destinations.some(sel => sel.toLowerCase() === d.toLowerCase()))
                .slice(0, 6)
                .map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => addDestination(d)}
                    disabled={destinations.length >= MAX_DESTINATIONS}
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border/60 hover:bg-secondary/40 hover:text-foreground disabled:opacity-40"
                  >
                    + {d}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Step 6 — Confirm what we learned, and hand over a first prompt */}
        {step === 6 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Here&apos;s what we&apos;ve got</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Every Stage is ranked against this. You can change it any time in settings.
              </p>
            </div>

            <dl className="space-y-3 rounded-xl border border-border p-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Budget</dt>
                <dd className="font-medium capitalize">{budget ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Usually travelling</dt>
                <dd className="font-medium capitalize">{style ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Interested in</dt>
                <dd className="max-w-[60%] text-right font-medium">
                  {activities.size > 0
                    ? ACTIVITY_OPTIONS.filter(a => activities.has(a.type)).map(a => a.label).join(', ')
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Destinations</dt>
                <dd className="max-w-[60%] text-right font-medium">
                  {destinations.length > 0 ? destinations.join(', ') : 'None yet'}
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Try this first
              </p>
              <p className="mt-2 text-base font-medium">&ldquo;{suggestedPrompt}&rdquo;</p>
              <p className="mt-2 text-xs text-muted-foreground">
                We&apos;ll drop this into the search box so you can edit it before running it.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {step > 1 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(s => s - 1)}>
              Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button
              className="flex-1 gap-2"
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              onClick={() => handleFinish({ withPrompt: true })}
              disabled={!canAdvance() || saving}
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><Sparkles className="h-4 w-4" /> Try this prompt</>}
            </Button>
          )}
        </div>

        {step === 1 && (
          <button
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => router.push('/')}
          >
            Skip for now
          </button>
        )}

        {step === TOTAL_STEPS && (
          <button
            className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            onClick={() => handleFinish({ withPrompt: false })}
            disabled={saving}
          >
            Save and start from a blank search
          </button>
        )}
      </div>
    </div>
  )
}
