import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'
import type { WebhookSubscription, WebhookEvent } from './types'

export type { WebhookSubscription, WebhookEvent }

const MAX_CONSECUTIVE_FAILURES = 10

export async function createWebhookSubscription(
  developerId: string,
  url: string,
  events: WebhookEvent[]
): Promise<WebhookSubscription> {
  const db = await getDb()
  const now = new Date()
  const sub: WebhookSubscription = {
    webhookId: nanoid(16),
    developerId,
    url,
    events,
    secret: crypto.randomBytes(32).toString('hex'),
    isActive: true,
    failureCount: 0,
    createdAt: now,
  }
  await db.collection(COLLECTIONS.webhookSubscriptions).insertOne({ _id: new ObjectId(), ...sub })
  return sub
}

export async function getWebhooksByDeveloper(developerId: string): Promise<WebhookSubscription[]> {
  const db = await getDb()
  const docs = await db.collection(COLLECTIONS.webhookSubscriptions)
    .find({ developerId })
    .sort({ createdAt: -1 })
    .toArray()
  return docs as unknown as WebhookSubscription[]
}

export async function deleteWebhook(webhookId: string, developerId: string): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.webhookSubscriptions)
    .deleteOne({ webhookId, developerId })
  return result.deletedCount > 0
}

function sign(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function dispatchWebhookEvent(
  event: WebhookEvent,
  payload: unknown,
  targetDeveloperId?: string  // undefined = broadcast to all subscribers
): Promise<void> {
  const db = await getDb()
  const filter: Record<string, unknown> = { isActive: true, events: event }
  if (targetDeveloperId) filter.developerId = targetDeveloperId
  const subs = await db.collection(COLLECTIONS.webhookSubscriptions)
    .find(filter)
    .toArray() as unknown as WebhookSubscription[]

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString(), id: nanoid(16) })

  await Promise.allSettled(subs.map(sub => deliverWithRetry(sub, body)))
}

async function deliverWithRetry(sub: WebhookSubscription, body: string, attempt = 0): Promise<void> {
  const sig = sign(body, sub.secret)
  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smart Search-Signature': sig,
        'X-Smart Search-Event': body,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // Reset failure count on success
    await markWebhookSuccess(sub.webhookId)
  } catch (err) {
    logger.warn('[Webhooks] delivery failed', { webhookId: sub.webhookId, attempt, err })
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      return deliverWithRetry(sub, body, attempt + 1)
    }
    await incrementWebhookFailure(sub.webhookId)
  }
}

async function markWebhookSuccess(webhookId: string): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.webhookSubscriptions).updateOne(
    { webhookId },
    { $set: { failureCount: 0, lastDeliveredAt: new Date() } }
  )
}

async function incrementWebhookFailure(webhookId: string): Promise<void> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.webhookSubscriptions).findOneAndUpdate(
    { webhookId },
    { $inc: { failureCount: 1 } },
    { returnDocument: 'after' }
  )
  if (result && (result.failureCount as number) >= MAX_CONSECUTIVE_FAILURES) {
    await db.collection(COLLECTIONS.webhookSubscriptions).updateOne(
      { webhookId },
      { $set: { isActive: false } }
    )
    logger.warn('[Webhooks] suspended after consecutive failures', { webhookId })
  }
}
