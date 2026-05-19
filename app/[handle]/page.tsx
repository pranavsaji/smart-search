import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { checkProfileAccess } from '@/lib/privacy'
import type { Metadata } from 'next'
import ProfilePageClient from './ProfilePageClient'

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  return {
    title: `@${handle} · Smart Search`,
    description: `View ${handle}'s travel profile on Smart Search`,
  }
}

export default async function HandlePage({ params }: Props) {
  const { handle } = await params

  // Special paths caught by dynamic route — bail out early
  if (handle === 'favicon.ico' || handle.startsWith('_next') || handle.startsWith('api')) notFound()

  if (!process.env.MONGODB_URI) notFound()

  const session = await auth()

  const db = await getDb()
  const user = await db.collection(COLLECTIONS.users).findOne({ handle: handle.replace('@', '') })
  if (!user) notFound()

  const ownerId = user._id.toString()
  const access = await checkProfileAccess(session?.user?.id ?? null, ownerId)

  if (access === 'denied') {
    redirect(`/login?callbackUrl=/${handle}`)
  }

  const isOwner = session?.user?.id === ownerId

  const profileData = {
    id: ownerId,
    handle: user.handle as string,
    name: (user.name as string) ?? user.handle,
    bio: (user.bio as string) ?? null,
    avatarUrl: (user.avatarUrl as string) ?? null,
    spendingSignal: user.intentGraph?.spendingSignal ?? 'unspecified',
    travelStyle: user.intentGraph?.travelStyle ?? 'unspecified',
    topDestinations: (user.intentGraph?.destinations ?? [])
      .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight)
      .slice(0, 6)
      .map((d: { name: string }) => d.name),
    activityPreferences: user.intentGraph?.activityPreferences ?? null,
    access,
    isOwner,
  }

  return <ProfilePageClient profile={profileData} />
}
