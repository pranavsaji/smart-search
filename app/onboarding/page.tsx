import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/Onboarding/OnboardingFlow'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Get started · Smart Search' }

export default async function OnboardingPage() {
  const session = await auth().catch(() => null)
  // Redirect unauthenticated users to sign up first
  if (!session?.user?.id) redirect('/signup?next=/onboarding')

  return <OnboardingFlow />
}
