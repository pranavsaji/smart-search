import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Network } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { GraphClient } from '@/components/graph/GraphClient'

export const metadata = { title: 'Knowledge Graph · iAM' }

export default async function GraphPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Knowledge Graph" subtitle='"Complete the trip" — what goes with what' icon={Network}>
      <GraphClient />
    </AppShell>
  )
}
