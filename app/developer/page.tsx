'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SkeletonPage } from '@/components/ui/skeleton'

interface DeveloperAccount {
  developerId: string
  name: string
  email: string
  tier: string
  createdAt: string
}

interface Stats {
  keys: number
  adapters: number
  webhooks: number
}

function RegisterForm({ onRegistered }: { onRegistered: (account: DeveloperAccount) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ecosystem/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Registration failed')
      }
      const account = await res.json()
      onRegistered(account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-semibold mb-2">Create Developer Account</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Get API keys, register adapters, and track usage.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
            placeholder="Acme Corp"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
            placeholder="dev@example.com"
            required
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background py-2 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Registering…' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}

const CARDS = [
  { href: '/developer/keys', title: 'API Keys', desc: 'Generate and manage authentication keys', stat: 'keys' as keyof Stats },
  { href: '/developer/adapters', title: 'Adapters', desc: 'Register your service adapters for the marketplace', stat: 'adapters' as keyof Stats },
  { href: '/developer/webhooks', title: 'Webhooks', desc: 'Subscribe to platform events in real-time', stat: 'webhooks' as keyof Stats },
  { href: '/developer/usage', title: 'Usage', desc: 'Monitor API call volume and quota', stat: null },
]

export default function DeveloperPage() {
  const [account, setAccount] = useState<DeveloperAccount | null | undefined>(undefined)
  const [stats, setStats] = useState<Stats>({ keys: 0, adapters: 0, webhooks: 0 })

  useEffect(() => {
    fetch('/api/ecosystem/register')
      .then(r => r.json())
      .then(d => setAccount(d.account ?? null))
      .catch(() => setAccount(null))

    Promise.all([
      fetch('/api/ecosystem/keys').then(r => r.ok ? r.json() : []),
      fetch('/api/ecosystem/adapters?mine=true').then(r => r.ok ? r.json() : []),
      fetch('/api/ecosystem/webhooks').then(r => r.ok ? r.json() : []),
    ]).then(([keys, adapters, webhooks]) => {
      setStats({
        keys: Array.isArray(keys) ? keys.length : 0,
        adapters: Array.isArray(adapters) ? adapters.length : 0,
        webhooks: Array.isArray(webhooks) ? webhooks.length : 0,
      })
    }).catch(() => {})
  }, [])

  if (account === undefined) {
    return <SkeletonPage rows={3} />
  }

  if (!account) {
    return <RegisterForm onRegistered={a => setAccount(a)} />
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">iAM Developer Platform</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, <span className="font-medium text-foreground">{account.name}</span>
          {' · '}
          <span className="capitalize">{account.tier}</span> tier
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
          >
            <p className="text-2xl font-bold">{card.stat ? stats[card.stat] : '→'}</p>
            <p className="font-medium mt-1">{card.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{card.desc}</p>
          </Link>
        ))}
      </div>

      <div className="border border-border rounded-lg p-4 text-sm">
        <p className="font-medium mb-1">Developer ID</p>
        <code className="text-muted-foreground font-mono">{account.developerId}</code>
      </div>
    </div>
  )
}
