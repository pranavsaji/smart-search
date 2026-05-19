// Phase 12.1 — Anonymised real-time intent feed + category demand.
// GET /api/analytics/feed?activityType=&limit=

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { realtimeIntentFeed, categoryDemand } from '@/lib/analytics/intentSignals'
import type { ActivityType } from '@/lib/intent/types'

const ACTIVITY_TYPES = [
  'flights', 'stays', 'cars', 'experiences', 'restaurants', 'weather', 'maps',
  'products', 'digital_services', 'home_services', 'health_services', 'appointments',
] as const

const querySchema = z.object({
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
})

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireUserId()
  const { searchParams } = new URL(req.url)
  const { activityType, limit } = querySchema.parse({
    activityType: searchParams.get('activityType') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  })

  const [feed, demand] = await Promise.all([
    realtimeIntentFeed({ activityType: activityType as ActivityType | undefined, limit }),
    categoryDemand(),
  ])
  return ok({ feed, demand })
}, 'GET /api/analytics/feed')
