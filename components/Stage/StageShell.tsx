'use client'
import { useEffect, useState } from 'react'
import { useStageStore } from '@/stores/stageStore'
import { useCartStore } from '@/stores/cartStore'
import { useParticipantStore } from '@/stores/participantStore'
import { useSSE } from '@/hooks/useSSE'
import { CardActionsProvider } from '@/contexts/CardActionsContext'
import { PresenceBar } from './PresenceBar'
import { ServiceRow } from './ServiceRow'
import { FlightCard } from './cards/FlightCard'
import { StayCard } from './cards/StayCard'
import { ExperienceCard } from './cards/ExperienceCard'
import { RestaurantCard } from './cards/RestaurantCard'
import { WeatherRow } from './cards/WeatherRow'
import { MapsRow } from './cards/MapsRow'
import { ProductCard } from './cards/ProductCard'
import { ServiceCard } from './cards/ServiceCard'
import { CheckoutModal } from '@/components/Checkout/CheckoutModal'
import { GiftModal } from '@/components/Gift/GiftModal'
import { GenieModal } from './GenieModal'
import type { ScoredCard } from '@/lib/ranking/types'
import type { MergedStageContext, ActivityType, ParsedIntent } from '@/lib/intent/types'
import { Sparkles, Zap, CheckCircle2, Loader2, Database, Link2, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { GenieUpdate } from '@/hooks/useSSE'
import { BrandHeader } from './BrandHeader'
import { IntentDebugger } from './IntentDebugger'
import type { BrandConfig } from '@/lib/brand/types'
import { cn } from '@/lib/utils'

interface StageShellProps {
  stageId: string
  parsedIntent: ParsedIntent
  stageContext?: MergedStageContext
  userId?: string
  pendingInvites?: { handle: string; url: string }[]
}

const NON_BOOKABLE = new Set<ActivityType>(['weather', 'maps'])

export function StageShell({ stageId, parsedIntent, stageContext, userId, pendingInvites = [] }: StageShellProps) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null)
  const [confirmedData, setConfirmedData] = useState<unknown>(null)
  const [giftCard, setGiftCard] = useState<ScoredCard | null>(null)
  const [brandConfig, setBrandConfig] = useState<BrandConfig | null>(null)
  const [genieCard, setGenieCard] = useState<ScoredCard | null>(null)
  const [latestGenieUpdate, setLatestGenieUpdate] = useState<GenieUpdate | null>(null)

  const { rows, isAssembling, setStageId } = useStageStore()
  const { setStageId: setCartStageId, reset: resetCart } = useCartStore()
  const { setParticipants } = useParticipantStore()

  const copyInviteLink = (handle: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedHandle(handle)
      setTimeout(() => setCopiedHandle(null), 2000)
    })
  }

  const handleGenieUpdate = (update: GenieUpdate) => {
    setLatestGenieUpdate(update)
  }

  useSSE({ stageId, stageContext, onConfirmation: setConfirmedData, onGenieUpdate: handleGenieUpdate })

  // Keyed on stageId only — parsedIntent gets a fresh object identity on every
  // RSC re-render, and re-running this mid-assembly would reset the cart while
  // the (still-open) SSE connection never re-delivers already-sent row events.
  useEffect(() => {
    setStageId(stageId)
    setCartStageId(stageId)
    resetCart()
  }, [stageId, setStageId, setCartStageId, resetCart])

  useEffect(() => {
    setParticipants(parsedIntent.participants)
  }, [parsedIntent.participants, setParticipants])

  const handleGenie = (card: ScoredCard) => {
    setGenieCard(card)
  }

  const handleGenieStart = (card: ScoredCard) => {
    fetch('/api/stage/genie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, card, userId: userId ?? 'anonymous' }),
    }).then(res => {
      if (!res.ok) toast.error('Genie could not start — please try again.')
    }).catch(() => {
      toast.error('Genie could not start — please try again.')
    })
  }

  const renderCards = (type: ActivityType, cards: ScoredCard[]): React.ReactNode => {
    if (type === 'weather' && cards[0]) return <WeatherRow card={cards[0]} />
    if (type === 'maps') return <MapsRow cards={cards} />
    return cards.map((card) => {
      if (type === 'flights')     return <FlightCard     key={card.id} card={card} />
      if (type === 'stays')       return <StayCard       key={card.id} card={card} />
      if (type === 'experiences') return <ExperienceCard key={card.id} card={card} />
      if (type === 'restaurants') return <RestaurantCard key={card.id} card={card} />
      if (type === 'products')    return <ProductCard    key={card.id} card={card} />
      if (type === 'digital_services' || type === 'home_services' || type === 'health_services' || type === 'appointments') {
        return <ServiceCard key={card.id} card={card} onGenie={handleGenie} />
      }
      return <StayCard key={card.id} card={card} />
    })
  }

  const activeTypes = parsedIntent.activityTypes
  const loadedCount = activeTypes.filter(t => rows[t] && !rows[t].isLoading).length
  const totalCount = activeTypes.length

  const orderedTypes = [...activeTypes].sort((a, b) => {
    const aNonBook = NON_BOOKABLE.has(a)
    const bNonBook = NON_BOOKABLE.has(b)
    if (aNonBook !== bNonBook) return aNonBook ? 1 : -1
    const scoreA = rows[a]?.rankedCards[0]?.scores.final ?? 0
    const scoreB = rows[b]?.rankedCards[0]?.scores.final ?? 0
    return scoreB - scoreA
  })

  useEffect(() => {
    const brandHandle = parsedIntent._phaseA?.extracted?.brand
    if (!brandHandle) return
    fetch(`/api/brand/${brandHandle}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brand) setBrandConfig(d.brand as BrandConfig) })
      .catch(() => {})
  }, [parsedIntent._phaseA?.extracted?.brand])

  const progressPct = totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 0

  return (
    <CardActionsProvider stageId={stageId} userId={userId ?? 'anonymous'} onGift={setGiftCard}>
      {brandConfig && <BrandHeader brand={brandConfig} onExit={() => setBrandConfig(null)} />}

      <div
        className="flex min-h-screen flex-col gap-8 px-6 py-8 sm:px-8"
        style={brandConfig ? {
          '--brand-bg': brandConfig.themeColor,
          '--brand-accent': brandConfig.accentColor,
        } as React.CSSProperties : undefined}
      >
        {/* ── Stage header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Breadcrumb label */}
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Stage</span>
            </div>

            {/* Original query */}
            {parsedIntent.rawPrompt && (
              <p className="mb-1.5 max-w-xl truncate text-xs italic text-muted-foreground/50">
                &ldquo;{parsedIntent.rawPrompt.length > 120 ? parsedIntent.rawPrompt.slice(0, 117) + '…' : parsedIntent.rawPrompt}&rdquo;
              </p>
            )}

            {/* Main heading */}
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {parsedIntent.destination === 'UNKNOWN'
                ? parsedIntent.summary ?? 'Your request'
                : <>
                    <span className="gradient-text-brand">{parsedIntent.destination}</span>
                    {parsedIntent.origin && (
                      <span className="text-muted-foreground font-normal text-xl"> from {parsedIntent.origin}</span>
                    )}
                  </>
              }
            </h1>

            {/* Meta pills */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {parsedIntent.destination !== 'UNKNOWN' && parsedIntent.dates.start && (
                <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
                  {parsedIntent.dates.start} → {parsedIntent.dates.end}
                </span>
              )}
              {parsedIntent.groupSize > 1 && (
                <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
                  {parsedIntent.groupSize} people
                </span>
              )}
              {parsedIntent.budgetSignal !== 'unspecified' && (
                <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground capitalize">
                  {parsedIntent.budgetSignal}
                </span>
              )}
              {parsedIntent.genieServices && parsedIntent.genieServices.length > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs text-primary/80">
                  <Zap className="h-2.5 w-2.5" /> Genie enabled
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Pending invite links ── */}
        {pendingInvites.length > 0 && (
          <div className="flex flex-col gap-2">
            {pendingInvites.map(({ handle, url }) => (
              <div
                key={handle}
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/5 px-5 py-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Link2 className="h-4 w-4 shrink-0 text-amber-400/70" />
                  <span className="text-sm text-foreground/70">
                    <span className="font-medium text-foreground">@{handle.replace('@', '')}</span>
                    {' '}isn&apos;t on Smart Search yet — share their invite
                  </span>
                </div>
                <button
                  onClick={() => copyInviteLink(handle, url)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-300/80 transition-colors hover:bg-amber-500/18 hover:text-amber-200"
                >
                  {copiedHandle === handle
                    ? <><Check className="h-3 w-3" /> Copied!</>
                    : <><Copy className="h-3 w-3" /> Copy link</>
                  }
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Assembly status ── */}
        {isAssembling && (
          <div className="glass rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                <span className="text-sm font-medium text-foreground">Searching {totalCount} services</span>
              </div>
              <span className="text-xs text-muted-foreground">{loadedCount} / {totalCount} ready</span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #7c3aed, #22d3ee)',
                }}
              />
            </div>
          </div>
        )}

        {!isAssembling && loadedCount > 0 && (
          <div className="glass rounded-2xl px-5 py-3.5 flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Found results across <span className="text-primary">{loadedCount}</span> services
            </span>
            <Badge
              variant="outline"
              className="ml-auto text-[10px] gap-1 text-muted-foreground border-white/[0.07] bg-transparent"
            >
              <Database className="h-2.5 w-2.5" />
              Demo data
            </Badge>
          </div>
        )}

        {/* ── Presence bar ── */}
        <PresenceBar onCheckout={() => setCheckoutOpen(true)} />

        {/* ── Service rows ── */}
        <div className="flex flex-col gap-10">
          {orderedTypes.map(type => {
            const row = rows[type]
            const cards = row?.rankedCards ?? []
            const isWeatherOrMaps = type === 'weather' || type === 'maps'

            return (
              <ServiceRow
                key={type}
                type={type}
                isLoading={row?.isLoading ?? true}
                error={row?.error}
                cardCount={isWeatherOrMaps ? undefined : cards.length}
              >
                {cards.length > 0
                  ? renderCards(type, cards)
                  : !row?.isLoading && (
                    <div className="flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-white/[0.06]">
                      <p className="text-sm text-muted-foreground/60">
                        No {type.replace(/_/g, ' ')} found for this search
                      </p>
                    </div>
                  )}
              </ServiceRow>
            )
          })}
        </div>

        {/* ── Modals ── */}
        <CheckoutModal
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          stageId={stageId}
          userId={userId ?? 'anonymous'}
        />
        <GiftModal
          open={giftCard !== null}
          onOpenChange={open => { if (!open) setGiftCard(null) }}
          card={giftCard}
          fromUserId={userId ?? 'anonymous'}
        />
        <GenieModal
          card={genieCard}
          onClose={() => setGenieCard(null)}
          onStart={handleGenieStart}
          latestUpdate={latestGenieUpdate}
        />
      </div>

      <IntentDebugger intent={parsedIntent} />
    </CardActionsProvider>
  )
}
