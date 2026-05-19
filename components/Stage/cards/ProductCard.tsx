'use client'
import { Star, Truck, Store } from 'lucide-react'
import { BaseCard } from './BaseCard'
import { Badge } from '@/components/ui/badge'
import type { ScoredCard } from '@/lib/ranking/types'

interface ProductCardProps {
  card: ScoredCard
}

export function ProductCard({ card }: ProductCardProps) {
  const m = card.metadata as {
    retailer?: string
    rating?: number
    reviewCount?: number
    inStock?: boolean
    deliveryDays?: number
    brand?: string
    category?: string
  }

  return (
    <BaseCard card={card}>
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {m.brand && (
          <span className="font-medium text-foreground/70">{m.brand}</span>
        )}

        {m.rating !== undefined && (
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span>{m.rating.toFixed(1)}</span>
            {m.reviewCount && <span className="text-muted-foreground/60">({m.reviewCount.toLocaleString()})</span>}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {m.retailer && (
            <div className="flex items-center gap-1">
              <Store className="h-3 w-3" />
              <span>{m.retailer}</span>
            </div>
          )}
          {m.deliveryDays !== undefined && (
            <div className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              <span>{m.deliveryDays === 0 ? 'Instant' : m.deliveryDays === 1 ? 'Next day' : `${m.deliveryDays}-day delivery`}</span>
            </div>
          )}
        </div>

        {m.inStock === false && (
          <Badge variant="outline" className="self-start text-[10px] text-amber-400 border-amber-400/30">
            Out of stock
          </Badge>
        )}
      </div>
    </BaseCard>
  )
}
