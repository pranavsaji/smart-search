'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Wallet as WalletIcon, Gift, Users, Crown, ArrowUpRight, ArrowDownLeft,
  Plus, Copy, Check, Loader2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/ui/form-error'
import { SkeletonRow } from '@/components/ui/skeleton'
import { TabsNav } from '@/components/ui/tabs-nav'
import { EmptyState } from '@/components/ui/empty-state'
import { useUserEvents } from '@/hooks/useUserEvents'

// ─── Types (mirror the API responses) ──────────────────────────────────────────

interface WalletTx { txId: string; type: string; amountCents: number; currency: string; description?: string; createdAt: string }
interface CreditEntry { entryId: string; type: string; amountCents: number; description?: string; createdAt: string }
interface SplitParticipant { handle: string; ratioPercent: number; amountCents: number; status: string }
interface Split { splitId: string; description: string; totalAmountCents: number; currency: string; status: string; participants: SplitParticipant[]; createdAt: string }

const money = (cents: number, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100)

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`)
  return res.json()
}

// ─── Root ───────────────────────────────────────────────────────────────────────

export function WalletClient({ handle, userId }: { handle: string; userId: string }) {
  const [tab, setTab] = useState('overview')
  const [bump, setBump] = useState(0)
  const refresh = () => setBump(b => b + 1)

  // Live updates: wallet credited, split requested/settled.
  useUserEvents(userId, {
    wallet_credited: d => {
      toast.success('Wallet topped up', { description: money(d.amountCents) + ' added to your balance' })
      refresh()
    },
    split_request: d => {
      toast('New split request', { description: `@${d.requesterHandle} requested ${money(d.amountCents, d.currency)}` })
      refresh()
    },
    split_settled: () => { toast.success('A split was settled'); refresh() },
  })

  return (
    <>
      <TabsNav
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'transactions', label: 'Transactions' },
          { id: 'credits', label: 'Credits' },
          { id: 'splits', label: 'Splits' },
          { id: 'pro', label: 'Smart Search Pro' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'overview' && <Overview refresh={bump} />}
      {tab === 'transactions' && <Transactions refresh={bump} />}
      {tab === 'credits' && <Credits />}
      {tab === 'splits' && <Splits handle={handle} refresh={bump} />}
      {tab === 'pro' && <Pro />}
    </>
  )
}

// ─── Overview (balance + top-up) ────────────────────────────────────────────────

function Overview({ refresh = 0 }: { refresh?: number }) {
  const [balance, setBalance] = useState<number | null>(null)
  const [currency, setCurrency] = useState('GBP')
  const [credits, setCredits] = useState<number | null>(null)
  const [isPro, setIsPro] = useState(false)
  const [amount, setAmount] = useState('25')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [w, c, s] = await Promise.all([
        getJSON<{ wallet: { balanceCents: number; currency: string } }>('/api/wallet'),
        getJSON<{ balance: number }>('/api/credits'),
        getJSON<{ isPro: boolean }>('/api/subscriptions'),
      ])
      setBalance(w.wallet.balanceCents)
      setCurrency(w.wallet.currency ?? 'GBP')
      setCredits(c.balance)
      setIsPro(s.isPro)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load wallet')
    }
  }, [])

  useEffect(() => { load() }, [load, refresh])

  async function topUp() {
    const cents = Math.round(parseFloat(amount) * 100)
    if (!cents || cents < 100) { setErr('Minimum top-up is £1'); return }
    setBusy(true); setErr(''); setMsg('')
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, currency }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Top-up failed')
      setMsg(`Top-up of ${money(cents, currency)} initiated — confirm with your card to credit the wallet.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Top-up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <FormError message={err} />

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-blue-500/15 to-sky-400/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Wallet balance</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {balance === null ? '—' : money(balance, currency)}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <WalletIcon className="h-6 w-6" />
            </div>
          </div>
          {isPro && <Badge variant="locked" className="mt-3 gap-1"><Crown className="h-3 w-3" /> Smart Search Pro</Badge>}
        </div>
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Credits</p>
            <p className="text-lg font-semibold">{credits === null ? '—' : money(credits, currency)}</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="text-lg font-semibold">{isPro ? 'Pro' : 'Free'}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Top up</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
            <Input
              type="number" min="1" step="1" value={amount}
              onChange={e => setAmount(e.target.value)}
              aria-label="Top-up amount in pounds"
              className="pl-7"
            />
          </div>
          <Button onClick={topUp} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add funds'}
          </Button>
        </div>
        <div className="mt-2 flex gap-1.5">
          {[10, 25, 50, 100].map(v => (
            <button key={v} onClick={() => setAmount(String(v))}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary">
              £{v}
            </button>
          ))}
        </div>
        {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
      </Card>
    </div>
  )
}

