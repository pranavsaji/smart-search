'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Eye, Plus, Loader2, Bell, TrendingDown, Trash2, Pause } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useUserEvents } from '@/hooks/useUserEvents'

interface WatchTarget { itemType: string; label: string; currency: string }
interface WatchItem {
  watchId: string; target: WatchTarget; targetPriceCents: number
  currentPriceCents?: number; lowestSeenCents?: number; active: boolean; alertSent: boolean
  pollIntervalMinutes: number; lastCheckedAt?: string; createdAt: string
}

const ITEM_TYPES = [
  'flights', 'stays', 'cars', 'experiences', 'products',
  'digital_services', 'home_services', 'health_services', 'appointments',
] as const

const money = (c: number, cur = 'USD') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(c / 100)

export function WatchlistClient({ userId }: { userId: string }) {
  const [items, setItems] = useState<WatchItem[] | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    fetch('/api/watchlist').then(r => r.json()).then(d => setItems(d.items ?? [])).catch(e => setErr(String(e)))
  }, [])
  useEffect(() => { load() }, [load])

  // Live price-drop alerts.
  useUserEvents(userId, {
    price_alert: d => {
      toast.success('Price drop 🔔', {
        description: `${d.label} is now ${money(d.priceCents, d.currency)} (target ${money(d.targetPriceCents, d.currency)})`,
      })
      load()
    },
  })

  async function deactivate(id: string) { await fetch(`/api/watchlist/${id}`, { method: 'PATCH' }); load() }
  async function remove(id: string) { await fetch(`/api/watchlist/${id}`, { method: 'DELETE' }); load() }

  return (
    <div className="space-y-4">
      <WatchCreate onCreated={load} />
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!items ? (
        <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary/50" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Eye} title="Nothing on your watchlist" hint="Add an item and we'll alert you when the price drops to your target." />
      ) : (
        <div className="space-y-3">
          {items.map(w => {
            const hit = w.currentPriceCents != null && w.currentPriceCents <= w.targetPriceCents
            return (
              <Card key={w.watchId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{w.target.label}</p>
                      <Badge variant="outline" className="text-[10px]">{w.target.itemType.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Checks every {w.pollIntervalMinutes}m{w.lastCheckedAt ? ` · last ${new Date(w.lastCheckedAt).toLocaleString('en-GB')}` : ''}</p>
                  </div>
                  {!w.active ? <Badge variant="secondary">Paused</Badge>
                    : w.alertSent ? <Badge variant="success" className="gap-1"><Bell className="h-3 w-3" /> Alerted</Badge>
                    : <Badge variant="locked">Watching</Badge>}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-secondary/40 p-3 text-center">
                  <div><p className="text-[10px] text-muted-foreground">Target</p><p className="text-sm font-semibold">{money(w.targetPriceCents, w.target.currency)}</p></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Current</p>
                    <p className={`text-sm font-semibold ${hit ? 'text-emerald-600' : ''}`}>{w.currentPriceCents != null ? money(w.currentPriceCents, w.target.currency) : '—'}</p>
                  </div>
                  <div><p className="text-[10px] text-muted-foreground">Lowest</p><p className="text-sm font-semibold">{w.lowestSeenCents != null ? money(w.lowestSeenCents, w.target.currency) : '—'}</p></div>
                </div>

                {hit && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600"><TrendingDown className="h-3 w-3" /> Target reached!</p>}

                <div className="mt-3 flex gap-3">
                  {w.active && (
                    <button onClick={() => deactivate(w.watchId)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Pause className="h-3 w-3" /> Pause
                    </button>
                  )}
                  <button onClick={() => remove(w.watchId)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WatchCreate({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [itemType, setItemType] = useState<string>('products')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    const cents = Math.round(parseFloat(target) * 100)
    if (!label.trim() || !cents) { setErr('Add a label and target price'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: { itemType, label, query: {}, currency: 'USD' }, targetPriceCents: cents }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setOpen(false); setLabel(''); setTarget('')
      onCreated()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!open) return <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Watch an item</Button>

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold">Watch a price</p>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder='e.g. "Flight LON→TYO August"'
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <select value={itemType} onChange={e => setItemType(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {ITEM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <div className="relative w-36">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target"
            className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm" />
        </div>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button onClick={submit} disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start watching'}</Button>
    </Card>
  )
}
