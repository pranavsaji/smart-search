'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Search, TrendingUp, TrendingDown, Minus, Activity, Loader2, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/ui/form-error'
import { EmptyState } from '@/components/ui/empty-state'

interface Demand { activityType: string; searches: number; uniqueUsers: number }
interface Conversion { stages: number; carts: number; orders: number; stageToCartRate: number; cartToOrderRate: number; overallConversion: number }
interface Forecast { activityType: string; horizonDays: number; dailyAverage: number; projectedTotal: number; trend: string; historyDays: number }
interface DestDemand { destination: string; searches: number; uniqueUsers: number }
interface VendorAnalytics {
  vendorId: string; category: string; demand: Demand | null; conversion: Conversion
  forecast: Forecast | null; topDestinations: DestDemand[]; windowDays: number
}
interface FeedItem { destination: string; activityTypes: string[]; budgetSignal: string; at: string }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function AnalyticsClient() {
  const [vendorId, setVendorId] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [data, setData] = useState<VendorAnalytics | null>(null)
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [demand, setDemand] = useState<Demand[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Public anonymised feed loads immediately.
  useEffect(() => {
    fetch('/api/analytics/feed').then(r => r.json()).then(d => { setFeed(d.feed ?? []); setDemand(d.demand ?? []) }).catch(() => {})
  }, [])

  const load = useCallback(async (id: string) => {
    setBusy(true); setErr(''); setData(null)
    try {
      const res = await fetch(`/api/analytics?vendorId=${encodeURIComponent(id)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Not found')
      setData(d)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }, [])

  const TrendIcon = data?.forecast?.trend === 'rising' ? TrendingUp : data?.forecast?.trend === 'falling' ? TrendingDown : Minus

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-2 p-4">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        <p className="text-xs text-muted-foreground">All figures are aggregated and k-anonymised — cohorts under 5 users are suppressed.</p>
      </Card>

      {/* Vendor lookup */}
      <Card className="p-5">
        <p className="mb-2 text-sm font-semibold">Your category analytics</p>
        <div className="flex gap-2">
          <Input value={vendorId} onChange={e => setVendorId(e.target.value)} placeholder="Vendor ID"
            aria-label="Vendor ID"
            className="flex-1" />
          <Button onClick={() => { setSubmitted(vendorId); load(vendorId) }} disabled={!vendorId || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} View
          </Button>
        </div>
        <FormError message={err} className="mt-2" />
      </Card>

      {data && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="text-lg font-bold capitalize">{data.category.replace(/_/g, ' ')}</p>
              </div>
              <Badge variant="outline">last {data.windowDays}d</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Searches" value={data.demand ? data.demand.searches.toLocaleString() : '—'} />
              <Metric label="Unique users" value={data.demand ? data.demand.uniqueUsers.toLocaleString() : '—'} />
            </div>
          </Card>

          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Conversion funnel</p>
            <Funnel conversion={data.conversion} />
          </Card>

          {data.forecast && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold">Demand forecast ({data.forecast.horizonDays}d)</p>
              <div className="flex items-center gap-3">
                <TrendIcon className={`h-6 w-6 ${data.forecast.trend === 'rising' ? 'text-emerald-500' : data.forecast.trend === 'falling' ? 'text-red-500' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-lg font-bold">~{data.forecast.projectedTotal.toLocaleString()} searches</p>
                  <p className="text-xs text-muted-foreground">{data.forecast.dailyAverage}/day · trend {data.forecast.trend}</p>
                </div>
              </div>
            </Card>
          )}

          {data.topDestinations.length > 0 && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold">Top destinations</p>
              <div className="space-y-1.5">
                {data.topDestinations.map(d => (
                  <div key={d.destination} className="flex justify-between text-sm">
                    <span>{d.destination}</span>
                    <span className="text-muted-foreground">{d.searches.toLocaleString()} searches</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {!submitted && (
        <>
          {demand && demand.length > 0 && (
            <Card className="p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4" /> Demand across categories</p>
              <DemandBars demand={demand} />
            </Card>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold">Live intent feed</p>
            {!feed ? <div className="h-24 animate-pulse rounded-xl bg-secondary/50" /> : feed.length === 0 ? (
              <EmptyState icon={Activity} title="No recent intents" />
            ) : (
              <div className="space-y-2">
                {feed.slice(0, 12).map((f, i) => (
                  <Card key={i} className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.destination}</p>
                      <p className="text-xs text-muted-foreground">{f.activityTypes.join(', ')}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{f.budgetSignal}</Badge>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

function Funnel({ conversion }: { conversion: Conversion }) {
  const steps = [
    { label: 'Intents', value: conversion.stages },
    { label: 'Carts', value: conversion.carts },
    { label: 'Orders', value: conversion.orders },
  ]
  const max = Math.max(...steps.map(s => s.value), 1)
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span>{s.label}</span>
            <span className="font-medium">{s.value.toLocaleString()}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
          {i < steps.length - 1 && (
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
              {i === 0 ? pct(conversion.stageToCartRate) : pct(conversion.cartToOrderRate)} →
            </p>
          )}
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">Overall conversion: <span className="font-semibold text-foreground">{pct(conversion.overallConversion)}</span></p>
    </div>
  )
}

function DemandBars({ demand }: { demand: Demand[] }) {
  const max = Math.max(...demand.map(d => d.searches), 1)
  return (
    <div className="space-y-2">
      {demand.slice(0, 8).map(d => (
        <div key={d.activityType}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="capitalize">{d.activityType.replace(/_/g, ' ')}</span>
            <span className="text-muted-foreground">{d.searches.toLocaleString()}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(d.searches / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
