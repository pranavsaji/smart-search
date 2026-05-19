// Phase 11.1 — Single agent task: read + cancel

import { type NextRequest } from 'next/server'
import { ok, withApiHandler, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getTask, cancelTask } from '@/lib/agents/taskRunner'

export const GET = withApiHandler(
  async (_req: NextRequest, ctx?: { params: Promise<{ taskId: string }> }) => {
    const userId = await requireUserId()
    const { taskId } = await ctx!.params
    const task = await getTask(taskId)
    if (!task) throw new NotFoundError('Task')
    if (task.userId !== userId) throw new ForbiddenError()
    return ok(task)
  },
  'GET /api/agents/tasks/[taskId]',
)

export const DELETE = withApiHandler(
  async (_req: NextRequest, ctx?: { params: Promise<{ taskId: string }> }) => {
    const userId = await requireUserId()
    const { taskId } = await ctx!.params
    const cancelled = await cancelTask(taskId, userId)
    if (!cancelled) throw new NotFoundError('Active task')
    return ok({ taskId, status: 'cancelled' })
  },
  'DELETE /api/agents/tasks/[taskId]',
)
