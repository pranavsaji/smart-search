import { redis } from '@/lib/cache/redis'

function usageKey(developerId: string, month: string): string {
  return `ecosystem:usage:${developerId}:${month}`
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function recordApiCall(
  developerId: string,
  adapterId: string,
  endpoint: 'search' | 'createOrder' | 'checkAvailability'
): Promise<void> {
  const month = currentMonth()
  const pipe = redis.pipeline()
  pipe.hincrby(usageKey(developerId, month), 'total', 1)
  pipe.hincrby(usageKey(developerId, month), `adapter:${adapterId}`, 1)
  pipe.hincrby(usageKey(developerId, month), `endpoint:${endpoint}`, 1)
  pipe.expire(usageKey(developerId, month), 90 * 24 * 3600)  // 90-day retention
  await pipe.exec()
}

export async function getMonthlyUsage(developerId: string, month?: string): Promise<Record<string, number>> {
  const m = month ?? currentMonth()
  const data = await redis.hgetall<Record<string, string>>(usageKey(developerId, m))
  if (!data) return { total: 0 }
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, parseInt(v, 10)])
  )
}
