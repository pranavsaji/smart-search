'use client'
import { X, Plane, Clock, Calendar, Tag, ExternalLink, Lock, Gift, Info } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ScoredCard } from '@/lib/ranking/types'
import type { FlightCardMetadata } from '@/lib/services/metadata'
import { useCardActions } from '@/contexts/CardActionsContext'

interface FlightDetailDrawerProps {
  card: ScoredCard
  open: boolean
  onClose: () => void
}

const AIRLINE_NAMES: Record<string, string> = {
  AA: 'American Airlines', UA: 'United Airlines', DL: 'Delta Air Lines',
  B6: 'JetBlue Airways', WN: 'Southwest Airlines', NK: 'Spirit Airlines',
  BA: 'British Airways', VS: 'Virgin Atlantic', AF: 'Air France',
  LH: 'Lufthansa', EK: 'Emirates', QR: 'Qatar Airways',
  SQ: 'Singapore Airlines', JL: 'Japan Airlines', NH: 'ANA',
  AI: 'Air India', QF: 'Qantas', KL: 'KLM', IB: 'Iberia',
  VY: 'Vueling', AZ: 'ITA Airways', FR: 'Ryanair', U2: 'EasyJet',
  FZ: 'flydubai', '6E': 'IndiGo', ZZ: 'Duffel Airways', XX: 'Charter Airlines',
}

export function FlightDetailDrawer({ card, open, onClose }: FlightDetailDrawerProps) {
  const meta = card.metadata as FlightCardMetadata
  const { lockCard, giftCard, isLocked } = useCardActions()
  const locked = isLocked(card.id)

  const [originCode, destCode] = card.displayName.split(' → ')
  const carrierCode = meta.carrier ?? '??'
  const carrierName = AIRLINE_NAMES[carrierCode] ?? card.description?.split(' · ')[0] ?? carrierCode

  const fmt = (iso?: string, pattern = 'HH:mm') => {
    if (!iso) return '--:--'
    try { return format(new Date(iso), pattern) } catch { return '--:--' }
  }

  const durationMs = meta.departing_at && meta.arriving_at
    ? new Date(meta.arriving_at).getTime() - new Date(meta.departing_at).getTime()
    : 0
  const durationStr = durationMs > 0
    ? `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m`
    : '—'

  const nextDay = meta.departing_at && meta.arriving_at
    ? new Date(meta.arriving_at).toDateString() !== new Date(meta.departing_at).toDateString()
    : false

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl transition-transform duration-300 ease-out flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <Plane className="h-4 w-4 rotate-90 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Flight details</p>
              <h2 className="text-base font-bold text-slate-900">{card.displayName}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Big route timeline */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white">
            <div className="flex items-center justify-between">
              {/* Origin */}
              <div className="text-center">
                <p className="text-3xl font-black tabular-nums">{fmt(meta.departing_at)}</p>
                <p className="mt-1 text-2xl font-bold opacity-90">{originCode}</p>
                {meta.departing_at && (
                  <p className="mt-1 text-[11px] opacity-70">{fmt(meta.departing_at, 'EEE, d MMM yyyy')}</p>
                )}
              </div>

              {/* Duration line */}
              <div className="flex flex-1 flex-col items-center gap-1 px-4">
                <p className="text-xs opacity-75">{durationStr}</p>
                <div className="flex w-full items-center gap-1">
                  <div className="h-px flex-1 bg-white/40" />
                  <Plane className="h-4 w-4 rotate-90 opacity-80" />
                  <div className="h-px flex-1 bg-white/40" />
                </div>
                <p className="text-[10px] opacity-60">Direct</p>
              </div>

              {/* Destination */}
              <div className="text-center">
                <p className="text-3xl font-black tabular-nums">
                  {fmt(meta.arriving_at)}
                  {nextDay && <span className="ml-1 text-base opacity-70">+1</span>}
                </p>
                <p className="mt-1 text-2xl font-bold opacity-90">{destCode}</p>
                {meta.arriving_at && (
                  <p className="mt-1 text-[11px] opacity-70">{fmt(meta.arriving_at, 'EEE, d MMM yyyy')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Airline</p>
              <p className="text-sm font-semibold text-slate-800">{carrierName}</p>
              <p className="text-xs text-slate-500">{carrierCode}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Duration</p>
              <p className="text-sm font-semibold text-slate-800">{durationStr}</p>
              <p className="text-xs text-slate-500">Direct flight</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cabin</p>
              <p className="text-sm font-semibold text-slate-800">Economy</p>
              <p className="text-xs text-slate-500">Standard</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Baggage</p>
              <p className="text-sm font-semibold text-slate-800">Carry-on</p>
              <p className="text-xs text-slate-500">Checked: check airline</p>
            </div>
          </div>

          {/* Price */}
          {card.price && (
            <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-slate-700">Price per person</span>
              </div>
              <span className="text-xl font-bold text-blue-700">{card.price.displayText}</span>
            </div>
          )}

          {/* Deep link */}
          {card.deepLinkUrl && (
            <a
              href={card.deepLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <ExternalLink className="h-4 w-4" />
              View on Google Flights
            </a>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-700">
              Prices are indicative and may vary. Lock this flight to hold it in your Stage cart.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-100 px-6 py-4 flex gap-3">
          {card.isBookable ? (
            <>
              <button
                onClick={() => { !locked && lockCard(card); onClose() }}
                disabled={locked}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
                  locked
                    ? 'bg-blue-100 text-blue-400 cursor-default'
                    : 'bg-blue-600 text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 active:scale-[0.98]'
                )}
              >
                <Lock className="h-4 w-4" />
                {locked ? 'Locked' : 'Lock flight'}
              </button>
              <button
                onClick={() => { giftCard(card); onClose() }}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Gift className="h-4 w-4" />
                Gift
              </button>
            </>
          ) : (
            <a
              href={card.deepLinkUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Search on Google Flights
            </a>
          )}
        </div>
      </div>
    </>
  )
}
