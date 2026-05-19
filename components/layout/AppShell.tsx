import type { ReactNode, ElementType } from 'react'
import { Navbar } from './Navbar'

interface AppShellProps {
  user?: { name?: string | null; handle?: string } | null
  title: string
  subtitle?: string
  icon?: ElementType
  actions?: ReactNode
  children: ReactNode
}

/**
 * Standard page chrome for the post-MVP app surfaces (wallet, agents, insights…).
 * Server-renderable — wraps the floating Navbar and a centered content column with
 * a consistent page header. Mirrors the layout of /orders and /developer.
 */
export function AppShell({ user, title, subtitle, icon: Icon, actions, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      <main className="mx-auto max-w-3xl px-6 pt-24 pb-20">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  )
}
