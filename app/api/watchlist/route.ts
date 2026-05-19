// Phase 11.3 — Watchlist create + list

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { createWatch, getUserWatchlist } from '@/lib/agents/watchlist'

export const GET = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const activeOnly = new URL(req.url).searchParams.get('active') === 'true'
  const items = await getUserWatchlist(userId, { activeOnly })
  return ok({ items })
}, 'GET /api/watchlist')

const targetSchema = z.object({
  itemType: z.enum([
    'flights', 'stays', 'cars', 'experiences', 'restaurants', 'weather', 'maps',
    'products', 'digital_services', 'home_services', 'health_services', 'appointments',
  ]),
  itemRef: z.string().optional(),
  label: z.string().min(1).max(200),
  query: z.record(z.unknown()).default({}),
  currency: z.string().default('GBP'),
})

const createSchema = z.object({
  target: targetSchema,
  targetPriceCents: z.number().int().positive(),
  pollIntervalMinutes: z.number().int().positive().max(10080).optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const body = createSchema.parse(await req.json())
  const item = await createWatch({
    userId,
    target: body.target,
    targetPriceCents: body.targetPriceCents,
    pollIntervalMinutes: body.pollIntervalMinutes,
  })
  return ok(item, 201)
}, 'POST /api/watchlist')
