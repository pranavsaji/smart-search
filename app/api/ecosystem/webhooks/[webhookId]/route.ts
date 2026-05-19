import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { deleteWebhook } from '@/lib/ecosystem/webhooks'
import type { DeveloperAccount } from '@/lib/ecosystem/types'

export const DELETE = withApiHandler(async (_req: NextRequest, ctx: { params: Promise<{ webhookId: string }> }) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const db = await getDb()
  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')

  const { webhookId } = await ctx.params
  const deleted = await deleteWebhook(webhookId, account.developerId)
  if (!deleted) throw new NotFoundError('Webhook')
  return ok({ deleted: true })
}, 'DELETE /api/ecosystem/webhooks/[webhookId]')
