'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sparkle, ShieldCheck, RefreshCw, Loader2, Check, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useUserEvents } from '@/hooks/useUserEvents'

interface LifeEvent {
  eventId: string; type: string; confidence: number
  title: string; body: string; suggestedIntents: string[]; status: string; detectedAt: string
}
interface Prefs { enabled: boolean; disabledTypes: string[] }

const EVENT_TYPES = [
  { id: 'moving_cities', label: 'Moving cities' },
  { id: 'new_baby', label: 'New baby' },
  { id: 'wedding_planning', label: 'Wedding planning' },
  { id: 'new_job', label: 'New job' },
  { id: 'travel_season', label: 'Travel season' },
]

export function LifeEventsClient({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [events, setEvents] = useState<LifeEvent[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [err, setErr] = useState('')

  const loadEvents = useCallback(() => {
    fetch('/api/life-events').then(r => r.json()).then(d => setEvents(d.events ?? [])).catch(e => setErr(String(e)))
  }, [])
  const loadPrefs = useCallback(() => {
    fetch('/api/life-events/preferences').then(r => r.json()).then(setPrefs).catch(e => setErr(String(e)))
  }, [])
  useEffect(() => { loadPrefs(); loadEvents() }, [loadPrefs, loadEvents])

  // Live life-event detections.
  useUserEvents(userId, {
    life_event: d => {
      toast(d.title ?? 'New life event detected', { description: d.body })
      loadEvents()
    },
  })

  async function savePrefs(next: Prefs) {
    setPrefs(next)
    await fetch('/api/life-events/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
    })
    loadEvents()
  }

  async function scan() {
    setScanning(true); setErr('')
    try {
      const res = await fetch('/api/life-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan' }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Scan failed')
      loadEvents()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setScanning(false) }
  }

  async function setStatus(eventId: string, status: 'acknowledged' | 'dismissed') {
    await fetch(`/api/life-events/${eventId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    loadEvents()
  }

  return (
    <div className="space-y-4">
      {/* Privacy / opt-in */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Life-event detection</p>
              <p className="text-xs text-muted-foreground">Off by default. Opt in and Smart Search will spot moments like a move or a new job from your activity — privately.</p>
            </div>
          </div>
          <button
            onClick={() => prefs && savePrefs({ ...prefs, enabled: !prefs.enabled })}
            role="switch"
            aria-checked={!!prefs?.enabled}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prefs?.enabled ? 'bg-primary' : 'bg-secondary'}`}
            aria-label="Life-event detection"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${prefs?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {prefs?.enabled && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Detect these (toggle off to opt out):</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map(t => {
                const disabled = prefs.disabledTypes.includes(t.id)
                return (
                  <button key={t.id}
                    onClick={() => savePrefs({ ...prefs, disabledTypes: disabled ? prefs.disabledTypes.filter(x => x !== t.id) : [...prefs.disabledTypes, t.id] })}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${disabled ? 'border-border text-muted-foreground' : 'border-primary/40 bg-primary/10 text-primary'}`}>
                    {t.label}
                  </button>
                )
              })}
            </div>
            <Button variant="outline" size="sm" className="mt-4" onClick={scan} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Scan now
            </Button>
          </div>
        )}
      </Card>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {!prefs?.enabled ? null : !events ? (
        <div className="h-24 animate-pulse rounded-xl bg-secondary/50" />
      ) : events.length === 0 ? (
        <EmptyState icon={Sparkle} title="No life events detected yet" hint="Keep using Smart Search — we'll surface relevant moments here." />
      ) : (
        <div className="space-y-3">
          {events.map(e => (
            <Card key={e.eventId} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
                </div>
                <Badge variant={e.status === 'detected' ? 'locked' : 'secondary'} className="shrink-0">
                  {Math.round(e.confidence * 100)}%
                </Badge>
              </div>
              {e.suggestedIntents.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {e.suggestedIntents.map((intent, i) => (
                    <a key={i} href={`/?prompt=${encodeURIComponent(intent)}`}
                      className="block rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs transition-colors hover:bg-secondary">
                      {intent} →
                    </a>
                  ))}
                </div>
              )}
              {e.status === 'detected' && (
                <div className="mt-3 flex gap-3">
                  <button onClick={() => setStatus(e.eventId, 'acknowledged')} className="flex items-center gap-1 text-xs text-primary hover:underline"><Check className="h-3 w-3" /> Got it</button>
                  <button onClick={() => setStatus(e.eventId, 'dismissed')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /> Dismiss</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
