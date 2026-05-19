'use client'
import type { ActivityType } from '@/lib/intent/types'

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  flights: 'Flights', stays: 'Hotels', cars: 'Car Rentals',
  experiences: 'Experiences', restaurants: 'Dining',
  weather: 'Weather', maps: 'Exploration',
  products: 'Shopping', digital_services: 'Digital Services',
  home_services: 'Home Services', health_services: 'Health',
  appointments: 'Appointments',
}

const ACTIVITY_COLORS: Partial<Record<ActivityType, string>> = {
  flights: 'bg-blue-500', stays: 'bg-violet-500', cars: 'bg-emerald-500',
  experiences: 'bg-amber-500', restaurants: 'bg-rose-500',
  products: 'bg-orange-500', digital_services: 'bg-cyan-500',
  home_services: 'bg-lime-500', health_services: 'bg-pink-500',
  appointments: 'bg-indigo-500',
}

interface ActivityPreferencesBarProps {
  preferences: Record<ActivityType, number>
  topN?: number
}

export function ActivityPreferencesBar({ preferences, topN = 6 }: ActivityPreferencesBarProps) {
  const sorted = Object.entries(preferences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN) as [ActivityType, number][]

  if (sorted.length === 0) return null

  return (
    <div className="glass rounded-xl p-6 space-y-4">
      <p className="text-sm font-semibold text-foreground">Activity Preferences</p>
      <div className="space-y-3">
        {sorted.map(([type, score]) => (
          <div key={type} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs text-muted-foreground truncate">
              {ACTIVITY_LABELS[type]}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${ACTIVITY_COLORS[type] ?? 'bg-primary'}`}
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
              {Math.round(score * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
