'use client'
import { Sun, Cloud, CloudRain, CloudSnow } from 'lucide-react'
import type { ScoredCard } from '@/lib/ranking/types'

interface WeatherRowProps { card: ScoredCard }

const WeatherIcon = ({ description }: { description: string }) => {
  const d = description.toLowerCase()
  if (d.includes('rain') || d.includes('drizzle')) return <CloudRain className="h-5 w-5 text-sky-400" />
  if (d.includes('snow')) return <CloudSnow className="h-5 w-5 text-blue-200" />
  if (d.includes('cloud')) return <Cloud className="h-5 w-5 text-gray-400" />
  return <Sun className="h-5 w-5 text-amber-400" />
}

export function WeatherRow({ card }: WeatherRowProps) {
  const meta = card.metadata as { days?: Array<{ date: string; temp: number; description: string }> }
  const days = meta.days ?? []

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-4 overflow-x-auto pb-1">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{card.description}</p>
        ) : (
          days.map((day, i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                {i === 0 ? 'Today' : new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
              </span>
              <WeatherIcon description={day.description} />
              <span className="text-sm font-semibold">{Math.round(day.temp)}°</span>
              <span className="max-w-[60px] text-center text-[9px] capitalize text-muted-foreground">{day.description}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
