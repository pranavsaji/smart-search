'use client'
import { ShoppingBag, Plane, Utensils, Package, X } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import type { ActivityType } from '@/lib/intent/types'

function typeToGroup(type: ActivityType): string {
  if (['flights', 'stays', 'cars', 'experiences'].includes(type)) return 'Travel'
  if (['products', 'digital_services'].includes(type)) return 'Shopping'
  if (['restaurants', 'appointments', 'home_services', 'health_services'].includes(type)) return 'Services'
  return 'Other'
}

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Travel: Plane,
  Shopping: ShoppingBag,
  Services: Utensils,
  Other: Package,
}

interface UniversalCartDrawerProps {
  open: boolean
  onClose: () => void
  onCheckout: () => void
}

export function UniversalCartDrawer({ open, onClose, onCheckout }: UniversalCartDrawerProps) {
  const { items, removeItem, reset } = useCartStore()

  // Group items by type
  const groups: Record<string, typeof items> = {}
  for (const item of items) {
    const group = typeToGroup(item.activityType as ActivityType)
    groups[group] = [...(groups[group] ?? []), item]
  }

  const totalItems = items.length
  const bookableItems = items.filter(i => i.isBookable)

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-[#0a0a0a] border-l border-white/10 transform transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <span className="font-semibold">Cart</span>
            {totalItems > 0 && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                {totalItems}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.entries(groups).map(([group, groupItems]) => {
            const Icon = GROUP_ICONS[group] ?? Package
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-4 w-4 text-white/40" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/40">{group}</span>
                </div>
                <div className="space-y-2">
                  {groupItems.map(item => (
                    <div key={item.id} className="flex items-start gap-3 rounded-xl bg-white/5 p-3 border border-white/5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.displayName}</div>
                        <div className="text-xs text-white/40 mt-0.5">{item.vendorType}</div>
                        {item.amount > 0 && (
                          <div className="text-sm font-semibold text-primary mt-1">
                            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: item.currency ?? 'GBP' })
                              .format(item.amount / 100)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {totalItems === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingBag className="h-8 w-8 text-white/20 mb-3" />
              <div className="text-sm text-white/40">Your cart is empty</div>
              <div className="text-xs text-white/25 mt-1">Lock items from the Stage to add them</div>
            </div>
          )}
        </div>

        {/* Footer */}
        {totalItems > 0 && (
          <div className="p-4 border-t border-white/10 space-y-3">
            {bookableItems.length < totalItems && (
              <p className="text-xs text-white/40 text-center">
                {totalItems - bookableItems.length} discovery item{totalItems - bookableItems.length > 1 ? 's' : ''} not charged
              </p>
            )}
            <button
              onClick={onCheckout}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              Checkout ({bookableItems.length} item{bookableItems.length !== 1 ? 's' : ''})
            </button>
            <button
              onClick={reset}
              className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  )
}
