import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-md bg-gradient-to-r from-secondary via-blue-50 to-secondary bg-[length:200%_100%] animate-[shimmer_1.8s_ease-in-out_infinite]',
        className
      )}
      {...props}
    />
  )
}

// Skeleton matching the standard list-row layout (avatar + two lines + trailing
// figure) used by transactions, orders, tasks, and watchlist items.
function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-border bg-card p-4', className)}>
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

// Skeleton matching the standard stat/summary card layout.
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-xl border border-border bg-card p-4', className)}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

// Full-page loading block: a stat-card grid over a list of rows. Drop-in
// replacement for raw "Loading…" text on data-driven pages.
function SkeletonPage({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} />)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export { Skeleton, SkeletonRow, SkeletonCard, SkeletonPage }
