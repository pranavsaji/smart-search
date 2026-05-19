'use client'
import { Star, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import type { ScoredCard } from '@/lib/ranking/types'

interface MapsRowProps { cards: ScoredCard[] }

export function MapsRow({ cards }: MapsRowProps) {
  return (
    <>
      {cards.map(card => {
        const meta = card.metadata as { rating?: number; userRatingsTotal?: number; types?: string[] }
        return (
          <a
            key={card.id}
            href={`https://maps.google.com/?q=${encodeURIComponent(card.displayName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:scale-[1.02] hover:border-primary/30 hover:shadow-lg hover:shadow-black/20 cursor-pointer"
          >
            {card.imageUrl && (
              <div className="relative h-28 w-full overflow-hidden">
                <Image src={card.imageUrl} alt={card.displayName} fill sizes="224px" className="object-cover" />
              </div>
            )}
            <div className="flex flex-col gap-2 p-3">
              <h3 className="truncate text-sm font-semibold">{card.displayName}</h3>
              <p className="line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
              <div className="flex items-center justify-between">
                {meta.rating && (
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span>{meta.rating}</span>
                  </div>
                )}
                <span className="flex items-center gap-1 text-[10px] text-primary">
                  View on Maps <ExternalLink className="h-2.5 w-2.5" />
                </span>
              </div>
            </div>
          </a>
        )
      })}
    </>
  )
}
