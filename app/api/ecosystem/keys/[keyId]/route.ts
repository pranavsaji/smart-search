import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { DeveloperAccount, DeveloperKey } from '@/lib/ecosystem/types'

export const DELETE = withApiHandler(async (_req: NextRequest, ctx: { params: Promise<{ keyId: string }> }) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const { keyId } = await ctx.params
  const db = await getDb()

  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')

  const key = await db.collection(COLLECTIONS.developerKeys).findOne({ keyId }) as unknown as DeveloperKey | null
  if (!key) throw new NotFoundError('API key')
  if (key.developerId !== account.developerId) throw new ForbiddenError()

  await db.collection(COLLECTIONS.developerKeys).updateOne({ keyId }, { $set: { isActive: false } })
  return ok({ revoked: true })
}, 'DELETE /api/ecosystem/keys/[keyId]')
