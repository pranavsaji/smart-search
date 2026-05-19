// Phase 11.1 — Agent task create + list

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { createTask, getUserTasks } from '@/lib/agents/taskRunner'

export const GET = withApiHandler(async () => {
  const userId = await requireUserId()
  const tasks = await getUserTasks(userId)
  return ok({ tasks })
}, 'GET /api/agents/tasks')

const constraintsSchema = z.object({
  serviceType: z.string().optional(),
  maxPriceCents: z.number().int().positive().optional(),
  currency: z.string().optional(),
  destination: z.string().optional(),
  origin: z.string().optional(),
  earliestDate: z.string().optional(),
  latestDate: z.string().optional(),
  query: z.record(z.unknown()).optional(),
})

const createSchema = z.object({
  kind: z.enum(['find_cheapest', 'book_when_available', 'watch_price', 'custom']),
  goal: z.string().min(1).max(500),
  constraints: constraintsSchema.optional(),
  maxAttempts: z.number().int().positive().max(500).optional(),
  pollIntervalMinutes: z.number().int().positive().max(10080).optional(),
  scheduledAt: z.string().datetime().optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const body = createSchema.parse(await req.json())
  const task = await createTask({
    userId,
    kind: body.kind,
    goal: body.goal,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constraints: body.constraints as any,
    maxAttempts: body.maxAttempts,
    pollIntervalMinutes: body.pollIntervalMinutes,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
  })
  return ok(task, 201)
}, 'POST /api/agents/tasks')
