import { type NextRequest, NextResponse } from 'next/server'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { notifyOfferExpired } from '@/lib/sse/notify'
import { broadcastToStage } from '@/lib/sse/broadcast'
import { logger } from '@/lib/logger'

// Uses Node.js runtime — needs crypto module for HMAC verification + MongoDB access.
export const runtime = 'nodejs'

type DuffelEventType =
  | 'order.airline_initiated_change'
  | 'order.cancellation.created'
  | 'order.cancellation.confirmed'

interface DuffelWebhookPayload {
  type: DuffelEventType
  data: {
    object: Record<string, unknown>
  }
}

async function verifyDuffelSignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = 'sha256=' + Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return signature === expected
}

/** Resolve the stageId from a Duffel order ID via a two-step MongoDB lookup. */
async function resolveStageId(duffelOrderId: string): Promise<string | null> {
  const db = await getDb()

  const order = await db.collection(COLLECTIONS.orders).findOne(
    { 'confirmations.vendorOrderId': duffelOrderId },
    { projection: { pendingOrderId: 1 } }
  )
  if (!order) return null

  const pending = await db.collection(COLLECTIONS.pendingOrders).findOne(
    { _id: order.pendingOrderId },
    { projection: { stageId: 1 } }
  )
  return pending?.stageId ?? null
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.DUFFEL_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error('[webhook/duffel] DUFFEL_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const payload = await req.text()
  const signature = req.headers.get('X-Duffel-Signature')

  const valid = await verifyDuffelSignature(payload, signature, webhookSecret)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: DuffelWebhookPayload
  try {
    event = JSON.parse(payload) as DuffelWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const obj = event.data.object
  const duffelOrderId = (obj['order_id'] ?? obj['id']) as string | undefined

  if (!duffelOrderId) {
    logger.warn('[webhook/duffel] No order_id in payload', { type: event.type })
    return NextResponse.json({ received: true })
  }

  const stageId = await resolveStageId(duffelOrderId)
  if (!stageId) {
    logger.warn('[webhook/duffel] Order not found in platform', { duffelOrderId, type: event.type })
    return NextResponse.json({ received: true })
  }

  if (event.type === 'order.cancellation.confirmed') {
    await broadcastToStage(stageId, 'offer_expired', {
      cardId: duffelOrderId,
      reason: 'airline_cancellation',
    })
    logger.info('[webhook/duffel] Cancellation confirmed', { duffelOrderId, stageId })
  }

  if (event.type === 'order.airline_initiated_change') {
    await broadcastToStage(stageId, 'checkout_update', {
      type: 'airline_initiated_change',
      orderId: duffelOrderId,
      change: obj,
    })
    logger.info('[webhook/duffel] Airline-initiated change', { duffelOrderId, stageId })
  }

  return NextResponse.json({ received: true })
}
