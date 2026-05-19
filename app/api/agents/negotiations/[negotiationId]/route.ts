// Phase 11.2 — Single negotiation read (with full audit log)

import { type NextRequest } from 'next/server'
import { ok, withApiHandler, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getNegotiation } from '@/lib/agents/negotiation'

export const GET = withApiHandler(
  async (_req: NextRequest, ctx?: { params: Promise<{ negotiationId: string }> }) => {
    const userId = await requireUserId()
    const { negotiationId } = await ctx!.params
    const session = await getNegotiation(negotiationId)
    if (!session) throw new NotFoundError('Negotiation')
    if (session.userId !== userId) throw new ForbiddenError()
    return ok(session)
  },
  'GET /api/agents/negotiations/[negotiationId]',
)
