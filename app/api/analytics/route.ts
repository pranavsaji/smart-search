// Phase 12.1 — Vendor-facing intent analytics (anonymised, aggregated).
// GET /api/analytics?vendorId=...  → demand, conversion, forecast for the
// vendor's category. All figures are k-anonymised in the service layer.

import { type NextRequest } from 'next/server'
import { ok, withApiHandler, BadRequestError, NotFoundError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { vendorAnalytics } from '@/lib/analytics/intentSignals'

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireUserId()
  const vendorId = new URL(req.url).searchParams.get('vendorId')
  if (!vendorId) throw new BadRequestError('vendorId is required')

  // 10-min cache — dashboards tolerate slightly stale aggregates.
  const cacheKey = RedisKeys.analyticsVendor(vendorId)
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return ok(typeof cached === 'string' ? JSON.parse(cached) : cached)
  } catch {
    /* cache best-effort */
  }

  const analytics = await vendorAnalytics(vendorId)
  if (!analytics) throw new NotFoundError('Vendor')

  try {
    await redis.set(cacheKey, JSON.stringify(analytics), { ex: 600 })
  } catch {
    /* cache best-effort */
  }
  return ok(analytics)
}, 'GET /api/analytics')
