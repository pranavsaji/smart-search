'use client'
import { Star, Clock } from 'lucide-react'
import { BaseCard } from './BaseCard'
import { Badge } from '@/components/ui/badge'
import type { ScoredCard } from '@/lib/ranking/types'

interface ExperienceCardProps {
  card: ScoredCard
}

export function ExperienceCard({ card }: ExperienceCardProps) {
  const meta = card.metadata as { rating?: number; reviews?: number; duration?: string }
  return (
    <BaseCard card={card}>
      <div className="flex items-center gap-3">
        {meta.rating && (
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium">{meta.rating}</span>
            {meta.reviews && <span className="text-[10px] text-muted-foreground">({meta.reviews.toLocaleString()})</span>}
          </div>
        )}
        {meta.duration && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Clock className="h-2.5 w-2.5" />
            {meta.duration}
          </Badge>
        )}
      </div>
    </BaseCard>
  )
}
