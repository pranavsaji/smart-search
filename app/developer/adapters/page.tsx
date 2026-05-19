'use client'

import { useState, useEffect } from 'react'

interface Adapter {
  adapterId: string
  name: string
  description: string
  category: string
  status: string
  rating: number
  ratingCount: number
  installCount: number
  endpoints: { search: string; createOrder: string; checkAvailability?: string }
  auth: { type: string }
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-100 text-gray-700',
}

export default function AdaptersPage() {
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string>('')
  const [form, setForm] = useState({
    name: '', description: '', category: 'products',
    searchUrl: '', createOrderUrl: '', checkAvailabilityUrl: '',
    authType: 'bearer', authToken: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadAdapters() }, [])

  async function loadAdapters() {
    const res = await fetch('/api/ecosystem/adapters')
    if (res.ok) setAdapters(await res.json())
  }

  async function register(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const body = {
        name: form.name,
        description: form.description,
        category: form.category,
        endpoints: {
          search: form.searchUrl,
          createOrder: form.createOrderUrl,
          ...(form.checkAvailabilityUrl && { checkAvailability: form.checkAvailabilityUrl }),
        },
        auth: form.authType === 'bearer'
          ? { type: 'bearer', token: form.authToken }
          : { type: 'hmac', secret: form.authToken },
      }
      const res = await fetch('/api/ecosystem/adapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      setShowForm(false)
      setForm({ name: '', description: '', category: 'products', searchUrl: '', createOrderUrl: '', checkAvailabilityUrl: '', authType: 'bearer', authToken: '' })
      await loadAdapters()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function testAdapter(adapterId: string) {
    setTesting(adapterId)
    setTestResult('')
    try {
      const res = await fetch('/api/ecosystem/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterId }),
      })
      const data = await res.json()
      setTestResult(JSON.stringify(data, null, 2))
    } catch {
      setTestResult('Error: test failed')
    } finally {
      setTesting(null)
    }
  }

  async function deleteAdapter(adapterId: string) {
    if (!confirm('Delete this adapter?')) return
    await fetch(`/api/ecosystem/adapters/${adapterId}`, { method: 'DELETE' })
    await loadAdapters()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Adapters</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium"
        >
          {showForm ? 'Cancel' : '+ Register Adapter'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={register} className="border border-border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold">Register New Adapter</h2>
          {[
            { label: 'Name', key: 'name', placeholder: 'My Hotel Adapter' },
            { label: 'Description', key: 'description', placeholder: 'Searches and books hotels via our API' },
            { label: 'Search Endpoint (POST)', key: 'searchUrl', placeholder: 'https://api.example.com/search' },
            { label: 'Create Order Endpoint (POST)', key: 'createOrderUrl', placeholder: 'https://api.example.com/orders' },
            { label: 'Check Availability Endpoint (optional)', key: 'checkAvailabilityUrl', placeholder: 'https://api.example.com/availability' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
                required={!f.placeholder.includes('optional')}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
              >
                {['travel', 'experiences', 'products', 'services'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Auth Type</label>
              <select
                value={form.authType}
                onChange={e => setForm(prev => ({ ...prev, authType: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
              >
                <option value="bearer">Bearer Token</option>
                <option value="hmac">HMAC Secret</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {form.authType === 'bearer' ? 'Bearer Token' : 'HMAC Secret'}
            </label>
            <input
              type="password"
              value={form.authToken}
              onChange={e => setForm(prev => ({ ...prev, authToken: e.target.value }))}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Registering…' : 'Register'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {adapters.length === 0 && <p className="text-sm text-muted-foreground">No adapters registered yet.</p>}
        {adapters.map(adapter => (
          <div key={adapter.adapterId} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{adapter.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[adapter.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {adapter.status}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted capitalize">{adapter.category}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{adapter.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ⭐ {adapter.rating.toFixed(1)} ({adapter.ratingCount}) · {adapter.installCount} installs
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => testAdapter(adapter.adapterId)}
                  disabled={testing === adapter.adapterId}
                  className="text-sm px-3 py-1 border border-border rounded-md hover:bg-muted disabled:opacity-50"
                >
                  {testing === adapter.adapterId ? 'Testing…' : 'Test'}
                </button>
                {adapter.status === 'pending' && (
                  <button
                    onClick={() => deleteAdapter(adapter.adapterId)}
                    className="text-sm text-red-600 hover:text-red-700 px-3 py-1"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {testResult && testing === null && (
              <pre className="mt-3 p-3 bg-muted rounded text-xs overflow-auto max-h-48">{testResult}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
