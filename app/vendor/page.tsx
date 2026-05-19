'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface VendorOrder {
  orderId: string
  userId: string
  status: string
  totalAmount: number
  currency: string
  items: Array<{ title: string; quantity: number; price: number }>
  trackingUrl?: string
  createdAt: string
}

interface VendorData {
  vendorId: string
  name: string
  status: string
  category: string
}

export default function VendorDashboard() {
  const { data: session } = useSession()
  const router = useRouter()
  const [vendor, setVendor] = useState<VendorData | null>(null)
  const [orders, setOrders] = useState<VendorOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    loadVendorData()
  }, [session])

  async function loadVendorData() {
    // In production this would load the vendor associated with the logged-in user.
    // For now we show a demo state.
    setLoading(false)
  }

  async function loadOrders(vendorId: string, status?: string) {
    const url = status
      ? `/api/vendor/${vendorId}/orders?status=${status}`
      : `/api/vendor/${vendorId}/orders`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders ?? [])
    }
  }

  async function markShipped(orderId: string, vendorId: string) {
    setUpdating(orderId)
    try {
      const res = await fetch(`/api/vendor/${vendorId}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'shipped', trackingUrl: trackingInputs[orderId] }),
      })
      if (res.ok) await loadOrders(vendorId, statusFilter || undefined)
    } finally {
      setUpdating(null)
    }
  }

  const formatPrice = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    returned: 'bg-gray-100 text-gray-800',
    disputed: 'bg-orange-100 text-orange-800',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading vendor dashboard…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Vendor Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage your products and orders on iAM Marketplace</p>
        </div>

        {!vendor ? (
          <VendorRegistrationForm onSuccess={v => { setVendor(v); loadOrders(v.vendorId) }} />
        ) : (
          <>
            {/* Vendor info header */}
            <div className="bg-card border rounded-lg p-4 mb-6 flex items-center justify-between">
              <div>
                <p className="font-medium">{vendor.name}</p>
                <p className="text-sm text-muted-foreground capitalize">{vendor.category} · {vendor.status}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                vendor.status === 'approved' ? 'bg-green-100 text-green-800' :
                vendor.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {vendor.status}
              </span>
            </div>

            {vendor.status !== 'approved' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm text-yellow-800">
                Your vendor application is under review. You will receive an email once approved.
              </div>
            )}

            {vendor.status === 'approved' && (
              <>
                {/* Order filter */}
                <div className="flex gap-2 mb-4">
                  {['', 'pending', 'confirmed', 'shipped', 'delivered'].map(s => (
                    <button
                      key={s || 'all'}
                      onClick={() => { setStatusFilter(s); loadOrders(vendor.vendorId, s || undefined) }}
                      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                        statusFilter === s
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {s || 'All orders'}
                    </button>
                  ))}
                </div>

                {/* Orders list */}
                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">No orders yet</div>
                  ) : (
                    orders.map(order => (
                      <div key={order.orderId} className="bg-card border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-mono text-sm font-medium">{order.orderId}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[order.status] ?? 'bg-gray-100 text-gray-800'}`}>
                              {order.status}
                            </span>
                            <p className="text-sm font-semibold mt-1">{formatPrice(order.totalAmount, order.currency)}</p>
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground mb-3">
                          {order.items.map((item, i) => (
                            <span key={i}>{item.quantity}× {item.title}{i < order.items.length - 1 ? ', ' : ''}</span>
                          ))}
                        </div>

                        {order.trackingUrl && (
                          <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary underline underline-offset-2">
                            Track shipment
                          </a>
                        )}

                        {(order.status === 'pending' || order.status === 'confirmed') && (
                          <div className="mt-3 flex gap-2">
                            <input
                              type="url"
                              placeholder="Tracking URL (optional)"
                              value={trackingInputs[order.orderId] ?? ''}
                              onChange={e => setTrackingInputs(prev => ({ ...prev, [order.orderId]: e.target.value }))}
                              className="flex-1 text-sm border rounded px-2 py-1.5 bg-background"
                            />
                            <button
                              onClick={() => markShipped(order.orderId, vendor.vendorId)}
                              disabled={updating === order.orderId}
                              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
                            >
                              {updating === order.orderId ? 'Updating…' : 'Mark shipped'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Vendor registration form ─────────────────────────────────────────────────

function VendorRegistrationForm({ onSuccess }: { onSuccess: (v: VendorData) => void }) {
  const [form, setForm] = useState({ name: '', category: '', email: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Registration failed')
        return
      }
      const data = await res.json()
      onSuccess(data.vendor)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-lg font-semibold mb-4">Register as a Vendor</h2>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Business name</label>
          <input
            required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border rounded px-3 py-2 bg-background text-sm"
            placeholder="Acme Electronics"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            required
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full border rounded px-3 py-2 bg-background text-sm"
          >
            <option value="">Select a category…</option>
            {['electronics', 'fashion', 'home', 'beauty', 'sports', 'food', 'books', 'other'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Business email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full border rounded px-3 py-2 bg-background text-sm"
            placeholder="hello@yourbusiness.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full border rounded px-3 py-2 bg-background text-sm resize-none"
            rows={3}
            placeholder="Tell us about your business…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Registering…' : 'Register as vendor'}
        </button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">
        Applications are reviewed within 2 business days. iAM takes a 10% platform fee on all sales.
      </p>
    </div>
  )
}
