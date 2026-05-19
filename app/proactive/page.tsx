import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ProactiveClient } from '@/components/proactive/ProactiveClient'

export const metadata = { title: 'Suggestions · iAM' }

export default async function ProactivePage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Proactive Genie" subtitle="Suggestions iAM surfaces before you ask" icon={Bell}>
      <ProactiveClient />
    </AppShell>
  )
}
