import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { GiftOrder, CartItem, ShippingAddress } from '@/lib/checkout/types'
import { chargeOffSession } from '@/lib/payments/stripe'
import { serviceRegistry } from '@/lib/services/registry'
import { nanoid } from 'nanoid'
import { ObjectId } from 'mongodb'

export async function createGiftOrder(
  fromUserId: string,
  item: CartItem,
  paymentMethodId: string,
  toUserId?: string,
  toEmail?: string,
  message?: string
): Promise<GiftOrder> {
  const db = await getDb()

  const order: GiftOrder = {
    id: nanoid(),
    token: nanoid(32),
    fromUserId,
    toUserId,
    toEmail,
    item,
    message,
    paymentMethodId,
    status: 'pending_address',
    createdAt: new Date(),
  }

  await db.collection(COLLECTIONS.giftOrders).insertOne({ ...order, _id: new ObjectId() })
  return order
}

export async function redeemGiftOrder(
  token: string,
  shippingAddress: ShippingAddress
): Promise<GiftOrder> {
  const db = await getDb()
  const col = db.collection<GiftOrder>(COLLECTIONS.giftOrders)

  const order = await col.findOne({ token })
  if (!order) throw new Error('GIFT_NOT_FOUND')
  if (order.status !== 'pending_address') throw new Error(`GIFT_INVALID_STATUS:${order.status}`)

  // 3-day expiry check
  const ageMs = Date.now() - new Date(order.createdAt).getTime()
  if (ageMs > 3 * 24 * 60 * 60 * 1000) {
    await col.updateOne({ token }, { $set: { status: 'expired' } })
    throw new Error('GIFT_EXPIRED')
  }

  await col.updateOne({ token }, { $set: { status: 'address_received', shippingAddress } })

  // Charge sender's card off-session
  await col.updateOne({ token }, { $set: { status: 'payment_processing' } })

  try {
    await chargeOffSession(
      order.paymentMethodId,
      order.item.amount,
      order.item.currency,
      { giftOrderId: order.id, token }
    )
  } catch (err) {
    await col.updateOne({ token }, { $set: { status: 'failed' } })
    throw new Error(`PAYMENT_FAILED:${String(err)}`)
  }

  // Create vendor order under recipient's details
  const adapter = serviceRegistry.getByType(order.item.activityType)[0]
  if (adapter) {
    await adapter.createOrder(order.item, shippingAddress)
  }

  await col.updateOne({ token }, { $set: { status: 'confirmed', redeemedAt: new Date() } })
  return (await col.findOne({ token })) as GiftOrder
}

export async function getGiftByToken(token: string): Promise<GiftOrder | null> {
  const db = await getDb()
  return db.collection<GiftOrder>(COLLECTIONS.giftOrders).findOne({ token })
}
