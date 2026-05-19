'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw, Loader2, TrendingDown, ShoppingBag, MapPin, Bot } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useUserEvents } from '@/hooks/useUserEvents'

interface CategorySpend { activityType: string; orders: number; spentCents: number }
interface InsightStats {
  periodStart: string; periodEnd: string; currency: string
  orderCount: number; totalSpentCents: number; byCategory: CategorySpend[]
  topDestinations: string[]; savingsVsMarketCents: number; genieInteractions: number
}
interface InsightReport {
  reportId: string; periodStart: string; periodEnd: string
  headline: string; narrative: string; stats: InsightStats
}

const money = (c: number, cur = 'GBP') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(c / 100)

export function InsightsClient({ userId }: { userId: string }) {
  const [reports, setReports] = useState<InsightReport[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    fetch('/api/insights').then(r => r.json()).then(d => setReports(d.reports ?? [])).catch(e => setErr(String(e)))
  }, [])
  useEffect(() => { load() }, [load])

  // Live: a fresh weekly report was generated.
  useUserEvents(userId, {
    insight_ready: d => {
      toast.success('New insights ready', { description: d.headline })
      load()
    },
  })

  async function regenerate() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/insights', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!reports) return <div className="h-40 animate-pulse rounded-2xl bg-secondary/50" />

  const latest = reports[0]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={regenerate} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </Button>
      </div>

      {!latest ? (
        <EmptyState icon={Sparkles} title="No insights yet" hint="Make a booking, then refresh to generate your first weekly report." />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-cyan-500/15 to-blue-400/5 p-6">
              <Badge variant="outline" className="mb-2 text-[10px]">{latest.periodStart} → {latest.periodEnd}</Badge>
              <p className="text-xl font-bold">{latest.headline}</p>
              <p className="mt-2 text-sm text-muted-foreground">{latest.narrative}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
              <Stat icon={ShoppingBag} label="Orders" value={String(latest.stats.orderCount)} />
              <Stat icon={Sparkles} label="Spent" value={money(latest.stats.totalSpentCents, latest.stats.currency)} />
              <Stat icon={TrendingDown} label="Saved" value={money(latest.stats.savingsVsMarketCents, latest.stats.currency)} />
              <Stat icon={Bot} label="Genie tasks" value={String(latest.stats.genieInteractions)} />
            </div>
          </Card>

          {latest.stats.byCategory.length > 0 && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">Spend by category</p>
              <CategoryBars categories={latest.stats.byCategory} currency={latest.stats.currency} />
            </Card>
          )}

          {latest.stats.topDestinations.length > 0 && (
            <Card className="p-5">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" /> Top destinations</p>
              <div className="flex flex-wrap gap-1.5">
                {latest.stats.topDestinations.map(d => <Badge key={d} variant="secondary">{d}</Badge>)}
              </div>
            </Card>
          )}

          {reports.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Past reports</p>
              <div className="space-y-2">
                {reports.slice(1).map(r => (
                  <Card key={r.reportId} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">{r.headline}</p>
                      <p className="text-xs text-muted-foreground">{r.periodStart} → {r.periodEnd}</p>
                    </div>
                    <p className="text-sm font-semibold">{money(r.stats.totalSpentCents, r.stats.currency)}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="p-4">
      <Icon className="mb-1 h-4 w-4 text-muted-foreground" />
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  )
}

function CategoryBars({ categories, currency }: { categories: CategorySpend[]; currency: string }) {
  const max = Math.max(...categories.map(c => c.spentCents), 1)
  return (
    <div className="space-y-2.5">
      {categories.map(c => (
        <div key={c.activityType}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="capitalize">{c.activityType.replace(/_/g, ' ')}</span>
            <span className="font-medium">{money(c.spentCents, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(c.spentCents / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
