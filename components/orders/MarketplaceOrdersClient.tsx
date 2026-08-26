'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Package } from 'lucide-react'
import type { VendorOrder } from '@/lib/orders/orders'
import { Textarea } from '@/components/ui/textarea'
import { FormError } from '@/components/ui/form-error'
import { useUserEvents } from '@/hooks/useUserEvents'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Order placed',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
  disputed: 'In dispute',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-600',
  confirmed: 'text-blue-600',
  shipped: 'text-purple-600',
  delivered: 'text-green-600',
  returned: 'text-gray-500',
  cancelled: 'text-red-500',
  disputed: 'text-orange-600',
}

const RETURNABLE_STATUSES = new Set(['delivered', 'shipped', 'confirmed'])

export function MarketplaceOrdersClient({ initialOrders, userId }: { initialOrders: VendorOrder[]; userId?: string }) {
  const [orders, setOrders] = useState<VendorOrder[]>(initialOrders)
  const [returningId, setReturningId] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100)

  const reload = useCallback(async () => {
    const res = await fetch('/api/orders')
    if (res.ok) setOrders((await res.json()).orders ?? [])
  }, [])

  // Live order status updates (shipped, delivered, tracking added, …).
  useUserEvents(userId, {
    order_update: d => {
      toast('Order update', { description: `${d.orderId}: ${STATUS_LABELS[d.status] ?? d.status}` })
      reload()
    },
  })

  async function submitReturn(orderId: string) {
    if (returnReason.length < 10) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: returnReason }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Return request failed')
        return
      }
      setReturningId(null)
      setReturnReason('')
      // Refresh orders from server
      const refresh = await fetch('/api/orders')
      if (refresh.ok) {
        const data = await refresh.json()
        setOrders(data.orders ?? [])
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
        <Package className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No marketplace orders yet</p>
        <Link href="/" className="text-sm text-primary hover:underline">Browse the marketplace →</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {orders.map(order => (
        <div key={order.orderId} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b flex items-start justify-between">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{order.orderId}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(order.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${STATUS_COLOR[order.status] ?? 'text-foreground'}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </p>
              <p className="text-base font-semibold">{fmt(order.totalAmount, order.currency)}</p>
            </div>
          </div>

          {/* Items */}
          <div className="px-5 py-3 space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.title}
                    className="w-10 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty {item.quantity} · {fmt(item.price, item.currency)} each
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="px-5 py-3 border-t flex items-center gap-4">
            {order.trackingUrl && (
              <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-primary underline underline-offset-2">
                Track shipment
              </a>
            )}
            {RETURNABLE_STATUSES.has(order.status) && returningId !== order.orderId && (
              <button
                onClick={() => setReturningId(order.orderId)}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Request return
              </button>
            )}
          </div>

          {/* Return form */}
          {returningId === order.orderId && (
            <div className="px-5 py-4 border-t bg-muted/20">
              <p className="text-sm font-medium mb-2">Reason for return</p>
              <Textarea
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                className="resize-none"
                rows={3}
                placeholder="Please describe the issue (min 10 characters)…"
                aria-label="Reason for return"
              />
              <FormError message={error} className="mt-1 text-xs" />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => submitReturn(order.orderId)}
                  disabled={returnReason.length < 10 || submitting}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit return'}
                </button>
                <button
                  onClick={() => { setReturningId(null); setReturnReason(''); setError('') }}
                  className="px-3 py-1.5 text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                14-day return window · Refund to original payment method
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
