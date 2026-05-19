// Phase 11.4 — Life event preferences (opt-in / per-type controls)

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getLifeEventPreferences, setLifeEventPreferences } from '@/lib/agents/lifeEvents'

export const GET = withApiHandler(async () => {
  const userId = await requireUserId()
  const prefs = await getLifeEventPreferences(userId)
  return ok(prefs)
}, 'GET /api/life-events/preferences')

const putSchema = z.object({
  enabled: z.boolean().optional(),
  disabledTypes: z
    .array(z.enum(['moving_cities', 'new_baby', 'wedding_planning', 'new_job', 'travel_season']))
    .optional(),
})

export const PUT = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const body = putSchema.parse(await req.json())
  const prefs = await setLifeEventPreferences(userId, body)
  return ok(prefs)
}, 'PUT /api/life-events/preferences')
