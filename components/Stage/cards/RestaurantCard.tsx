'use client'
import { Clock } from 'lucide-react'
import { BaseCard } from './BaseCard'
import { Badge } from '@/components/ui/badge'
import type { ScoredCard } from '@/lib/ranking/types'

interface RestaurantCardProps {
  card: ScoredCard
}

export function RestaurantCard({ card }: RestaurantCardProps) {
  const meta = card.metadata as { cuisine?: string; stars?: number; availableSlots?: string[] }
  return (
    <BaseCard card={card}>
      <div className="flex flex-wrap items-center gap-1.5">
        {meta.cuisine && <Badge variant="outline" className="text-[10px]">{meta.cuisine}</Badge>}
        {(meta.stars ?? 0) > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            {'★'.repeat(meta.stars!)} Michelin
          </Badge>
        )}
      </div>
      {meta.availableSlots && meta.availableSlots.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.availableSlots.map(slot => (
            <button key={slot} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-primary hover:text-white">
              <Clock className="h-2.5 w-2.5" />
              {slot}
            </button>
          ))}
        </div>
      )}
    </BaseCard>
  )
}
