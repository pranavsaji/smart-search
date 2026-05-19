// Phase 9.6 — Budget management routes

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getOrg, addBudgetLimit, removeBudgetLimit, canManageOrg } from '@/lib/org/org'
import { checkBudget, resetBudgetPeriod, getBudgetUsagePercent } from '@/lib/org/budget'

type Ctx = { params: { orgId: string } }

export const GET = withApiHandler(async (_req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!org.members.some(m => m.userId === userId)) throw new ForbiddenError()

  const budgetsWithUsage = org.budgetLimits.map(l => ({
    ...l,
    usagePercent: getBudgetUsagePercent(l),
  }))

  return ok({ budgets: budgetsWithUsage })
}, 'GET /api/org/[orgId]/budget')

const addSchema = z.object({
  department: z.string().optional(),
  periodType: z.enum(['monthly', 'quarterly', 'annual']),
  limitCents: z.number().int().positive(),
  currency: z.string().length(3),
  alertThresholdPercent: z.number().min(0).max(100).default(80),
})

export const POST = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!canManageOrg(org, userId)) throw new ForbiddenError()

  const body = addSchema.parse(await req.json())
  const updated = await addBudgetLimit(org.orgId, body)
  return ok(updated ?? org, 201)
}, 'POST /api/org/[orgId]/budget')

const deleteSchema = z.object({ limitId: z.string().min(1) })

export const DELETE = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!canManageOrg(org, userId)) throw new ForbiddenError()

  const { limitId } = deleteSchema.parse(await req.json())
  await removeBudgetLimit(org.orgId, limitId)
  return ok({ removed: true })
}, 'DELETE /api/org/[orgId]/budget')

// POST /check — check if a purchase is within budget
const checkSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  department: z.string().optional(),
})

export const PUT = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!org.members.some(m => m.userId === userId)) throw new ForbiddenError()

  const body = checkSchema.parse(await req.json())
  const result = await checkBudget(org.orgId, userId, body.amountCents, body.currency, body.department)
  return ok(result)
}, 'PUT /api/org/[orgId]/budget')
