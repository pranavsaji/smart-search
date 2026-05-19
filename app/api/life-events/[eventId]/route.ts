// Phase 11.4 — Update a life event's status (acknowledge / dismiss / act)

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, NotFoundError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { updateLifeEventStatus } from '@/lib/agents/lifeEvents'

const patchSchema = z.object({
  status: z.enum(['acknowledged', 'dismissed', 'acted']),
})

export const PATCH = withApiHandler(
  async (req: NextRequest, ctx?: { params: Promise<{ eventId: string }> }) => {
    const userId = await requireUserId()
    const { eventId } = await ctx!.params
    const { status } = patchSchema.parse(await req.json())
    const updated = await updateLifeEventStatus(eventId, userId, status)
    if (!updated) throw new NotFoundError('Life event')
    return ok({ eventId, status })
  },
  'PATCH /api/life-events/[eventId]',
)
