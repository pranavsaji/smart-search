'use client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useParticipantStore } from '@/stores/participantStore'
import { useCartStore } from '@/stores/cartStore'
import { cn, formatCurrency, initials } from '@/lib/utils'
import { ShoppingCart, Users } from 'lucide-react'

interface PresenceBarProps {
  onCheckout?: () => void
}

export function PresenceBar({ onCheckout }: PresenceBarProps) {
  const { participants } = useParticipantStore()
  const { items, totalAmount } = useCartStore()

  const statusColor = { online: 'bg-emerald-400', idle: 'bg-amber-400', offline: 'bg-gray-500' }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      {/* Participants */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{participants.length}</span>
        </div>
        <div className="flex -space-x-2">
          {participants.map(p => (
            <div key={p.handle} className="relative" title={`${p.handle} · ${p.status}`}>
              <Avatar className="h-7 w-7 ring-2 ring-background">
                <AvatarFallback className="text-[10px]">{initials(p.handle.replace('@', ''))}</AvatarFallback>
              </Avatar>
              <span className={cn('absolute bottom-0 right-0 h-2 w-2 rounded-full ring-1 ring-background', statusColor[p.status])} />
            </div>
          ))}
        </div>
      </div>

      {/* Cart summary + checkout */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-semibold text-foreground">{items.length}</span>
              <span className="text-muted-foreground"> item{items.length !== 1 ? 's' : ''} · </span>
              <span className="font-semibold text-foreground">{formatCurrency(totalAmount(), items[0]?.currency)}</span>
            </span>
          </div>
          <button
            onClick={onCheckout}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-primary/90 hover:glow-sm"
          >
            Checkout →
          </button>
        </div>
      )}
    </div>
  )
}
