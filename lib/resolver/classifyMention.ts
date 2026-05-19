import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { MentionType, MentionStatus, ResolvedMention } from './types'

export async function classifyMention(
  handle: string,
  inferredType: MentionType,
  ownerUserId?: string
): Promise<ResolvedMention> {
  const db = await getDb()

  // 1. Check brands collection
  const brand = await db.collection(COLLECTIONS.brands).findOne({
    $or: [{ brandId: handle }, { aliases: handle }],
    isActive: true,
  })
  if (brand) {
    return {
      handle,
      type: 'brand',
      status: 'resolved',
      resolvedId: brand.brandId as string,
      enrichedContext: `Brand: ${brand.displayName}. ${brand.contextPrompt}`,
    }
  }

  // 2. Check users collection
  const user = await db.collection(COLLECTIONS.users).findOne({ handle })
  if (!user) {
    return { handle, type: inferredType === 'brand' ? 'brand' : 'unknown', status: inferredType === 'brand' ? 'unknown_brand' : 'unknown_person' }
  }

  // 3. User exists — check if they're a contact/friend
  if (ownerUserId) {
    const contact = await db.collection(COLLECTIONS.contacts).findOne({
      ownerUserId,
      contactUserId: user._id.toString(),
    })
    if (contact) {
      return {
        handle,
        type: 'person',
        status: 'resolved',
        resolvedId: user._id.toString(),
        enrichedContext: `Collaborator: @${handle}`,
      }
    }

    // User exists but not a contact
    return {
      handle,
      type: 'person',
      status: 'not_a_friend',
      candidateUser: {
        handle: user.handle as string,
        displayName: user.name as string | undefined,
        avatarUrl: user.avatarUrl as string | undefined,
      },
    }
  }

  // No ownerUserId — can't check contacts, just mark as resolved person
  return { handle, type: 'person', status: 'resolved', resolvedId: user._id.toString() }
}
