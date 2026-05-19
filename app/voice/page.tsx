import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Mic } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { VoiceClient } from '@/components/voice/VoiceClient'

export const metadata = { title: 'Voice · iAM' }

export default async function VoicePage() {
  const session = await auth().catch(() => null)
  if (!session?.user) redirect('/login')
  const user = session.user as { id?: string; handle?: string; name?: string }

  return (
    <AppShell user={user} title="Voice" subtitle="Speak your intent — iAM does the rest" icon={Mic}>
      <VoiceClient />
    </AppShell>
  )
}
