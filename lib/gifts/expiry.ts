import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { getStripe } from '@/lib/payments/stripe'

export async function expireStaleGifts(): Promise<{ expired: number; errors: string[] }> {
  const db = await getDb()
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const stripe = getStripe()
  const errors: string[] = []

  const stale = await db
    .collection(COLLECTIONS.giftOrders)
    .find({ status: 'pending_address', createdAt: { $lt: cutoff } })
    .toArray()

  for (const gift of stale) {
    try {
      if (gift.setupIntentId) {
        await stripe.setupIntents.cancel(gift.setupIntentId)
      }
    } catch (err) {
      errors.push(`Failed to cancel SetupIntent for gift ${gift._id}: ${String(err)}`)
    }
  }

  const result = await db.collection(COLLECTIONS.giftOrders).updateMany(
    { status: 'pending_address', createdAt: { $lt: cutoff } },
    { $set: { status: 'expired', expiredAt: new Date() } }
  )

  return { expired: result.modifiedCount, errors }
}
