// Phase 11.3 — Single watch: read, deactivate (PATCH), delete

import { type NextRequest } from 'next/server'
import { ok, withApiHandler, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getWatch, deactivateWatch, deleteWatch } from '@/lib/agents/watchlist'

export const GET = withApiHandler(
  async (_req: NextRequest, ctx?: { params: Promise<{ watchId: string }> }) => {
    const userId = await requireUserId()
    const { watchId } = await ctx!.params
    const item = await getWatch(watchId)
    if (!item) throw new NotFoundError('Watch')
    if (item.userId !== userId) throw new ForbiddenError()
    return ok(item)
  },
  'GET /api/watchlist/[watchId]',
)

export const PATCH = withApiHandler(
  async (_req: NextRequest, ctx?: { params: Promise<{ watchId: string }> }) => {
    const userId = await requireUserId()
    const { watchId } = await ctx!.params
    const updated = await deactivateWatch(watchId, userId)
    if (!updated) throw new NotFoundError('Watch')
    return ok({ watchId, active: false })
  },
  'PATCH /api/watchlist/[watchId]',
)

export const DELETE = withApiHandler(
  async (_req: NextRequest, ctx?: { params: Promise<{ watchId: string }> }) => {
    const userId = await requireUserId()
    const { watchId } = await ctx!.params
    const deleted = await deleteWatch(watchId, userId)
    if (!deleted) throw new NotFoundError('Watch')
    return ok({ watchId, deleted: true })
  },
  'DELETE /api/watchlist/[watchId]',
)
