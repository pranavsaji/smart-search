import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { AdapterManifest, DeveloperAccount } from '@/lib/ecosystem/types'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean)

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']).optional(),
  featured: z.boolean().optional(),
  revenueSharePercent: z.number().min(0).max(50).optional(),
})

export const GET = withApiHandler(async (_req: NextRequest, ctx: { params: Promise<{ adapterId: string }> }) => {
  const { adapterId } = await ctx.params
  const db = await getDb()
  const adapter = await db.collection(COLLECTIONS.adapterRegistry).findOne({ adapterId }) as unknown as AdapterManifest | null
  if (!adapter) throw new NotFoundError('Adapter')
  return ok({ ...adapter, auth: { type: adapter.auth.type } })
}, 'GET /api/ecosystem/adapters/[adapterId]')

export const PATCH = withApiHandler(async (req: NextRequest, ctx: { params: Promise<{ adapterId: string }> }) => {
  const session = await auth()
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) throw new ForbiddenError('Admin access required')

  const { adapterId } = await ctx.params
  const body = patchSchema.parse(await req.json())
  const db = await getDb()

  const result = await db.collection(COLLECTIONS.adapterRegistry).findOneAndUpdate(
    { adapterId },
    { $set: { ...body, updatedAt: new Date() } },
    { returnDocument: 'after' }
  ) as unknown as AdapterManifest | null
  if (!result) throw new NotFoundError('Adapter')
  return ok({ ...result, auth: { type: result.auth.type } })
}, 'PATCH /api/ecosystem/adapters/[adapterId]')

export const DELETE = withApiHandler(async (_req: NextRequest, ctx: { params: Promise<{ adapterId: string }> }) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const { adapterId } = await ctx.params
  const db = await getDb()

  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')

  const adapter = await db.collection(COLLECTIONS.adapterRegistry).findOne({ adapterId }) as unknown as AdapterManifest | null
  if (!adapter) throw new NotFoundError('Adapter')
  if (adapter.developerId !== account.developerId) throw new ForbiddenError()
  if (adapter.status === 'approved') throw new ForbiddenError('Cannot delete an approved adapter — suspend it instead')

  await db.collection(COLLECTIONS.adapterRegistry).deleteOne({ adapterId })
  return ok({ deleted: true })
}, 'DELETE /api/ecosystem/adapters/[adapterId]')
