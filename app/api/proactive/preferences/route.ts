// Phase 9.5 — Proactive notification preferences

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/genie/proactive'

export const GET = withApiHandler(async () => {
  const userId = await requireUserId()
  const prefs = await getNotificationPreferences(userId)
  return ok(prefs)
}, 'GET /api/proactive/preferences')

const schema = z.object({
  enableWeather: z.boolean().optional(),
  enableRestaurants: z.boolean().optional(),
  enableExperiences: z.boolean().optional(),
  enablePriceDrops: z.boolean().optional(),
  enableTripReminders: z.boolean().optional(),
  enableSeasonalNudges: z.boolean().optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const updates = schema.parse(await req.json())
  const prefs = await upsertNotificationPreferences(userId, updates)
  return ok(prefs)
}, 'POST /api/proactive/preferences')
