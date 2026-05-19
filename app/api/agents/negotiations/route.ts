// Phase 11.2 — Negotiation create (run-to-completion) + list

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, BadRequestError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { createAndRunNegotiation, getUserNegotiations, BudgetError } from '@/lib/agents/negotiation'

export const GET = withApiHandler(async () => {
  const userId = await requireUserId()
  const negotiations = await getUserNegotiations(userId)
  return ok({ negotiations })
}, 'GET /api/agents/negotiations')

const createSchema = z.object({
  vendorId: z.string().min(1),
  vendorType: z.string().min(1),
  itemRef: z.string().min(1),
  currency: z.string().default('GBP'),
  listPriceCents: z.number().int().positive(),
  maxBudgetCents: z.number().int().positive(),
  targetPriceCents: z.number().int().positive().optional(),
  maxRounds: z.number().int().positive().max(20).optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const body = createSchema.parse(await req.json())
  try {
    const session = await createAndRunNegotiation({ userId, ...body })
    return ok(session, 201)
  } catch (err) {
    if (err instanceof BudgetError) throw new BadRequestError(err.message)
    throw err
  }
}, 'POST /api/agents/negotiations')
