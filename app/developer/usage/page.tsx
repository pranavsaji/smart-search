'use client'

import { useEffect, useState } from 'react'
import { SkeletonPage } from '@/components/ui/skeleton'

interface UsageData {
  developerId: string
  month: string
  usage: Record<string, number>
}

interface KeyData {
  keyId: string
  name: string
  monthlyLimit: number
  tier: string
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [keys, setKeys] = useState<KeyData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/ecosystem/usage').then(r => r.ok ? r.json() : null),
      fetch('/api/ecosystem/keys').then(r => r.ok ? r.json() : []),
    ]).then(([usage, k]) => {
      setData(usage)
      setKeys(Array.isArray(k) ? k : [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonPage rows={3} />

  const total = data?.usage?.total ?? 0
  const monthlyLimit = keys[0]?.monthlyLimit ?? 1000
  const pct = monthlyLimit === Infinity ? 0 : Math.min(100, Math.round((total / monthlyLimit) * 100))

  const adapterBreakdown = Object.entries(data?.usage ?? {})
    .filter(([k]) => k.startsWith('adapter:'))
    .map(([k, v]) => ({ name: k.replace('adapter:', ''), calls: v as number }))
    .sort((a, b) => b.calls - a.calls)

  const endpointBreakdown = Object.entries(data?.usage ?? {})
    .filter(([k]) => k.startsWith('endpoint:'))
    .map(([k, v]) => ({ name: k.replace('endpoint:', ''), calls: v as number }))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usage</h1>
        <span className="text-sm text-muted-foreground">{data?.month}</span>
      </div>

      <div className="border border-border rounded-lg p-6">
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-3xl font-bold">{total.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">API calls this month</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {monthlyLimit === Infinity ? 'Unlimited' : `of ${monthlyLimit.toLocaleString()} (${pct}%)`}
          </p>
        </div>
        {monthlyLimit !== Infinity && (
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {adapterBreakdown.length > 0 && (
        <div className="border border-border rounded-lg p-6">
          <h2 className="font-semibold mb-4">By Adapter</h2>
          <div className="space-y-2">
            {adapterBreakdown.map(row => (
              <div key={row.name} className="flex items-center gap-3">
                <span className="text-sm font-mono w-48 truncate">{row.name}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className="h-1.5 bg-foreground rounded-full"
                    style={{ width: total > 0 ? `${(row.calls / total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-12 text-right">{row.calls}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {endpointBreakdown.length > 0 && (
        <div className="border border-border rounded-lg p-6">
          <h2 className="font-semibold mb-4">By Endpoint</h2>
          <div className="grid grid-cols-3 gap-4">
            {endpointBreakdown.map(row => (
              <div key={row.name} className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{row.calls}</p>
                <p className="text-sm text-muted-foreground capitalize">{row.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-muted-foreground">No API calls recorded this month.</p>
      )}
    </div>
  )
}
