'use client'

import { useState } from 'react'
import { Network, Search, Loader2, Sparkles, MapPin, Package, Store, Wrench, Tag } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

interface RelatedEntity { nodeKey: string; entityType: string; value: string; label: string; relation: string; weight: number }

const TYPE_ICON: Record<string, React.ElementType> = {
  destination: MapPin, product: Package, vendor: Store, service: Wrench, activity: Tag,
}

const EXAMPLES = ['destination:paris', 'destination:tokyo', 'activity:flights', 'activity:stays']

export function GraphClient() {
  const [nodeKey, setNodeKey] = useState('')
  const [mode, setMode] = useState<'complete' | 'related'>('complete')
  const [related, setRelated] = useState<RelatedEntity[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [queried, setQueried] = useState('')

  async function run(key: string) {
    if (!key) return
    setBusy(true); setErr(''); setQueried(key)
    try {
      const res = await fetch(`/api/graph/related?nodeKey=${encodeURIComponent(key)}&mode=${mode}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setRelated(d.related ?? [])
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setRelated([]) } finally { setBusy(false) }
  }

  const maxWeight = related && related.length ? Math.max(...related.map(r => r.weight)) : 1

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex gap-1 rounded-lg border border-border p-1">
          {(['complete', 'related'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
              {m === 'complete' ? 'Complete the trip' : 'All related'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={nodeKey} onChange={e => setNodeKey(e.target.value)} placeholder="entityType:value (e.g. destination:paris)"
            onKeyDown={e => e.key === 'Enter' && run(nodeKey)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm" />
          <Button onClick={() => run(nodeKey)} disabled={!nodeKey || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => { setNodeKey(ex); run(ex) }}
              className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-secondary">
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {related && (
        related.length === 0 ? (
          <EmptyState icon={Network} title="No connections yet" hint={`No edges from "${queried}". The graph fills in as people search and book.`} />
        ) : (
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" /> Related to <span className="font-mono">{queried}</span></p>
            <div className="space-y-2">
              {related.map(r => {
                const Icon = TYPE_ICON[r.entityType] ?? Tag
                return (
                  <button key={r.nodeKey} onClick={() => { setNodeKey(r.nodeKey); run(r.nodeKey) }}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-left transition-colors hover:bg-secondary">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.label}</p>
                      <p className="text-[10px] text-muted-foreground">{r.entityType} · {r.relation.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="w-24">
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(r.weight / maxWeight) * 100}%` }} />
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.weight}</Badge>
                  </button>
                )
              })}
            </div>
          </Card>
        )
      )}
    </div>
  )
}
