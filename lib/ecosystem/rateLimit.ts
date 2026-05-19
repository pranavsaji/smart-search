import { redis } from '@/lib/cache/redis'

function monthKey(keyId: string): string {
  const now = new Date()
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `ecosystem:ratelimit:${keyId}:${ym}`
}

export interface RateLimitResult {
  allowed: boolean
  used: number
  limit: number
  resetAt: Date  // first day of next month UTC
}

export async function checkAndIncrementRateLimit(
  keyId: string,
  monthlyLimit: number
): Promise<RateLimitResult> {
  if (monthlyLimit === Infinity) {
    return { allowed: true, used: 0, limit: Infinity, resetAt: nextMonthStart() }
  }

  const key = monthKey(keyId)
  const used = await redis.incr(key)

  // Set TTL on first increment (expires 35 days from now — safely past month end)
  if (used === 1) {
    await redis.expire(key, 35 * 24 * 3600)
  }

  return {
    allowed: used <= monthlyLimit,
    used,
    limit: monthlyLimit,
    resetAt: nextMonthStart(),
  }
}

export async function getUsage(keyId: string): Promise<number> {
  const key = monthKey(keyId)
  const val = await redis.get<number>(key)
  return val ?? 0
}

function nextMonthStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}
