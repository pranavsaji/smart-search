// Phase 9.3 — Push notification subscription management

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, noContent, withApiHandler } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'
import { savePushSubscription, removePushSubscription } from '@/lib/notifications/push'

const subscribeSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal('expo'),
    expoToken: z.string().min(1),
  }),
  z.object({
    platform: z.literal('web'),
    endpoint: z.string().url(),
    p256dhKey: z.string().min(1),
    authKey: z.string().min(1),
  }),
])

// POST — subscribe to push notifications
export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const body = subscribeSchema.parse(await req.json())
  const subscription = await savePushSubscription(userId, body)
  return ok({ subscriptionId: subscription.subscriptionId }, 201)
}, 'POST /api/push/subscribe')

// DELETE — unsubscribe (web push endpoint)
const unsubSchema = z.object({ endpoint: z.string().url() })

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const { endpoint } = unsubSchema.parse(await req.json())
  await removePushSubscription(userId, endpoint)
  return noContent()
}, 'DELETE /api/push/subscribe')
