import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sparkle } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { LifeEventsClient } from '@/components/agents/LifeEventsClient'

export const metadata = { title: 'Life Events · iAM' }

export default async function LifeEventsPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Life Events" subtitle="iAM spots big moments and helps you prepare" icon={Sparkle}>
      <LifeEventsClient userId={user.id ?? ''} />
    </AppShell>
  )
}
