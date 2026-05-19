import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { hashKey } from './keys'
import { checkAndIncrementRateLimit } from './rateLimit'
import { UnauthorizedError } from '@/lib/api/response'
import type { DeveloperKey } from './types'

export async function validateApiKey(raw: string): Promise<DeveloperKey> {
  const db = await getDb()
  const hash = hashKey(raw)
  const key = await db.collection(COLLECTIONS.developerKeys).findOne({
    keyHash: hash,
    isActive: true,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }) as unknown as DeveloperKey | null

  if (!key) throw new UnauthorizedError('Invalid or expired API key')

  const rl = await checkAndIncrementRateLimit(key.keyId, key.monthlyLimit)
  if (!rl.allowed) throw new UnauthorizedError(`Monthly API limit reached (${rl.limit} calls/month)`)

  // Update lastUsedAt fire-and-forget
  db.collection(COLLECTIONS.developerKeys).updateOne(
    { keyId: key.keyId },
    { $set: { lastUsedAt: new Date() } }
  ).catch(() => {})

  return key
}

export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError()
  return authHeader.slice(7)
}
