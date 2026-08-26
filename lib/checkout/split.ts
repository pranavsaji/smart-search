import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { CartItem, OrderConfirmation } from './types'
import { serviceRegistry } from '@/lib/services/registry'
import { cancelPaymentIntent } from '@/lib/payments/stripe'
import { ObjectId } from 'mongodb'
import { logger } from '@/lib/logger'
import { reportError } from '@/lib/telemetry/report'

// Idempotency guarantee: MongoDB unique index on paymentIntentId.
// DuplicateKeyError (11000) on second call = safe 200, no re-execution.
export async function executeVendorSplit(
  pendingOrderId: string,
  paymentIntentId: string,
  items: CartItem[]
): Promise<OrderConfirmation[]> {
  const db = await getDb()

  await db.collection(COLLECTIONS.processedSplits).insertOne({
    _id: new ObjectId(),
    paymentIntentId,
    pendingOrderId,
    processedAt: new Date(),
  })

  // Non-bookable items are display-only — excluded from payment and vendor dispatch.
  // They surface as redirect confirmations so the checkout screen can show deep links.
  const bookable = items.filter(i => i.isBookable)
  const redirectOnly = items.filter(i => !i.isBookable)

  const liveResults = await Promise.allSettled(
    bookable.map(async (item): Promise<OrderConfirmation> => {
      const adapter = serviceRegistry.getEnabledByType(item.activityType)
      if (!adapter) {
        return {
          vendorOrderId: '',
          confirmationCode: '',
          status: 'failed',
          errorMessage: `No enabled adapter for ${item.activityType}`,
        }
      }
      return adapter.createOrder(item)
    })
  )

  const liveConfirmations: OrderConfirmation[] = liveResults.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { vendorOrderId: '', confirmationCode: '', status: 'failed', errorMessage: String(r.reason) }
  )

  // Redirect-only items resolve with their deep link instead of a vendor booking.
  const redirectConfirmations: OrderConfirmation[] = redirectOnly.map((item) => ({
    vendorOrderId: item.vendorId,
    confirmationCode: item.displayName,
    status: 'confirmed',
    deepLinkUrl: item.deepLinkUrl,
  }))

  const allConfirmations = [...liveConfirmations, ...redirectConfirmations]

  // If every bookable item failed, the user should not have been charged.
  // Cancel the PaymentIntent so Stripe issues an automatic refund.
  const allLiveFailed = bookable.length > 0 && liveConfirmations.every(c => c.status === 'failed')
  if (allLiveFailed) {
    try {
      await cancelPaymentIntent(paymentIntentId)
      logger.error('[split] All vendor bookings failed — PaymentIntent cancelled', { paymentIntentId, pendingOrderId })
    } catch (err) {
      logger.error('[split] Failed to cancel PaymentIntent after booking failure', err, { paymentIntentId })
      // Highest-severity state in the app: every booking failed AND the charge
      // could not be cancelled, so the user is out of pocket with nothing
      // booked. This one needs a human, not a log line.
      reportError(err, {
        scope: 'checkout.split.cancelFailed',
        extra: { paymentIntentId, pendingOrderId },
      })
    }
  }

  await db.collection(COLLECTIONS.orders).insertOne({
    _id: new ObjectId(),
    paymentIntentId,
    pendingOrderId,
    items,
    confirmations: allConfirmations,
    allLiveFailed,
    confirmedAt: new Date(),
  })

  return allConfirmations
}

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000
}
