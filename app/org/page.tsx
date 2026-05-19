import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { OrgClient } from '@/components/org/OrgClient'

export const metadata = { title: 'Teams · iAM' }

export default async function OrgPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Teams" subtitle="Shared Stages, budgets, and approvals for your company" icon={Building2}>
      <OrgClient currentUserId={user.id ?? ''} />
    </AppShell>
  )
}
