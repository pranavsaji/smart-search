import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Bot } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { AgentsClient } from '@/components/agents/AgentsClient'

export const metadata = { title: 'AI Agents · iAM' }

export default async function AgentsPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="AI Agents" subtitle="Set goals — iAM works on them over time" icon={Bot}>
      <AgentsClient userId={user.id ?? ''} />
    </AppShell>
  )
}
