import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { notifyOrderUpdate } from '@/lib/sse/notify'
import { ingestOrder } from '@/lib/graph/knowledgeGraph'
import type { VendorOrder, VendorOrderItem, OrderStatus } from '@/lib/services/catalog/types'
import { logger } from '@/lib/logger'

export type { VendorOrder, OrderStatus }

// ─── Order Creation ──────────────────────────────────────────────────────────

export interface CreateOrderInput {
  userId: string
  vendorId: string
  items: VendorOrderItem[]
  totalAmount: number
  currency: string
  paymentIntentId: string
  shippingAddress?: VendorOrder['shippingAddress']
}

export async function createVendorOrder(input: CreateOrderInput): Promise<VendorOrder> {
  const db = await getDb()
  const now = new Date()

  const order: VendorOrder = {
    orderId: `ORD-${nanoid(10).toUpperCase()}`,
    userId: input.userId,
    vendorId: input.vendorId,
    items: input.items,
    totalAmount: input.totalAmount,
    currency: input.currency,
    status: 'pending',
    paymentIntentId: input.paymentIntentId,
    shippingAddress: input.shippingAddress,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.vendorOrders).insertOne({ _id: new ObjectId(), ...order })

  // Phase 12.3 — feed the knowledge graph (co_booked edges). Fire-and-forget:
  // graph building must never block or fail order creation.
  ingestOrder({ items: order.items }).catch(err =>
    logger.error('[orders] graph ingest failed', err, { orderId: order.orderId }),
  )

  return order
}

// ─── Status Updates ──────────────────────────────────────────────────────────

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  extras?: { trackingUrl?: string; stripeTransferId?: string; stripeRefundId?: string }
): Promise<VendorOrder | null> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.vendorOrders).findOneAndUpdate(
    { orderId },
    { $set: { status, updatedAt: new Date(), ...extras } },
    { returnDocument: 'after' }
  )
  if (!result) return null

  // Broadcast SSE so UI updates in real-time
  await notifyOrderUpdate(result.userId as string, orderId, status, extras?.trackingUrl).catch(
    err => logger.error('[orders] SSE notify failed', err, { orderId })
  )
  return result as unknown as VendorOrder
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getUserOrders(userId: string): Promise<VendorOrder[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.vendorOrders)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
  return docs as unknown as VendorOrder[]
}

export async function getOrderById(orderId: string): Promise<VendorOrder | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.vendorOrders).findOne({ orderId })
  return doc as unknown as VendorOrder | null
}

export async function getVendorOrders(vendorId: string, status?: OrderStatus): Promise<VendorOrder[]> {
  const db = await getDb()
  const filter = status ? { vendorId, status } : { vendorId }
  const docs = await db
    .collection(COLLECTIONS.vendorOrders)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray()
  return docs as unknown as VendorOrder[]
}

export function orderBelongsToUser(order: VendorOrder, userId: string): boolean {
  return order.userId === userId
}

export function orderBelongsToVendor(order: VendorOrder, vendorId: string): boolean {
  return order.vendorId === vendorId
}
