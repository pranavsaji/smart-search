'use client'
import { useState } from 'react'
import { Plane, Clock, Info } from 'lucide-react'
import { BaseCard } from './BaseCard'
import { FlightDetailDrawer } from './FlightDetailDrawer'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import type { ScoredCard } from '@/lib/ranking/types'

interface FlightCardProps {
  card: ScoredCard
}

export function FlightCard({ card }: FlightCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const meta = card.metadata as { departing_at?: string; arriving_at?: string; carrier?: string }

  const formatTime = (iso?: string) => {
    if (!iso) return '--:--'
    try { return format(new Date(iso), 'HH:mm') } catch { return '--:--' }
  }

  const formatDate = (iso?: string) => {
    if (!iso) return ''
    try { return format(new Date(iso), 'EEE, d MMM') } catch { return '' }
  }

  const duration = (dep?: string, arr?: string) => {
    if (!dep || !arr) return ''
    const diffMs = new Date(arr).getTime() - new Date(dep).getTime()
    const h = Math.floor(diffMs / 3600000)
    const m = Math.floor((diffMs % 3600000) / 60000)
    return `${h}h ${m}m`
  }

  const arrivalNextDay = meta.departing_at && meta.arriving_at
    ? new Date(meta.arriving_at).toDateString() !== new Date(meta.departing_at).toDateString()
    : false

  return (
    <>
      <BaseCard card={card} extraAction={
        <button
          onClick={e => { e.stopPropagation(); setDrawerOpen(true) }}
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 active:scale-95"
          title="View flight details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      }>
        {meta.departing_at && (
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatDate(meta.departing_at)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 p-2.5">
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums text-foreground">{formatTime(meta.departing_at)}</div>
            <div className="text-[10px] text-muted-foreground">{card.displayName.split(' → ')[0]}</div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <div className="text-[10px] text-muted-foreground">{duration(meta.departing_at, meta.arriving_at)}</div>
            <div className="flex w-full items-center gap-1">
              <div className="h-px flex-1 bg-border" />
              <Plane className="h-3 w-3 rotate-90 text-muted-foreground" />
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="text-[10px] text-muted-foreground">Direct</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums text-foreground">
              {formatTime(meta.arriving_at)}
              {arrivalNextDay && <span className="ml-0.5 text-[9px] text-muted-foreground">+1</span>}
            </div>
            <div className="text-[10px] text-muted-foreground">{card.displayName.split(' → ')[1]}</div>
          </div>
        </div>
        {meta.carrier && (
          <Badge variant="outline" className="w-fit text-[10px]">{meta.carrier}</Badge>
        )}
      </BaseCard>

      <FlightDetailDrawer
        card={card}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  )
}
