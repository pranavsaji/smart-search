import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { redis, RedisKeys } from '@/lib/cache/redis'
import type { Participant, ParsedIntent, IntentGraph } from './types'
import { nanoid } from 'nanoid'
import { SignJWT } from 'jose'

const INVITE_TTL_SECONDS = 172800 // 48h

export async function resolveParticipants(intent: ParsedIntent): Promise<Participant[]> {
  if (!process.env.MONGODB_URI) {
    // No DB configured — treat all participants as unresolved guests
    return intent.participants.map(p => ({ handle: p.handle, userId: null, intentGraph: null }))
  }

  const db = await getDb()
  const users = db.collection(COLLECTIONS.users)

  return Promise.all(
    intent.participants.map(async (p): Promise<Participant> => {
      const handle = p.handle.replace('@', '')
      const user = await users.findOne({ handle })

      if (user) {
        const graphDoc = await db.collection(COLLECTIONS.intentGraphs).findOne({ userId: user._id.toString() }) as IntentGraph | null
        return {
          handle: p.handle,
          userId: user._id.toString(),
          intentGraph: graphDoc ?? null,
        }
      }

      // Not on platform — generate invite token
      const token = nanoid(32)
      const inviteData = { handle, intentHandle: handle, createdAt: Date.now() }
      try {
        await redis.setex(RedisKeys.invite(token), INVITE_TTL_SECONDS, JSON.stringify(inviteData))
      } catch { /* Redis quota/unavailable — invite won't be redeemable but doesn't block stage creation */ }

      return { handle: p.handle, userId: null, intentGraph: null, inviteToken: token }
    })
  )
}

export async function generateInviteLink(stageId: string, handle: string): Promise<string> {
  const token = nanoid(32)
  await redis.setex(RedisKeys.invite(token), INVITE_TTL_SECONDS, JSON.stringify({ stageId, handle }))
  return `${process.env.NEXT_PUBLIC_APP_URL}/join/${token}`
}
