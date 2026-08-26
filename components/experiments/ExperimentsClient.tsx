'use client'

import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, Plus, Loader2, Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

interface Variant { name: string; allocation: number; weight?: number }
interface Experiment { key: string; name: string; description?: string; variants: Variant[]; active: boolean }
interface VariantResult { variant: string; exposures: number; conversions: number; conversionRate: number }

export function ExperimentsClient({ isAdmin }: { isAdmin: boolean }) {
  const [experiments, setExperiments] = useState<Experiment[] | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    fetch('/api/experiments?active=false').then(r => r.json()).then(d => setExperiments(d.experiments ?? [])).catch(e => setErr(String(e)))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      {isAdmin && <ExperimentCreate onCreated={load} />}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!experiments ? (
        <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary/50" />)}</div>
      ) : experiments.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No experiments" hint={isAdmin ? 'Create one above to start testing ranking variants.' : 'No active experiments right now.'} />
      ) : (
        <div className="space-y-3">
          {experiments.map(e => <ExperimentCard key={e.key} experiment={e} />)}
        </div>
      )}
    </div>
  )
}

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const [results, setResults] = useState<VariantResult[] | null>(null)
  const [assignment, setAssignment] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function loadDetail() {
    setOpen(o => !o)
    if (results) return
    const res = await fetch(`/api/experiments/${experiment.key}`)
    if (res.ok) {
      const d = await res.json()
      setResults(d.results ?? [])
      setAssignment(d.assignment?.name ?? null)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{experiment.name}</p>
            <Badge variant={experiment.active ? 'success' : 'secondary'}>{experiment.active ? 'active' : 'paused'}</Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{experiment.key}</p>
          {experiment.description && <p className="mt-1 text-xs text-muted-foreground">{experiment.description}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {experiment.variants.map(v => (
          <Badge key={v.name} variant="outline" className="text-[10px]">
            {v.name} · {Math.round(v.allocation * 100)}%{v.weight != null ? ` · w=${v.weight}` : ''}
          </Badge>
        ))}
      </div>

      <button onClick={loadDetail} className="mt-3 text-xs text-primary hover:underline">
        {open ? 'Hide results' : 'View results & your assignment'}
      </button>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          {assignment && <p className="mb-2 text-xs">You&rsquo;re in: <Badge variant="locked" className="text-[10px]">{assignment}</Badge></p>}
          {!results ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : results.length === 0 ? (
            <p className="text-xs text-muted-foreground">No exposures recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {results.map(r => (
                <div key={r.variant} className="flex items-center justify-between text-xs">
                  <span>{r.variant}</span>
                  <span className="text-muted-foreground">{r.exposures} exp · {r.conversions} conv · <span className="font-semibold text-foreground">{(r.conversionRate * 100).toFixed(1)}%</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function ExperimentCreate({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [rows, setRows] = useState<Variant[]>([{ name: 'control', allocation: 0.5, weight: 0 }, { name: 'treatment', allocation: 0.5, weight: 0.15 }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const sum = rows.reduce((s, r) => s + (Number(r.allocation) || 0), 0)

  async function submit() {
    setErr('')
    if (Math.abs(sum - 1) > 0.001) { setErr('Allocations must sum to 1.0'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/experiments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, name, variants: rows.map(r => ({ name: r.name, allocation: Number(r.allocation), weight: r.weight })) }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setOpen(false); setKey(''); setName('')
      onCreated()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Lock className="h-3.5 w-3.5" /> <Plus className="h-4 w-4" /> New experiment (admin)
      </Button>
    )
  }

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold">New experiment</p>
      <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} placeholder="key (e.g. rerank_weight)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm" />
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input value={r.name} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="variant"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input type="number" step="0.05" value={r.allocation} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, allocation: Number(e.target.value) } : x))}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm" title="allocation" />
            <input type="number" step="0.05" value={r.weight ?? 0} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))}
              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm" title="weight" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setRows(rs => [...rs, { name: '', allocation: 0, weight: 0 }])} className="text-xs text-primary hover:underline">+ Variant</button>
        <span className={`text-xs ${Math.abs(sum - 1) < 0.001 ? 'text-emerald-600' : 'text-muted-foreground'}`}>Σ alloc = {sum.toFixed(2)}</span>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy} className="flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  )
}
