import { Navbar } from '@/components/layout/Navbar'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, Plane, Hotel, Car, Ticket, UtensilsCrossed, Package, ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { redirect } from 'next/navigation'
import { getUserOrders } from '@/lib/orders/orders'
import { MarketplaceOrdersClient } from '@/components/orders/MarketplaceOrdersClient'

const TYPE_ICON: Record<string, React.ElementType> = {
  flights: Plane, stays: Hotel, cars: Car,
  experiences: Ticket, restaurants: UtensilsCrossed,
}

export default async function OrdersPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  const db = await getDb()
  const [tripOrders, marketplaceOrders] = await Promise.all([
    db.collection(COLLECTIONS.orders)
      .find({ 'items.lockedBy': user.id })
      .sort({ confirmedAt: -1 })
      .limit(20)
      .toArray(),
    user.id ? getUserOrders(user.id) : Promise.resolve([]),
  ])

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Trip bookings */}
        <h1 className="mb-6 text-2xl font-bold">My Trips</h1>

        {tripOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center mb-10">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No bookings yet.</p>
            <a href="/" className="text-sm text-primary hover:underline">Plan your first trip →</a>
          </div>
        ) : (
          <div className="space-y-4 mb-10">
            {tripOrders.map((order) => (
              <div key={order._id.toString()} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.confirmedAt)}
                  </span>
                  <Badge variant="success" className="gap-1">
                    <CheckCircle className="h-3 w-3" /> Confirmed
                  </Badge>
                </div>
                <div className="space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(order.items ?? []).map((item: any, i: number) => {
                    const Icon = TYPE_ICON[item.activityType] ?? Package
                    return (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{item.displayName}</span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold">
                          {formatCurrency(item.amount, item.currency)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Phase 7 — Marketplace orders */}
        <div className="flex items-center gap-2 mb-6">
          <ShoppingBag className="h-5 w-5" />
          <h2 className="text-xl font-bold">Marketplace Orders</h2>
        </div>
        <MarketplaceOrdersClient initialOrders={JSON.parse(JSON.stringify(marketplaceOrders))} userId={user.id ?? ''} />
      </main>
    </div>
  )
}
