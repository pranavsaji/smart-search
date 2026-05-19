import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { PendingOrder, StageCart, PaymentMode } from './types'
import { nanoid } from 'nanoid'

const VALID_PAYMENT_MODES = new Set<PaymentMode>(['one_pays_all', 'split_equally', 'pay_your_own'])

export async function createPendingOrder(
  cart: StageCart,
  payerId: string,
  stripePaymentIntentId: string
): Promise<PendingOrder> {
  if (!VALID_PAYMENT_MODES.has(cart.paymentMode)) {
    throw new Error(`Invalid paymentMode: ${cart.paymentMode}`)
  }

  const db = await getDb()

  // Validate no expired offers at checkout time
  const now = new Date()
  const expiredItems = cart.items.filter(
    item => item.offerExpiresAt && new Date(item.offerExpiresAt) < new Date(now.getTime() + 60_000)
  )
  if (expiredItems.length > 0) {
    throw new Error(`OFFER_EXPIRED:${expiredItems.map(i => i.id).join(',')}`)
  }

  const earliestExpiry = cart.items.reduce<Date>((min, item) => {
    const exp = new Date(item.offerExpiresAt)
    return exp < min ? exp : min
  }, new Date(Date.now() + 30 * 60 * 1000))

  const totalAmount = cart.items.reduce((sum, item) => sum + item.amount, 0)
  const currency = cart.items[0]?.currency ?? 'GBP'

  const order: PendingOrder = {
    id: nanoid(),
    stageId: cart.stageId,
    cartSnapshot: cart,
    totalAmount,
    currency,
    payerId,
    stripePaymentIntentId,
    status: 'pending',
    expiresAt: earliestExpiry,
    createdAt: new Date(),
  }

  await db.collection(COLLECTIONS.pendingOrders).insertOne(order)
  return order
}

export async function updateOrderStatus(
  orderId: string,
  status: PendingOrder['status']
): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.pendingOrders).updateOne(
    { id: orderId },
    { $set: { status } }
  )
}

export async function getPendingOrder(stripePaymentIntentId: string): Promise<PendingOrder | null> {
  const db = await getDb()
  return db.collection(COLLECTIONS.pendingOrders).findOne<PendingOrder>({ stripePaymentIntentId })
}
