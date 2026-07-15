'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Loader2, Users, Wallet, CheckSquare, Check, X, UserPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabsNav } from '@/components/ui/tabs-nav'
import { EmptyState } from '@/components/ui/empty-state'

interface Member { userId: string; email: string; role: string; department?: string }
interface BudgetLimit { department?: string; periodType: string; limitCents: number; currency: string; spentCents?: number; usagePercent?: number; alertThresholdPercent?: number }
interface Approval { requestId: string; requesterId: string; amountCents: number; currency: string; description?: string; status: string; createdAt: string }
interface Org { orgId: string; name: string; domain?: string; ownerId: string; members: Member[]; budgetLimits: BudgetLimit[] }

const money = (c: number, cur = 'USD') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(c / 100)

export function OrgClient({ currentUserId }: { currentUserId: string }) {
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    fetch('/api/org').then(r => r.json()).then(d => {
      setOrgs(d.orgs ?? [])
      if (!selected && d.orgs?.[0]) setSelected(d.orgs[0].orgId)
    }).catch(e => setErr(String(e)))
  }, [selected])
  useEffect(() => { load() }, [load])

  const org = orgs?.find(o => o.orgId === selected) ?? null

  return (
    <div className="space-y-4">
      <OrgCreate onCreated={load} />
      {err && <p className="text-sm text-destructive">{err}</p>}

      {!orgs ? <div className="h-24 animate-pulse rounded-xl bg-secondary/50" />
        : orgs.length === 0 ? <EmptyState icon={Building2} title="No teams yet" hint="Create a company account to share Stages and set budgets." />
        : (
          <>
            {orgs.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {orgs.map(o => (
                  <button key={o.orgId} onClick={() => setSelected(o.orgId)}
                    className={`rounded-full border px-3 py-1 text-xs ${selected === o.orgId ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                    {o.name}
                  </button>
                ))}
              </div>
            )}
            {org && <OrgDetail org={org} currentUserId={currentUserId} onChange={load} />}
          </>
        )}
    </div>
  )
}

function OrgCreate({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('Name required'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/org', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain: domain || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setOpen(false); setName(''); setDomain('')
      onCreated()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!open) return <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New team</Button>

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold">Create a team</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Company name"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="Domain (optional, e.g. acme.com)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy} className="flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  )
}

function OrgDetail({ org, currentUserId, onChange }: { org: Org; currentUserId: string; onChange: () => void }) {
  const [tab, setTab] = useState('members')
  const canManage = org.ownerId === currentUserId || org.members.some(m => m.userId === currentUserId && m.role === 'admin')

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-secondary/30 p-4">
        <p className="text-base font-bold">{org.name}</p>
        {org.domain && <p className="text-xs text-muted-foreground">{org.domain}</p>}
      </div>
      <div className="p-4">
        <TabsNav
          tabs={[
            { id: 'members', label: 'Members', count: org.members.length },
            { id: 'budgets', label: 'Budgets', count: org.budgetLimits.length },
            { id: 'approvals', label: 'Approvals' },
          ]}
          active={tab}
          onChange={setTab}
        />
        {tab === 'members' && <Members org={org} canManage={canManage} onChange={onChange} />}
        {tab === 'budgets' && <Budgets org={org} canManage={canManage} onChange={onChange} />}
        {tab === 'approvals' && <Approvals org={org} />}
      </div>
    </Card>
  )
}

function Members({ org, canManage, onChange }: { org: Org; canManage: boolean; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function add() {
    if (!email.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/org/${org.orgId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: email, email, role }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setAdding(false); setEmail('')
      onChange()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      {org.members.map(m => (
        <div key={m.userId} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">{m.email}</span>
            {m.department && <span className="text-xs text-muted-foreground">· {m.department}</span>}
          </div>
          <Badge variant={m.role === 'owner' ? 'locked' : m.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{m.role}</Badge>
        </div>
      ))}
      {canManage && (adding ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="member@company.com" type="email"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <select value={role} onChange={e => setRole(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={add} disabled={busy} className="flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><UserPlus className="h-3 w-3" /> Add member</button>
      ))}
    </div>
  )
}

function Budgets({ org, canManage, onChange }: { org: Org; canManage: boolean; onChange: () => void }) {
  const [budgets, setBudgets] = useState<BudgetLimit[]>(org.budgetLimits)
  const [adding, setAdding] = useState(false)
  const [dept, setDept] = useState('')
  const [limit, setLimit] = useState('')
  const [period, setPeriod] = useState('monthly')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/org/${org.orgId}/budget`).then(r => r.json()).then(d => setBudgets(d.budgets ?? [])).catch(() => {})
  }, [org.orgId])
  useEffect(() => { load() }, [load])

  async function add() {
    const cents = Math.round(parseFloat(limit) * 100)
    if (!cents) return
    setBusy(true)
    try {
      await fetch(`/api/org/${org.orgId}/budget`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: dept || undefined, periodType: period, limitCents: cents, currency: 'USD', alertThresholdPercent: 80 }),
      })
      setAdding(false); setDept(''); setLimit('')
      load(); onChange()
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      {budgets.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No budget limits set.</p>}
      {budgets.map((b, i) => {
        const usage = b.usagePercent ?? (b.spentCents != null ? (b.spentCents / b.limitCents) * 100 : 0)
        return (
          <div key={i} className="rounded-lg bg-secondary/30 p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-muted-foreground" /> {b.department ?? 'Company-wide'}</span>
              <span className="text-xs text-muted-foreground">{b.periodType} · {money(b.limitCents, b.currency)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className={`h-full rounded-full ${usage >= 100 ? 'bg-red-500' : usage >= (b.alertThresholdPercent ?? 80) ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(usage, 100)}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{usage.toFixed(0)}% used</p>
          </div>
        )
      })}
      {canManage && (adding ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <input value={dept} onChange={e => setDept(e.target.value)} placeholder="Department (optional)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <select value={period} onChange={e => setPeriod(e.target.value)} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
            </select>
            <div className="relative w-32">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="Limit" className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={add} disabled={busy} className="flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add budget'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add budget limit</button>
      ))}
    </div>
  )
}

function Approvals({ org }: { org: Org }) {
  const [approvals, setApprovals] = useState<Approval[] | null>(null)
  const [view, setView] = useState<'mine' | 'pending'>('pending')
  const load = useCallback(() => {
    fetch(`/api/org/${org.orgId}/approvals?view=${view}`).then(r => r.json()).then(d => setApprovals(d.approvals ?? [])).catch(() => setApprovals([]))
  }, [org.orgId, view])
  useEffect(() => { load() }, [load])

  async function decide(requestId: string, action: 'approve' | 'reject') {
    await fetch(`/api/org/${org.orgId}/approvals`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    })
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-border p-1">
        {(['pending', 'mine'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
            {v === 'pending' ? 'To review' : 'My requests'}
          </button>
        ))}
      </div>
      {!approvals ? <div className="h-16 animate-pulse rounded-lg bg-secondary/50" />
        : approvals.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Nothing here.</p>
        : approvals.map(a => (
          <div key={a.requestId} className="rounded-lg bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{a.description ?? 'Purchase request'}</p>
                <p className="text-xs text-muted-foreground">{money(a.amountCents, a.currency)} · {new Date(a.createdAt).toLocaleDateString('en-GB')}</p>
              </div>
              <Badge variant={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'destructive' : 'warning'}>{a.status}</Badge>
            </div>
            {view === 'pending' && a.status === 'pending' && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => decide(a.requestId, 'approve')} className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 hover:bg-emerald-500/20"><Check className="h-3 w-3" /> Approve</button>
                <button onClick={() => decide(a.requestId, 'reject')} className="flex items-center gap-1 rounded-md bg-red-500/10 px-2.5 py-1 text-xs text-red-600 hover:bg-red-500/20"><X className="h-3 w-3" /> Reject</button>
              </div>
            )}
          </div>
        ))}
      <p className="flex items-center gap-1 pt-1 text-[10px] text-muted-foreground"><CheckSquare className="h-3 w-3" /> Purchases over the threshold need manager sign-off · 48h expiry</p>
    </div>
  )
}
