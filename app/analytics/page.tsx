import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { AnalyticsClient } from '@/components/analytics/AnalyticsClient'

export const metadata = { title: 'Vendor Analytics · Smart Search' }

export default async function AnalyticsPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Vendor Analytics" subtitle="Anonymised, aggregated demand for your category" icon={BarChart3}>
      <AnalyticsClient />
    </AppShell>
  )
}
