// Phase 12.2 — A/B ranking experiments.
// GET  /api/experiments        → list experiments (active by default)
// POST /api/experiments        → create an experiment (admin-gated)

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, BadRequestError, ForbiddenError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { auth } from '@/lib/auth'
import { listExperiments, createExperiment } from '@/lib/ranking/experiments'

function isAdmin(email?: string | null): boolean {
  if (!email) return false
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return admins.includes(email.toLowerCase())
}

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireUserId()
  const activeOnly = new URL(req.url).searchParams.get('active') !== 'false'
  const experiments = await listExperiments({ activeOnly })
  return ok({ experiments })
}, 'GET /api/experiments')

const variantSchema = z.object({
  name: z.string().min(1).max(50),
  allocation: z.number().min(0).max(1),
  weight: z.number().optional(),
})

const createSchema = z.object({
  key: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  variants: z.array(variantSchema).min(2),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  await requireUserId()
  const session = await auth()
  if (!isAdmin(session?.user?.email)) throw new ForbiddenError('Admin only')

  const body = createSchema.parse(await req.json())
  try {
    const experiment = await createExperiment(body)
    return ok({ experiment }, 201)
  } catch (err) {
    // Surface validation errors (allocations, duplicate names) as 400s.
    if (err instanceof Error && !(err as { statusCode?: number }).statusCode) {
      throw new BadRequestError(err.message)
    }
    throw err
  }
}, 'POST /api/experiments')
