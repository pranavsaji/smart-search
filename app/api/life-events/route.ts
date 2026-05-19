// Phase 11.4 — Life events: list + on-demand scan

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getUserLifeEvents, scanLifeEventsForUser } from '@/lib/agents/lifeEvents'

export const GET = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const status = new URL(req.url).searchParams.get('status') as
    | 'detected' | 'acknowledged' | 'dismissed' | 'acted' | null
  const events = await getUserLifeEvents(userId, status ? { status } : {})
  return ok({ events })
}, 'GET /api/life-events')

const postSchema = z.object({ action: z.literal('scan') })

export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  postSchema.parse(await req.json())
  const result = await scanLifeEventsForUser(userId)
  return ok(result)
}, 'POST /api/life-events')
