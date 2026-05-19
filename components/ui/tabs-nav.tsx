'use client'

import { cn } from '@/lib/utils'

export interface TabDef {
  id: string
  label: string
  count?: number
}

/** Pill-style tab switcher used across the dashboard surfaces. */
export function TabsNav({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1', className)}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            active === t.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 text-[10px] font-semibold',
                active === t.id ? 'bg-white/20' : 'bg-secondary',
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
