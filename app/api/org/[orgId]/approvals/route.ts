// Phase 9.6 — Approval workflow routes

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, NotFoundError, ForbiddenError, BadRequestError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getOrg, isOrgMember } from '@/lib/org/org'
import {
  checkNeedsApproval,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  getPendingApprovals,
  getUserApprovalRequests,
  getApprovalRequest,
} from '@/lib/org/approval'

type Ctx = { params: { orgId: string } }

// GET — list approvals (pending to review or requested by me)
export const GET = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!isOrgMember(org, userId)) throw new ForbiddenError()

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') ?? 'mine'

  if (view === 'pending') {
    const approvals = await getPendingApprovals(userId, org.orgId)
    return ok({ approvals })
  }

  const approvals = await getUserApprovalRequests(userId, org.orgId)
  return ok({ approvals })
}, 'GET /api/org/[orgId]/approvals')

const createSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  description: z.string().min(1).max(500),
  stageId: z.string().optional(),
  department: z.string().optional(),
})

// POST — create an approval request
export const POST = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!isOrgMember(org, userId)) throw new ForbiddenError()

  const body = createSchema.parse(await req.json())
  const check = await checkNeedsApproval(
    org.orgId,
    userId,
    body.amountCents,
    body.currency,
    body.department
  )

  if (!check.needsApproval) {
    throw new BadRequestError('This purchase does not require approval')
  }

  const request = await createApprovalRequest({
    orgId: org.orgId,
    requesterId: userId,
    approverId: check.approverId,
    amountCents: body.amountCents,
    currency: body.currency,
    description: body.description,
    stageId: body.stageId,
  })

  return ok(request, 201)
}, 'POST /api/org/[orgId]/approvals')

const reviewSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
})

// PATCH — approve or reject a request
export const PATCH = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')

  const { requestId, action, note } = reviewSchema.parse(await req.json())

  // Verify the approval request belongs to this org
  const aprReq = await getApprovalRequest(requestId)
  if (!aprReq || aprReq.orgId !== org.orgId) throw new NotFoundError('Approval request')

  const updated =
    action === 'approve'
      ? await approveRequest(requestId, userId, note)
      : await rejectRequest(requestId, userId, note ?? 'No reason given')

  if (!updated) throw new BadRequestError('Request already reviewed or expired')
  return ok(updated)
}, 'PATCH /api/org/[orgId]/approvals')
