'use client'
import { Star, Clock, Calendar, Zap, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useCardActions } from '@/contexts/CardActionsContext'
import type { ScoredCard } from '@/lib/ranking/types'

interface ServiceCardProps {
  card: ScoredCard
  onGenie?: (card: ScoredCard) => void
}

// Generic card for digital_services, home_services, health_services, appointments.
// Renders a Genie CTA when card.supportsGenie is true.
export function ServiceCard({ card, onGenie }: ServiceCardProps) {
  const { lockCard, isLocked: isLockedFn } = useCardActions()
  const isLocked = isLockedFn(card.id)
  const m = card.metadata as {
    platform?: string
    rating?: number
    reviewCount?: number
    availability?: string[]
    responseTime?: string
    deliveryDays?: number
    duration?: number
    level?: string
    teleconsult?: boolean
    insurance?: boolean
    acceptsInsurance?: boolean
    category?: string
    specialty?: string
  }

  return (
    <article
      onClick={() => card.isBookable && !isLocked && lockCard(card)}
      className={cn(
        'relative flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200',
        card.isBookable && !isLocked ? 'cursor-pointer' : 'cursor-default',
        isLocked
          ? 'border-primary/40 ring-1 ring-primary/20'
          : 'hover:border-border/80 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20'
      )}
    >
      {card.imageUrl && (
        <div className="relative h-32 w-full overflow-hidden">
          <Image src={card.imageUrl} alt={card.displayName} fill sizes="256px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
          {card.supportsGenie && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              <Zap className="h-2.5 w-2.5" />
              Genie
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <h3 className="truncate text-sm font-semibold text-foreground">{card.displayName}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
        </div>

        {/* Price */}
        {card.price && (
          <div className="text-sm font-bold text-foreground">{card.price.displayText}</div>
        )}

        {/* Service details */}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {m.rating !== undefined && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>{m.rating.toFixed(1)}</span>
              {m.reviewCount && <span className="text-muted-foreground/60">({m.reviewCount.toLocaleString()})</span>}
            </div>
          )}

          {m.responseTime && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{m.responseTime}</span>
            </div>
          )}

          {m.duration && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{m.duration} min session</span>
            </div>
          )}

          {m.availability && m.availability.length > 0 && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span className="truncate">{m.availability[0]}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-1 pt-0.5">
            {m.platform && (
              <Badge variant="outline" className="text-[10px]">{m.platform}</Badge>
            )}
            {m.teleconsult && (
              <Badge variant="outline" className="text-[10px] text-sky-400 border-sky-400/30">Video</Badge>
            )}
            {m.insurance && (
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">Insured</Badge>
            )}
            {m.acceptsInsurance && (
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">Insurance OK</Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        {card.isBookable ? (
          <div className="mt-auto flex gap-2 pt-1">
            {card.supportsGenie ? (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="flex-1 gap-1 text-xs"
                  onClick={e => { e.stopPropagation(); onGenie?.(card) }}
                >
                  <Zap className="h-3 w-3" />
                  Ask Genie
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs px-2"
                  onClick={e => { e.stopPropagation(); lockCard(card) }}
                  title="Lock manually"
                >
                  Lock
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={isLocked ? 'secondary' : 'default'}
                className="flex-1 text-xs"
                onClick={e => { e.stopPropagation(); !isLocked && lockCard(card) }}
                disabled={isLocked}
              >
                {card.ctaLabel}
              </Button>
            )}
          </div>
        ) : card.deepLinkUrl ? (
          <div className="mt-auto flex gap-2 pt-1">
            {card.supportsGenie && (
              <Button
                size="sm"
                variant="default"
                className="flex-1 gap-1 text-xs"
                onClick={e => { e.stopPropagation(); onGenie?.(card) }}
              >
                <Zap className="h-3 w-3" /> Ask Genie
              </Button>
            )}
            <a
              href={card.deepLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className={card.supportsGenie ? '' : 'block w-full'}
            >
              <Button size="sm" variant="outline" className={`gap-1 text-xs ${card.supportsGenie ? 'px-2' : 'w-full'}`}>
                <ExternalLink className="h-3 w-3" />{card.supportsGenie ? '' : ' View'}
              </Button>
            </a>
          </div>
        ) : card.supportsGenie ? (
          <div className="mt-auto pt-1">
            <Button
              size="sm"
              variant="default"
              className="w-full gap-1 text-xs"
              onClick={e => { e.stopPropagation(); onGenie?.(card) }}
            >
              <Zap className="h-3 w-3" /> Ask Genie
            </Button>
          </div>
        ) : null}
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="absolute right-1 top-1 rounded bg-black/40 px-1 py-0.5 text-[9px] text-white/60">
          {(card.scores.final * 100).toFixed(0)}
        </div>
      )}
    </article>
  )
}
