'use client'

import { useState, useEffect } from 'react'

interface ApiKey {
  keyId: string
  name: string
  prefix: string
  tier: string
  monthlyLimit: number
  isActive: boolean
  lastUsedAt?: string
  createdAt: string
  expiresAt?: string
}

function CopyBox({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
      <p className="text-sm font-medium mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm font-mono break-all">{value}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="text-xs px-2 py-1 border border-border rounded whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">This key is shown once only. Store it securely.</p>
    </div>
  )
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadKeys() }, [])

  async function loadKeys() {
    const res = await fetch('/api/ecosystem/keys')
    if (res.ok) setKeys(await res.json())
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNewKey('')
    try {
      const res = await fetch('/api/ecosystem/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const data = await res.json()
      setNewKey(data.rawKey)
      setName('')
      await loadKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setLoading(false)
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    await fetch(`/api/ecosystem/keys/${keyId}`, { method: 'DELETE' })
    await loadKeys()
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">API Keys</h1>

      <div className="border border-border rounded-lg p-6">
        <h2 className="font-semibold mb-4">Create New Key</h2>
        <form onSubmit={createKey} className="flex gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Key name e.g. Production"
            className="flex-1 border border-border rounded-md px-3 py-2 bg-background text-sm"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </form>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        {newKey && <CopyBox value={newKey} label="Your new API key" />}
      </div>

      <div className="space-y-3">
        {keys.length === 0 && <p className="text-sm text-muted-foreground">No API keys yet.</p>}
        {keys.map(key => (
          <div key={key.keyId} className="border border-border rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{key.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${key.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {key.isActive ? 'Active' : 'Revoked'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted capitalize">{key.tier}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                <code className="font-mono">{key.prefix}…</code>
                {' · '}
                {key.monthlyLimit.toLocaleString()} calls/mo
                {key.lastUsedAt && ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
              </p>
            </div>
            {key.isActive && (
              <button
                onClick={() => revokeKey(key.keyId)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
