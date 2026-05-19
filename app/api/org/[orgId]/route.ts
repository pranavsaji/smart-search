// Phase 9.6 — Organisation get + update

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { getOrg, updateOrgName, canManageOrg } from '@/lib/org/org'

type Ctx = { params: { orgId: string } }

export const GET = withApiHandler(async (_req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')

  // Only members can view
  if (!org.members.some(m => m.userId === userId)) throw new ForbiddenError()

  return ok(org)
}, 'GET /api/org/[orgId]')

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

export const PATCH = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const userId = await requireUserId()
  const org = await getOrg(ctx!.params.orgId)
  if (!org) throw new NotFoundError('Organisation')
  if (!canManageOrg(org, userId)) throw new ForbiddenError()

  const { name } = patchSchema.parse(await req.json())
  const updated = name ? await updateOrgName(org.orgId, name) : org
  return ok(updated ?? org)
}, 'PATCH /api/org/[orgId]')
