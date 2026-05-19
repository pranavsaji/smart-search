'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BudgetSignal, ActivityType } from '@/lib/intent/types'

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

const TOTAL_STEPS = 4

export function OnboardingFlow() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [budget, setBudget] = useState<BudgetSignal | null>(null)
  const [style, setStyle] = useState<TravelStyle | null>(null)
  const [activities, setActivities] = useState<Set<ActivityType>>(new Set())
  const [saving, setSaving] = useState(false)

  const toggleActivity = (type: ActivityType) => {
    setActivities(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const canAdvance = () => {
    if (step === 2) return budget !== null
    if (step === 3) return style !== null
    if (step === 4) return activities.size > 0
    return true
  }

  const handleFinish = async () => {
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
        }),
      })
    } finally {
      setSaving(false)
      router.push('/')
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
              onClick={handleFinish}
              disabled={!canAdvance() || saving}
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><Sparkles className="h-4 w-4" /> Start searching</>}
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
      </div>
    </div>
  )
}
