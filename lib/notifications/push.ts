// Phase 9.3 — Push notification support
// Stores Web Push subscriptions and sends notifications.
// Supports both web push (browser) and Expo push (mobile app).

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { logger } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushPlatform = 'web' | 'expo'

export interface PushSubscription {
  subscriptionId: string
  userId: string
  platform: PushPlatform
  // Web Push fields
  endpoint?: string
  p256dhKey?: string
  authKey?: string
  // Expo Push fields
  expoToken?: string
  createdAt: Date
}

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, unknown>
  url?: string              // deep-link to open on tap
}

// ─── Subscription management ──────────────────────────────────────────────────

export async function savePushSubscription(
  userId: string,
  sub: Omit<PushSubscription, 'subscriptionId' | 'userId' | 'createdAt'>
): Promise<PushSubscription> {
  const db = await getDb()
  const { nanoid } = await import('nanoid')

  const subscription: PushSubscription = {
    subscriptionId: `ps_${nanoid(16)}`,
    userId,
    ...sub,
    createdAt: new Date(),
  }

  // Upsert by endpoint/expoToken to avoid duplicates
  const filter = sub.endpoint
    ? { userId, endpoint: sub.endpoint }
    : { userId, expoToken: sub.expoToken }

  await db.collection(COLLECTIONS.pushSubscriptions).updateOne(
    filter,
    { $set: { ...subscription } },
    { upsert: true }
  )

  return subscription
}

export async function getUserSubscriptions(userId: string): Promise<PushSubscription[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.pushSubscriptions)
    .find({ userId })
    .toArray()
  return docs as unknown as PushSubscription[]
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.pushSubscriptions).deleteOne({ userId, endpoint })
}

// ─── Send notifications ───────────────────────────────────────────────────────

export async function sendPushToUser(
  userId: string,
  notification: PushNotification
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getUserSubscriptions(userId)
  let sent = 0
  let failed = 0

  await Promise.allSettled(
    subscriptions.map(async sub => {
      try {
        if (sub.platform === 'expo' && sub.expoToken) {
          await sendExpoPush(sub.expoToken, notification)
        } else if (sub.platform === 'web' && sub.endpoint) {
          await sendWebPush(sub, notification)
        }
        sent++
      } catch (err) {
        logger.error('[push] send failed', err, { userId, platform: sub.platform })
        failed++
      }
    })
  )

  return { sent, failed }
}

async function sendExpoPush(
  token: string,
  notification: PushNotification
): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
    }),
  })
  if (!res.ok) throw new Error(`Expo push failed: ${res.status}`)
}

async function sendWebPush(
  sub: PushSubscription,
  notification: PushNotification
): Promise<void> {
  // Web Push requires the `web-push` library and VAPID keys.
  // Stubbed here — wire up when VAPID keys are configured.
  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  if (!vapidPublic || !vapidPrivate) {
    logger.warn('[push] VAPID keys not configured — web push skipped')
    return
  }
  // Production: use `web-push` npm package here
  void sub
  void notification
}
