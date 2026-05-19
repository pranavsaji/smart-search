'use client'
import { Star, Wifi, Dumbbell, Coffee } from 'lucide-react'
import { BaseCard } from './BaseCard'
import { Badge } from '@/components/ui/badge'
import type { ScoredCard } from '@/lib/ranking/types'

interface StayCardProps {
  card: ScoredCard
}

const AMENITY_ICONS: Record<string, typeof Wifi> = { wifi: Wifi, gym: Dumbbell, breakfast: Coffee }

export function StayCard({ card }: StayCardProps) {
  const meta = card.metadata as { stars?: number; amenities?: string[] }
  return (
    <BaseCard card={card}>
      {meta.stars && (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: meta.stars }).map((_, i) => (
            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
          ))}
        </div>
      )}
      {meta.amenities && meta.amenities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.amenities.slice(0, 3).map(a => {
            const Icon = AMENITY_ICONS[a]
            return (
              <Badge key={a} variant="outline" className="gap-1 text-[10px]">
                {Icon && <Icon className="h-2.5 w-2.5" />}
                {a}
              </Badge>
            )
          })}
        </div>
      )}
    </BaseCard>
  )
}
