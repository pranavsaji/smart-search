import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { createWebhookSubscription, getWebhooksByDeveloper } from '@/lib/ecosystem/webhooks'
import type { DeveloperAccount, WebhookEvent } from '@/lib/ecosystem/types'

const schema = z.object({
  url: z.string().url().startsWith('https://'),
  events: z.array(z.enum(['booking.confirmed', 'booking.failed', 'stage.created', 'order.shipped', 'order.delivered', 'order.returned'] as const)).min(1),
})

async function requireDeveloper(userId: string) {
  const db = await getDb()
  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')
  return account
}

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  const account = await requireDeveloper(session.user.id)
  const subs = await getWebhooksByDeveloper(account.developerId)
  // Strip secrets
  return ok(subs.map(s => ({ ...s, secret: undefined })))
}, 'GET /api/ecosystem/webhooks')

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  const account = await requireDeveloper(session.user.id)

  const body = schema.parse(await req.json())
  const sub = await createWebhookSubscription(account.developerId, body.url, body.events as WebhookEvent[])
  // Return secret ONCE
  return ok(sub, 201)
}, 'POST /api/ecosystem/webhooks')
