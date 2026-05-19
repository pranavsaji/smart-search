'use client'
import { Lock, Gift, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useCardActions } from '@/contexts/CardActionsContext'
import type { ScoredCard } from '@/lib/ranking/types'

interface BaseCardProps {
  card: ScoredCard
  children?: React.ReactNode
  className?: string
  extraAction?: React.ReactNode
}

export function BaseCard({ card, children, className, extraAction }: BaseCardProps) {
  const { lockCard, giftCard, isLocked, getLockedBy } = useCardActions()
  const locked = isLocked(card.id)
  const lockedByName = getLockedBy(card.id)

  return (
    <article
      onClick={() => !locked && card.isBookable && lockCard(card)}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && !locked && card.isBookable) {
          e.preventDefault()
          lockCard(card)
        }
      }}
      role={card.isBookable && !locked ? 'button' : undefined}
      tabIndex={card.isBookable && !locked ? 0 : undefined}
      aria-label={card.isBookable && !locked ? `Select ${card.displayName}` : undefined}
      className={cn(
        'group relative flex w-64 sm:w-72 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        locked
          ? 'border-primary/40 ring-2 ring-primary/20 shadow-lg shadow-primary/10'
          : 'border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent hover:border-white/[0.12] hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/50 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5),0_0_30px_rgba(139,92,246,0.08)]',
        card.isBookable && !locked ? 'cursor-pointer' : '',
        className
      )}
    >
      {/* Image area */}
      {card.imageUrl ? (
        <div className="relative h-40 w-full overflow-hidden">
          <Image
            src={card.imageUrl}
            alt={card.displayName}
            fill
            sizes="288px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* Price badge on image */}
          {card.price && (
            <div className="absolute bottom-2.5 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md ring-1 ring-white/10">
              {card.price.displayText}
            </div>
          )}

          {/* Lock overlay */}
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/12 backdrop-blur-[2px]">
              <div className="flex items-center gap-1.5 rounded-full bg-primary/95 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-primary/30">
                <Lock className="h-3 w-3" />
                {lockedByName ? `Locked by ${lockedByName}` : 'Locked'}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No-image: show price in header strip if available */
        card.price && (
          <div className="flex items-center justify-end border-b border-white/[0.05] bg-white/[0.02] px-4 py-2.5">
            <span className="text-sm font-bold text-foreground">{card.price.displayText}</span>
          </div>
        )
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground leading-snug">{card.displayName}</h3>
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{card.description}</p>
          </div>
          {/* Price in content area only when no image */}
          {!card.imageUrl && !card.price && null}
        </div>

        {children}

        {/* Action buttons */}
        {card.isBookable ? (
          <div className="mt-auto flex gap-2 pt-2">
            <button
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200',
                locked
                  ? 'bg-primary/15 text-primary/70 cursor-default'
                  : 'bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30 active:scale-95'
              )}
              onClick={e => { e.stopPropagation(); !locked && lockCard(card) }}
              disabled={locked}
            >
              <Lock className="h-3 w-3" />
              {locked ? 'Locked' : 'Lock'}
            </button>
            <button
              className="flex items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-muted-foreground transition-all hover:bg-white/[0.07] hover:text-foreground active:scale-95"
              onClick={e => { e.stopPropagation(); giftCard(card) }}
              title="Buy as Gift"
            >
              <Gift className="h-3.5 w-3.5" />
            </button>
            {extraAction}
          </div>
        ) : card.deepLinkUrl ? (
          <div className="mt-auto flex gap-2 pt-2">
            <a
              href={card.deepLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-white/[0.07] hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              View
            </a>
            {extraAction}
          </div>
        ) : extraAction ? (
          <div className="mt-auto pt-2 flex gap-2">{extraAction}</div>
        ) : null}
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="absolute right-2 bottom-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-mono text-white/40 backdrop-blur-sm pointer-events-none">
          {(card.scores.final * 100).toFixed(0)}
        </div>
      )}
    </article>
  )
}
