'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, Sparkles, X, ArrowRight, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FormError } from '@/components/ui/form-error'
import { EmptyState } from '@/components/ui/empty-state'

interface Suggestion {
  suggestionId: string; type: string; title: string; body: string
  stageId?: string; suggestedIntent?: string; createdAt: string
}
interface Prefs {
  enableWeather: boolean; enableRestaurants: boolean; enableExperiences: boolean
  enablePriceDrops: boolean; enableTripReminders: boolean; enableSeasonalNudges: boolean
}

const PREF_LABELS: Array<{ key: keyof Prefs; label: string }> = [
  { key: 'enableTripReminders', label: 'Trip reminders' },
  { key: 'enableWeather', label: 'Weather alerts' },
  { key: 'enableRestaurants', label: 'Restaurant ideas' },
  { key: 'enableExperiences', label: 'Experiences' },
  { key: 'enablePriceDrops', label: 'Price drops' },
  { key: 'enableSeasonalNudges', label: 'Seasonal nudges' },
]

export function ProactiveClient() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [showPrefs, setShowPrefs] = useState(false)
  const [err, setErr] = useState('')

  const loadSuggestions = useCallback(() => {
    fetch('/api/proactive/suggestions').then(r => r.json()).then(d => setSuggestions(d.suggestions ?? [])).catch(e => setErr(String(e)))
  }, [])
  const loadPrefs = useCallback(() => {
    fetch('/api/proactive/preferences').then(r => r.json()).then(setPrefs).catch(() => {})
  }, [])
  useEffect(() => { loadSuggestions(); loadPrefs() }, [loadSuggestions, loadPrefs])

  async function act(suggestionId: string, action: 'dismiss' | 'act') {
    await fetch('/api/proactive/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId, action }),
    })
    loadSuggestions()
  }

  async function togglePref(key: keyof Prefs) {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    await fetch('/api/proactive/preferences', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: next[key] }),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowPrefs(s => !s)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" /> Preferences
        </button>
      </div>

      {showPrefs && prefs && (
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">What should Genie watch for?</p>
          <div className="space-y-2">
            {PREF_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm">{label}</span>
                <button onClick={() => togglePref(key)}
                  role="switch"
                  aria-checked={prefs[key]}
                  aria-label={label}
                  className={`relative h-5 w-9 rounded-full transition-colors ${prefs[key] ? 'bg-primary' : 'bg-secondary'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${prefs[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <FormError message={err} />

      {!suggestions ? <div className="h-24 animate-pulse rounded-xl bg-secondary/50" />
        : suggestions.length === 0 ? <EmptyState icon={Bell} title="No suggestions right now" hint="Genie checks your upcoming bookings and watched items every few hours." />
        : (
          <div className="space-y-3">
            {suggestions.map(s => (
              <Card key={s.suggestionId} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
                    <div>
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{s.type.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <a
                    href={s.stageId ? `/stage/${s.stageId}` : `/?prompt=${encodeURIComponent(s.suggestedIntent ?? s.title)}`}
                    onClick={() => act(s.suggestionId, 'act')}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {s.stageId ? 'Open Stage' : 'Act on this'} <ArrowRight className="h-3 w-3" />
                  </a>
                  <button onClick={() => act(s.suggestionId, 'dismiss')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" /> Dismiss
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
    </div>
  )
}
