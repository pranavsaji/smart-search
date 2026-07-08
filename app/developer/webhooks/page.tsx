'use client'

import { useState, useEffect } from 'react'

const ALL_EVENTS = [
  'booking.confirmed', 'booking.failed', 'stage.created',
  'order.shipped', 'order.delivered', 'order.returned',
] as const

type WebhookEvent = typeof ALL_EVENTS[number]

interface WebhookSub {
  webhookId: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  failureCount: number
  lastDeliveredAt?: string
  createdAt: string
}

export default function WebhooksPage() {
  const [subs, setSubs] = useState<WebhookSub[]>([])
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [newSecret, setNewSecret] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadSubs() }, [])

  async function loadSubs() {
    const res = await fetch('/api/ecosystem/webhooks')
    if (res.ok) setSubs(await res.json())
  }

  function toggleEvent(ev: WebhookEvent) {
    setSelectedEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    )
  }

  async function subscribe(e: React.FormEvent) {
    e.preventDefault()
    if (selectedEvents.length === 0) { setError('Select at least one event'); return }
    setSubmitting(true)
    setError('')
    setNewSecret('')
    try {
      const res = await fetch('/api/ecosystem/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events: selectedEvents }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const data = await res.json()
      setNewSecret(data.secret)
      setUrl('')
      setSelectedEvents([])
      await loadSubs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteSub(webhookId: string) {
    if (!confirm('Delete this webhook?')) return
    await fetch(`/api/ecosystem/webhooks/${webhookId}`, { method: 'DELETE' })
    await loadSubs()
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Webhooks</h1>

      <div className="border border-border rounded-lg p-6 space-y-4">
        <h2 className="font-semibold">Subscribe to Events</h2>
        <form onSubmit={subscribe} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">HTTPS Endpoint URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-app.com/webhooks/smartsearch"
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
              required
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Events</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENTS.map(ev => (
                <label key={ev} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                  />
                  <code className="text-xs">{ev}</code>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {newSecret && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Signing Secret (shown once)</p>
              <code className="text-xs font-mono break-all">{newSecret}</code>
              <p className="text-xs text-muted-foreground mt-1">Use this to verify X-Smart Search-Signature headers on incoming webhooks.</p>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Subscribing…' : 'Subscribe'}
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {subs.length === 0 && <p className="text-sm text-muted-foreground">No webhook subscriptions yet.</p>}
        {subs.map(sub => (
          <div key={sub.webhookId} className="border border-border rounded-lg p-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono">{sub.url}</code>
                <span className={`text-xs px-2 py-0.5 rounded-full ${sub.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {sub.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {sub.events.map(ev => (
                  <code key={ev} className="text-xs bg-muted px-1.5 py-0.5 rounded">{ev}</code>
                ))}
              </div>
              {sub.failureCount > 0 && (
                <p className="text-xs text-red-500 mt-1">{sub.failureCount} consecutive failures</p>
              )}
            </div>
            <button
              onClick={() => deleteSub(sub.webhookId)}
              className="text-sm text-red-600 hover:text-red-700 shrink-0"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
