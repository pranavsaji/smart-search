'use client'
import {
  Plane, Hotel, Car, Ticket, UtensilsCrossed, Cloud, MapPin,
  ShoppingBag, Code2, Wrench, Stethoscope, CalendarClock, Loader2, AlertCircle,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ActivityType } from '@/lib/intent/types'
import type { ReactNode } from 'react'

const SERVICE_META: Record<ActivityType, {
  label: string
  icon: typeof Plane
  color: string
  iconBg: string
}> = {
  flights:          { label: 'Flights',             icon: Plane,           color: 'text-blue-400',    iconBg: 'icon-glow-blue'    },
  stays:            { label: 'Hotels & Stays',       icon: Hotel,           color: 'text-violet-400',  iconBg: 'icon-glow-violet'  },
  cars:             { label: 'Rental Cars',          icon: Car,             color: 'text-emerald-400', iconBg: 'icon-glow-emerald' },
  experiences:      { label: 'Experiences',          icon: Ticket,          color: 'text-amber-400',   iconBg: 'icon-glow-amber'   },
  restaurants:      { label: 'Restaurants',          icon: UtensilsCrossed, color: 'text-rose-400',    iconBg: 'icon-glow-rose'    },
  weather:          { label: 'Weather Forecast',     icon: Cloud,           color: 'text-sky-400',     iconBg: 'icon-glow-sky'     },
  maps:             { label: 'Points of Interest',   icon: MapPin,          color: 'text-teal-400',    iconBg: 'icon-glow-teal'    },
  products:         { label: 'Products & Shopping',  icon: ShoppingBag,     color: 'text-orange-400',  iconBg: 'icon-glow-orange'  },
  digital_services: { label: 'Digital Services',     icon: Code2,           color: 'text-cyan-400',    iconBg: 'icon-glow-cyan'    },
  home_services:    { label: 'Home Services',        icon: Wrench,          color: 'text-lime-400',    iconBg: 'icon-glow-lime'    },
  health_services:  { label: 'Health & Wellness',    icon: Stethoscope,     color: 'text-pink-400',    iconBg: 'icon-glow-pink'    },
  appointments:     { label: 'Appointments',         icon: CalendarClock,   color: 'text-indigo-400',  iconBg: 'icon-glow-indigo'  },
}

interface ServiceRowProps {
  type: ActivityType
  isLoading?: boolean
  error?: string
  children: ReactNode
  cardCount?: number
}

export function ServiceRow({ type, isLoading, error, children, cardCount }: ServiceRowProps) {
  const meta = SERVICE_META[type]
  const Icon = meta.icon

  return (
    <section className="space-y-4">
      {/* Row header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform',
            meta.iconBg
          )}>
            <Icon className={cn('h-4 w-4', meta.color)} />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-foreground tracking-tight">{meta.label}</span>
            {cardCount !== undefined && cardCount > 0 && (
              <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {cardCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-[11px] text-primary/70">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </div>
          )}
          {error && !isLoading && (
            <span title={error} className="flex items-center gap-1 text-[11px] text-amber-400/70">
              <AlertCircle className="h-3.5 w-3.5" />
              Unavailable
            </span>
          )}
        </div>
      </div>

      {/* Thin accent line */}
      <div className="h-px w-full bg-gradient-to-r from-white/[0.06] to-transparent" />

      {/* Card scroll area */}
      <div className="relative">
        {isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-60 w-72 shrink-0 rounded-2xl opacity-60" />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-thin">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
