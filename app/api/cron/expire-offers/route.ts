import { type NextRequest, NextResponse } from 'next/server'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { notifyOfferExpired } from '@/lib/sse/notify'
import { logger } from '@/lib/logger'
import type { CartItem } from '@/lib/checkout/types'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = await getDb()
  const now = new Date()

  // Only scan carts still being built — confirmed/processing carts have already
  // passed the offer-expiry check at checkout and don't need real-time eviction.
  const carts = await db
    .collection(COLLECTIONS.stageCarts)
    .find(
      { status: 'building', 'items.offerExpiresAt': { $lt: now } },
      { projection: { stageId: 1, items: 1 } }
    )
    .toArray()

  if (carts.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  let totalExpired = 0

  for (const cart of carts) {
    const items = (cart.items ?? []) as CartItem[]
    const expiredItems = items.filter(i => new Date(i.offerExpiresAt) < now)

    for (const item of expiredItems) {
      try {
        await notifyOfferExpired(cart.stageId, item.cardId)
      } catch (err) {
        logger.error('[cron/expire-offers] Failed to notify', err, {
          stageId: cart.stageId,
          cardId: item.cardId,
        })
      }
    }

    // Evict expired items from the cart in a single atomic update
    await db.collection(COLLECTIONS.stageCarts).updateOne(
      { stageId: cart.stageId },
      { $pull: { items: { offerExpiresAt: { $lt: now } } } as never }
    )

    totalExpired += expiredItems.length
  }

  logger.info('[cron/expire-offers] Evicted expired offers', { totalExpired })
  return NextResponse.json({ expired: totalExpired })
}