// ─── Transactions ─────────────────────────────────────────────────────────────

function Transactions({ refresh = 0 }: { refresh?: number }) {
  const [txns, setTxns] = useState<WalletTx[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    getJSON<{ transactions: WalletTx[] }>('/api/wallet')
      .then(d => setTxns(d.transactions ?? []))
      .catch(e => setErr(e.message))
  }, [refresh])

  if (err) return <FormError message={err} />
  if (!txns) {
    return <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div>
  }
  if (txns.length === 0) return <EmptyState icon={WalletIcon} title="No transactions yet" hint="Top up or make a purchase to see activity here." />

  return (
    <div className="space-y-2">
      {txns.map(t => {
        const credit = t.amountCents >= 0
        return (
          <Card key={t.txId} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${credit ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-medium">{t.description ?? t.type}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString('en-GB')}</p>
              </div>
            </div>
            <p className={`text-sm font-semibold ${credit ? 'text-emerald-600' : ''}`}>
              {credit ? '+' : ''}{money(t.amountCents, t.currency)}
            </p>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Credits ──────────────────────────────────────────────────────────────────

function Credits() {
  const [data, setData] = useState<{ balance: number; history: CreditEntry[]; referralCode: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    getJSON<{ balance: number; history: CreditEntry[]; referralCode: string }>('/api/credits')
      .then(setData).catch(e => setErr(e.message))
  }, [])

  if (err) return <FormError message={err} />
  if (!data) {
    return <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div>
  }

  const referralUrl = typeof window !== 'undefined' ? `${window.location.origin}/signup?ref=${data.referralCode}` : data.referralCode

  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <Gift className="mx-auto h-6 w-6 text-primary" />
        <p className="mt-2 text-3xl font-bold">{money(data.balance)}</p>
        <p className="text-xs text-muted-foreground">Available credits · 1% cashback on every order</p>
      </Card>

      <Card className="p-5">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Refer a friend</p>
        <p className="mb-3 text-xs text-muted-foreground">You both earn credits on their first booking.</p>
        <div className="flex gap-2">
          <Input readOnly value={referralUrl}
            aria-label="Referral link"
            className="flex-1 truncate text-xs" />
          <Button variant="outline" size="sm"
            onClick={() => { navigator.clipboard.writeText(referralUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold">History</p>
        {data.history.length === 0 ? (
          <EmptyState icon={Gift} title="No credit activity yet" />
        ) : (
          <div className="space-y-2">
            {data.history.map(h => (
              <Card key={h.entryId} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium">{h.description ?? h.type}</p>
                  <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString('en-GB')}</p>
                </div>
                <p className={`text-sm font-semibold ${h.amountCents >= 0 ? 'text-emerald-600' : ''}`}>
                  {h.amountCents >= 0 ? '+' : ''}{money(h.amountCents)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Splits ───────────────────────────────────────────────────────────────────

function Splits({ handle, refresh = 0 }: { handle: string; refresh?: number }) {
  const [splits, setSplits] = useState<Split[] | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    getJSON<{ splits: Split[] }>('/api/splits').then(d => setSplits(d.splits ?? [])).catch(e => setErr(e.message))
  }, [])
  useEffect(() => { load() }, [load, refresh])

  const statusVariant = (s: string) => s === 'completed' ? 'success' : s === 'partial' ? 'warning' : 'secondary'

  return (
    <div className="space-y-4">
      <SplitCreate handle={handle} onCreated={load} />
      <FormError message={err} />
      {!splits ? <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div> : splits.length === 0 ? (
        <EmptyState icon={Users} title="No split requests" hint="Split any Stage cost with friends in custom ratios." />
      ) : (
        <div className="space-y-3">
          {splits.map(s => (
            <Card key={s.splitId} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{s.description}</p>
                <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
              </div>
              <p className="mb-3 text-lg font-bold">{money(s.totalAmountCents, s.currency)}</p>
              <div className="space-y-1.5">
                {s.participants.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">@{p.handle} · {p.ratioPercent}%</span>
                    <span className="flex items-center gap-2">
                      {money(p.amountCents, s.currency)}
                      <Badge variant={p.status === 'paid' ? 'success' : 'outline'} className="text-[10px]">{p.status}</Badge>
                    </span>
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

function SplitCreate({ handle, onCreated }: { handle: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [total, setTotal] = useState('60')
  const [rows, setRows] = useState([{ handle: '', ratioPercent: 50 }, { handle: '', ratioPercent: 50 }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const ratioSum = rows.reduce((s, r) => s + (Number(r.ratioPercent) || 0), 0)

  async function submit() {
    setErr('')
    if (ratioSum !== 100) { setErr('Ratios must sum to 100%'); return }
    const cents = Math.round(parseFloat(total) * 100)
    setBusy(true)
    try {
      const res = await fetch('/api/splits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: `manual_${Date.now()}`,
          requesterHandle: handle,
          totalAmountCents: cents,
          description: desc || 'Shared cost',
          participants: rows.map(r => ({ userId: r.handle, handle: r.handle, ratioPercent: Number(r.ratioPercent) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create split')
      setOpen(false); setDesc(''); setRows([{ handle: '', ratioPercent: 50 }, { handle: '', ratioPercent: 50 }])
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally { setBusy(false) }
  }

  if (!open) {
    return <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New split request</Button>
  }

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold">New split</p>
      <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's it for?"
        aria-label="Split description" />
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
        <Input type="number" value={total} onChange={e => setTotal(e.target.value)}
          aria-label="Total amount in pounds"
          className="pl-7" />
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input value={r.handle} placeholder="@handle"
              onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, handle: e.target.value } : x))}
              aria-label={`Participant ${i + 1} handle`}
              className="flex-1" />
            <div className="relative w-24">
              <Input type="number" value={r.ratioPercent}
                onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, ratioPercent: Number(e.target.value) } : x))}
                aria-label={`Participant ${i + 1} share percentage`}
                className="pr-7" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setRows(rs => [...rs, { handle: '', ratioPercent: 0 }])} className="text-xs text-primary hover:underline">+ Add person</button>
        <span className={`text-xs ${ratioSum === 100 ? 'text-emerald-600' : 'text-muted-foreground'}`}>Total: {ratioSum}%</span>
      </div>
      <FormError message={err} className="text-xs" />
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy} className="flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send request'}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  )
}

// ─── Pro ──────────────────────────────────────────────────────────────────────

function Pro() {
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const load = useCallback(() => {
    getJSON<{ isPro: boolean }>('/api/subscriptions').then(d => setIsPro(d.isPro)).catch(() => setIsPro(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function cancel() {
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setMsg('Pro cancelled — active until period end.'); load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  const features = ['Unlimited Genie queries', 'Priority booking', 'Exclusive vendor deals', 'Early access to new features']

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-amber-500/15 to-yellow-400/5 p-6 text-center">
        <Crown className="mx-auto h-7 w-7 text-amber-500" />
        <p className="mt-2 text-xl font-bold">Smart Search Pro</p>
        <p className="text-sm text-muted-foreground">£9.99 / month</p>
        {isPro && <Badge variant="success" className="mt-2">Active</Badge>}
      </div>
      <div className="p-6">
        <ul className="mb-5 space-y-2">
          {features.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-emerald-500" /> {f}</li>
          ))}
        </ul>
        {isPro === null ? <div className="space-y-2">{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</div> : isPro ? (
          <Button variant="outline" className="w-full" onClick={cancel} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel Pro'}
          </Button>
        ) : (
          <Button className="w-full" disabled title="Connect a card at checkout to upgrade">
            Upgrade to Pro
          </Button>
        )}
        {!isPro && <p className="mt-2 text-center text-xs text-muted-foreground">Upgrade completes at checkout with your card.</p>}
        {msg && <p className="mt-3 text-center text-sm text-emerald-600">{msg}</p>}
      </div>
    </Card>
  )
}

