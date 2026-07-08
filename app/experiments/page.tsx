import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FlaskConical } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ExperimentsClient } from '@/components/experiments/ExperimentsClient'

export const metadata = { title: 'Experiments · Smart Search' }

export default async function ExperimentsPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string; email?: string }
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const isAdmin = !!user.email && admins.includes(user.email.toLowerCase())

  return (
    <AppShell user={user} title="Ranking Experiments" subtitle="A/B tests for ranking — deterministic assignment" icon={FlaskConical}>
      <ExperimentsClient isAdmin={isAdmin} />
    </AppShell>
  )
}
