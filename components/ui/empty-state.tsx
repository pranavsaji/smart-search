import type { ElementType, ReactNode } from 'react'

/** Consistent dashed-border empty state used across dashboard surfaces. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: ElementType
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      {Icon && <Icon className="h-9 w-9 text-muted-foreground" />}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}
