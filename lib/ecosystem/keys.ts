import crypto from 'crypto'
import { nanoid } from 'nanoid'
import type { DeveloperTier } from './types'

const KEY_PREFIX = 'iam_'

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(32).toString('base64url')
  const raw = `${KEY_PREFIX}${random}`
  const hash = hashKey(raw)
  const prefix = raw.slice(0, 12)  // 'iam_' + 8 chars
  return { raw, hash, prefix }
}

export function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function generateKeyId(): string {
  return nanoid(16)
}

export function tierMonthlyLimit(tier: DeveloperTier): number {
  const limits: Record<DeveloperTier, number> = {
    free: 1_000,
    starter: 10_000,
    pro: 100_000,
    enterprise: Infinity,
  }
  return limits[tier]
}
