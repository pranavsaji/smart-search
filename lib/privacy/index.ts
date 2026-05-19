import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export type PrivacySetting = 'public' | 'followers_only' | 'private'
export type AccessLevel = 'full' | 'partial' | 'denied'

export async function checkProfileAccess(
  viewerId: string | null,
  profileOwnerId: string
): Promise<AccessLevel> {
  if (viewerId === profileOwnerId) return 'full'

  const db = await getDb()
  const profile = await db.collection(COLLECTIONS.stageProfiles).findOne({ userId: profileOwnerId })
  const privacy: PrivacySetting = (profile?.privacy ?? 'public') as PrivacySetting

  if (privacy === 'public') return 'full'
  if (privacy === 'private') return viewerId ? 'denied' : 'denied'

  // followers_only
  if (!viewerId) return 'denied'
  const follow = await db.collection(COLLECTIONS.followRequests).findOne({
    followerId: viewerId,
    followingId: profileOwnerId,
    status: 'accepted',
  })
  return follow ? 'full' : 'partial'
}
