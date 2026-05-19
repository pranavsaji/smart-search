import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { getStripe } from '@/lib/payments/stripe'
import { getOrderById, updateOrderStatus } from './orders'
import type { ReturnRequest } from '@/lib/services/catalog/types'
import { logger } from '@/lib/logger'

export const RETURN_WINDOW_DAYS = 14

export type { ReturnRequest }

// ─── Return Window Guard ─────────────────────────────────────────────────────

export function isWithinReturnWindow(order: { createdAt: Date }): boolean {
  const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return Date.now() - order.createdAt.getTime() < windowMs
}

// ─── Initiate Return ─────────────────────────────────────────────────────────

export interface InitiateReturnInput {
  orderId: string
  userId: string
  reason: string
}

export async function initiateReturn(input: InitiateReturnInput): Promise<ReturnRequest> {
  const db = await getDb()

  const order = await getOrderById(input.orderId)
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (order.userId !== input.userId) throw new Error('FORBIDDEN')
  if (!['delivered', 'confirmed', 'shipped'].includes(order.status)) {
    throw new Error('RETURN_INVALID_STATUS')
  }
  if (!isWithinReturnWindow(order)) {
    throw new Error('RETURN_WINDOW_EXPIRED')
  }

  const existing = await db.collection(COLLECTIONS.returnRequests).findOne({
    orderId: input.orderId,
    status: { $in: ['requested', 'approved'] },
  })
  if (existing) throw new Error('RETURN_ALREADY_REQUESTED')

  const now = new Date()
  const returnReq: ReturnRequest = {
    returnId: `RET-${nanoid(10).toUpperCase()}`,
    orderId: input.orderId,
    userId: input.userId,
    vendorId: order.vendorId,
    reason: input.reason,
    status: 'requested',
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.returnRequests).insertOne({ _id: new ObjectId(), ...returnReq })
  return returnReq
}

// ─── Vendor Approves / Rejects Return ────────────────────────────────────────

export async function processReturn(
  returnId: string,
  vendorId: string,
  action: 'approve' | 'reject'
): Promise<ReturnRequest> {
  const db = await getDb()

  const ret = await db.collection(COLLECTIONS.returnRequests).findOne({ returnId }) as ReturnRequest | null
  if (!ret) throw new Error('RETURN_NOT_FOUND')
  if (ret.vendorId !== vendorId) throw new Error('FORBIDDEN')
  if (ret.status !== 'requested') throw new Error('RETURN_INVALID_STATUS')

  if (action === 'reject') {
    const updated = await db.collection(COLLECTIONS.returnRequests).findOneAndUpdate(
      { returnId },
      { $set: { status: 'rejected', updatedAt: new Date() } },
      { returnDocument: 'after' }
    )
    return updated as unknown as ReturnRequest
  }

  // Approve → issue Stripe refund
  const order = await getOrderById(ret.orderId)
  if (!order?.paymentIntentId) throw new Error('PAYMENT_NOT_FOUND')

  let stripeRefundId: string | undefined
  try {
    const stripe = getStripe()
    const refund = await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
      reason: 'requested_by_customer',
    })
    stripeRefundId = refund.id
    logger.info('[returns] Stripe refund created', { refundId: refund.id, orderId: ret.orderId })
  } catch (err) {
    logger.error('[returns] Stripe refund failed', err, { returnId })
    throw new Error('REFUND_FAILED')
  }

  const [updated] = await Promise.all([
    db.collection(COLLECTIONS.returnRequests).findOneAndUpdate(
      { returnId },
      { $set: { status: 'refunded', stripeRefundId, refundAmount: order.totalAmount, updatedAt: new Date() } },
      { returnDocument: 'after' }
    ),
    updateOrderStatus(ret.orderId, 'returned'),
  ])

  return updated as unknown as ReturnRequest
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getReturnsByOrder(orderId: string): Promise<ReturnRequest[]> {
  const db = await getDb()
  const docs = await db.collection(COLLECTIONS.returnRequests).find({ orderId }).toArray()
  return docs as unknown as ReturnRequest[]
}

export async function getVendorReturnRequests(vendorId: string): Promise<ReturnRequest[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.returnRequests)
    .find({ vendorId, status: 'requested' })
    .sort({ createdAt: -1 })
    .toArray()
  return docs as unknown as ReturnRequest[]
}
