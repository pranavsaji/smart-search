import { redis } from './redis'
import { createHash } from 'crypto'
import { logger } from '@/lib/logger'

export function hashParams(params: Record<string, unknown>): string {
  const sorted = Object.keys(params).sort().reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = params[k]
    return acc
  }, {})
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16)
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  // Cache read — best-effort. Redis failure (quota, network) falls through to live call.
  try {
    const cached = await redis.get<T>(key)
    if (cached !== null) return cached
  } catch (err) {
    logger.warn('Cache read failed — falling back to live call', err instanceof Error ? { error: err.message, key } : { error: String(err), key })
  }

  // Live call — errors propagate so adapters can apply their own fallback logic.
  const result = await fn()

  // Cache write — best-effort. Never fails the caller even when Redis is unavailable.
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result))
  } catch { /* quota exceeded or Redis unavailable — cached miss next time, result still returned */ }

  return result
}

export async function invalidateCache(key: string): Promise<void> {
  await redis.del(key)
}
