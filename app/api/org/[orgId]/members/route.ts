// Phase 9.6 — Organisation member management

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, noContent, withApiHandler, NotFoundError, ForbiddenError, BadRequestError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getOrg, addMember, removeMember, updateMemberRole, canManageOrg } from '@/lib/org/org'
import type { OrgMember, OrgMemberRole } from '@/lib/org/types'

type Ctx = { params: { orgId: string } }

const addSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
  department: z.string().optional(),
})

export const POST = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const actorId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!canManageOrg(org, actorId)) throw new ForbiddenError()

  const body = addSchema.parse(await req.json())
  if (org.members.some(m => m.userId === body.userId)) {
    throw new BadRequestError('User is already a member')
  }

  const member: OrgMember = {
    userId: body.userId,
    email: body.email,
    role: body.role as OrgMemberRole,
    department: body.department,
    joinedAt: new Date(),
  }

  const updated = await addMember(org.orgId, member)
  return ok(updated ?? org, 201)
}, 'POST /api/org/[orgId]/members')

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'member']),
})

export const PATCH = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const actorId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!canManageOrg(org, actorId)) throw new ForbiddenError()

  const { userId, role } = patchSchema.parse(await req.json())
  const updated = await updateMemberRole(org.orgId, userId, role as OrgMemberRole)
  return ok(updated ?? org)
}, 'PATCH /api/org/[orgId]/members')

const deleteSchema = z.object({ userId: z.string().min(1) })

export const DELETE = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const actorId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!canManageOrg(org, actorId)) throw new ForbiddenError()

  const { userId } = deleteSchema.parse(await req.json())
  if (userId === org.ownerId) throw new BadRequestError('Cannot remove the organisation owner')

  await removeMember(org.orgId, userId)
  return noContent()
}, 'DELETE /api/org/[orgId]/members')
