// Phase 9.6 — Organisation create + list

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { createOrg, getUserOrgs } from '@/lib/org/org'
import { auth } from '@/lib/auth'

export const GET = withApiHandler(async () => {
  const userId = await requireUserId()
  const orgs = await getUserOrgs(userId)
  return ok({ orgs })
}, 'GET /api/org')

const createSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    const { UnauthorizedError } = await import('@/lib/api/response')
    throw new UnauthorizedError()
  }
  const body = createSchema.parse(await req.json())
  const org = await createOrg({
    name: body.name,
    domain: body.domain,
    ownerId: session.user.id,
    ownerEmail: session.user.email,
  })
  return ok(org, 201)
}, 'POST /api/org')
