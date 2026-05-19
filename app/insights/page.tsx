import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { InsightsClient } from '@/components/insights/InsightsClient'

export const metadata = { title: 'Your Insights · iAM' }

export default async function InsightsPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Your Insights" subtitle="Spending, savings, and how you use iAM" icon={Sparkles}>
      <InsightsClient userId={user.id ?? ''} />
    </AppShell>
  )
}
