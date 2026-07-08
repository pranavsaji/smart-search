import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Eye } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { WatchlistClient } from '@/components/agents/WatchlistClient'

export const metadata = { title: 'Watchlist · Smart Search' }

export default async function WatchlistPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Watchlist" subtitle="Track prices — get alerted when they drop" icon={Eye}>
      <WatchlistClient userId={user.id ?? ''} />
    </AppShell>
  )
}
