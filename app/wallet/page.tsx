import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { WalletClient } from '@/components/wallet/WalletClient'

export const metadata = { title: 'Wallet & Credits · iAM' }

export default async function WalletPage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Wallet & Credits" subtitle="Your balance, rewards, and shared payments" icon={Wallet}>
      <WalletClient handle={user.handle ?? user.name ?? 'me'} userId={user.id ?? ''} />
    </AppShell>
  )
}
