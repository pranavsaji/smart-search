'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Bot, Plus, Loader2, Handshake, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormError } from '@/components/ui/form-error'
import { SkeletonRow } from '@/components/ui/skeleton'
import { TabsNav } from '@/components/ui/tabs-nav'
import { EmptyState } from '@/components/ui/empty-state'
import { useUserEvents } from '@/hooks/useUserEvents'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface TaskStep { stepNumber: number; action: string; outcome: string; detail?: string; at: string }
interface AgentTask {
  taskId: string; kind: string; goal: string; status: string
  attempts: number; maxAttempts: number; pollIntervalMinutes: number
  steps: TaskStep[]; failureReason?: string; nextRunAt: string; createdAt: string
}
interface Offer { round: number; party: string; priceCents: number; message?: string }
interface Negotiation {
  negotiationId: string; vendorId: string; vendorType: string; itemRef: string; currency: string
  listPriceCents: number; maxBudgetCents: number; targetPriceCents: number
  status: string; offers: Offer[]; agreedPriceCents?: number; createdAt: string
}

const money = (c: number, cur = 'GBP') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(c / 100)

const TASK_STATUS: Record<string, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  pending: 'secondary', running: 'warning', awaiting_user: 'warning',
  succeeded: 'success', failed: 'destructive', cancelled: 'secondary',
}
const NEG_STATUS: Record<string, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  in_progress: 'warning', accepted: 'success', rejected: 'destructive', expired: 'secondary', failed: 'destructive',
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`)
  return res.json()
}

export function AgentsClient({ userId }: { userId: string }) {
  const [tab, setTab] = useState('tasks')
  const [bump, setBump] = useState(0)

  // Live task progress + terminal-state escalations.
  useUserEvents(userId, {
    agent_task_update: d => {
      const status = String(d.status ?? '')
      if (status === 'succeeded') toast.success('Agent task complete', { description: d.message })
      else if (status === 'failed') toast.error('Agent task failed', { description: d.message })
      else if (d.message) toast(d.message)
      setBump(b => b + 1)
    },
  })

  return (
    <>
      <TabsNav
        tabs={[{ id: 'tasks', label: 'Tasks' }, { id: 'negotiations', label: 'Negotiations' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'tasks' ? <Tasks refresh={bump} /> : <Negotiations />}
    </>
  )
}

// ─── Tasks ──────────────────────────────────────────────────────────────────────

function Tasks({ refresh = 0 }: { refresh?: number }) {
  const [tasks, setTasks] = useState<AgentTask[] | null>(null)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const load = useCallback(() => {
    getJSON<{ tasks: AgentTask[] }>('/api/agents/tasks').then(d => setTasks(d.tasks ?? [])).catch(e => setErr(e.message))
  }, [])
  useEffect(() => { load() }, [load, refresh])

  async function cancel(taskId: string) {
    await fetch(`/api/agents/tasks/${taskId}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <TaskCreate onCreated={load} />
      <FormError message={err} />
      {!tasks ? <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div> : tasks.length === 0 ? (
        <EmptyState icon={Bot} title="No agent tasks yet" hint='e.g. "Book the cheapest flight to Tokyo in August and notify me."' />
      ) : (
        <div className="space-y-3">
          {tasks.map(t => (
            <Card key={t.taskId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t.goal}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.kind.replace(/_/g, ' ')} · attempt {t.attempts}/{t.maxAttempts} · every {t.pollIntervalMinutes}m
                  </p>
                </div>
                <Badge variant={TASK_STATUS[t.status] ?? 'secondary'}>{t.status.replace(/_/g, ' ')}</Badge>
              </div>
              {t.failureReason && <p className="mt-2 text-xs text-destructive">{t.failureReason}</p>}
              <div className="mt-3 flex items-center gap-3">
                {t.steps.length > 0 && (
                  <button onClick={() => setExpanded(e => e === t.taskId ? null : t.taskId)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    {expanded === t.taskId ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {t.steps.length} step{t.steps.length === 1 ? '' : 's'}
                  </button>
                )}
                {!['succeeded', 'failed', 'cancelled'].includes(t.status) && (
                  <button onClick={() => cancel(t.taskId)} className="text-xs text-muted-foreground hover:text-destructive">Cancel</button>
                )}
              </div>
              {expanded === t.taskId && (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {t.steps.map(s => (
                    <div key={s.stepNumber} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 font-mono text-muted-foreground">{s.stepNumber}.</span>
                      <span className="flex-1">{s.action}{s.detail ? ` — ${s.detail}` : ''}</span>
                      <Badge variant="outline" className="text-[10px]">{s.outcome}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCreate({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('find_cheapest')
  const [goal, setGoal] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!goal.trim()) { setErr('Describe the goal'); return }
    setBusy(true); setErr('')
    try {
      const constraints: Record<string, unknown> = {}
      if (maxPrice) constraints.maxPriceCents = Math.round(parseFloat(maxPrice) * 100)
      if (destination) constraints.destination = destination
      const res = await fetch('/api/agents/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, goal, constraints }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create task')
      setOpen(false); setGoal(''); setMaxPrice(''); setDestination('')
      onCreated()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!open) return <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New agent task</Button>

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">New task</p>
        <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
      </div>
      <Select value={kind} onChange={e => setKind(e.target.value)} aria-label="Task kind">
        <option value="find_cheapest">Find cheapest</option>
        <option value="book_when_available">Book when available</option>
        <option value="watch_price">Watch price</option>
      </Select>
      <Textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2}
        placeholder="What should the agent achieve?"
        aria-label="Task goal"
        className="resize-none" />
      <div className="flex gap-2">
        <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination (optional)"
          aria-label="Destination"
          className="flex-1" />
        <div className="relative w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
          <Input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Max"
            aria-label="Maximum price in pounds"
            className="pl-7" />
        </div>
      </div>
      <FormError message={err} className="text-xs" />
      <Button onClick={submit} disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create task'}</Button>
    </Card>
  )
}

// ─── Negotiations ─────────────────────────────────────────────────────────────

function Negotiations() {
  const [negs, setNegs] = useState<Negotiation[] | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    getJSON<{ negotiations: Negotiation[] }>('/api/agents/negotiations').then(d => setNegs(d.negotiations ?? [])).catch(e => setErr(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <NegCreate onCreated={load} />
      <FormError message={err} />
      {!negs ? <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div> : negs.length === 0 ? (
        <EmptyState icon={Handshake} title="No negotiations yet" hint="Let Genie negotiate a price within your budget." />
      ) : (
        <div className="space-y-3">
          {negs.map(n => (
            <Card key={n.negotiationId} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{n.itemRef}</p>
                  <p className="text-xs text-muted-foreground">{n.vendorType} · {n.vendorId}</p>
                </div>
                <Badge variant={NEG_STATUS[n.status] ?? 'secondary'}>{n.status.replace(/_/g, ' ')}</Badge>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>List {money(n.listPriceCents, n.currency)}</span>
                <span>Budget {money(n.maxBudgetCents, n.currency)}</span>
                {n.agreedPriceCents != null && <span className="font-semibold text-emerald-600">Agreed {money(n.agreedPriceCents, n.currency)}</span>}
              </div>
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                {n.offers.map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className={o.party === 'agent' ? 'text-primary' : 'text-muted-foreground'}>
                      R{o.round} · {o.party}
                    </span>
                    <span className="font-medium">{money(o.priceCents, n.currency)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function NegCreate({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [itemRef, setItemRef] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [list, setList] = useState('')
  const [budget, setBudget] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    const listCents = Math.round(parseFloat(list) * 100)
    const budgetCents = Math.round(parseFloat(budget) * 100)
    if (!itemRef || !vendorId || !listCents || !budgetCents) { setErr('Fill in all fields'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/agents/negotiations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, vendorType: 'marketplace', itemRef, listPriceCents: listCents, maxBudgetCents: budgetCents }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setOpen(false); setItemRef(''); setVendorId(''); setList(''); setBudget('')
      onCreated()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!open) return <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Start negotiation</Button>

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold">New negotiation</p>
      <Input value={itemRef} onChange={e => setItemRef(e.target.value)} placeholder="Item reference / offer ID"
        aria-label="Item reference" />
      <Input value={vendorId} onChange={e => setVendorId(e.target.value)} placeholder="Vendor ID"
        aria-label="Vendor ID" />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
          <Input type="number" value={list} onChange={e => setList(e.target.value)} placeholder="List price"
            aria-label="List price in pounds"
            className="pl-7" />
        </div>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
          <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Max budget"
            aria-label="Maximum budget in pounds"
            className="pl-7" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The agent never offers or agrees above your budget.</p>
      <FormError message={err} className="text-xs" />
      <Button onClick={submit} disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Negotiate'}</Button>
    </Card>
  )
}

