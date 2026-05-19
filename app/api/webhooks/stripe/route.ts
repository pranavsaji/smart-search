import { type NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/payments/stripe'
import { getPendingOrder, updateOrderStatus } from '@/lib/checkout/pendingOrder'
import { executeVendorSplit, isDuplicateKeyError } from '@/lib/checkout/split'
import { notifyConfirmation } from '@/lib/sse/notify'
import { recordOutcome } from '@/lib/intent/graph'
import type Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(payload, sig)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent

    const order = await getPendingOrder(pi.id)
    if (!order) {
      console.warn('[webhook] No pending order for PaymentIntent', pi.id)
      return NextResponse.json({ received: true })
    }

    await updateOrderStatus(order.id, 'payment_received')

    // Execute vendor splits — idempotency via processedSplits unique index
    try {
      const confirmations = await executeVendorSplit(order.id, pi.id, order.cartSnapshot.items)

      // If every bookable item failed, split.ts already cancelled the PaymentIntent.
      // Don't mark as confirmed or send a success notification in that case.
      const bookableItems = order.cartSnapshot.items.filter(i => i.isBookable)
      const allLiveFailed =
        bookableItems.length > 0 && confirmations.every(c => c.status === 'failed')

      if (allLiveFailed) {
        await updateOrderStatus(order.id, 'failed')
      } else {
        await updateOrderStatus(order.id, 'confirmed')
        await notifyConfirmation(order.stageId, { orderId: order.id, confirmations })

        for (const item of order.cartSnapshot.items) {
          await recordOutcome(
            order.payerId,
            order.stageId,
            item.activityType,
            item.vendorId,
            item.displayName,
            'mid-range',
            'booking'
          )
        }
      }
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        // Already processed — idempotent 200
        return NextResponse.json({ received: true, idempotent: true })
      }
      await updateOrderStatus(order.id, 'failed')
      console.error('[webhook] Split failed:', err)
    }
  }

  if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const pi = event.data.object as Stripe.PaymentIntent
    const order = await getPendingOrder(pi.id)
    if (order && order.status !== 'failed') await updateOrderStatus(order.id, 'failed')
  }

  return NextResponse.json({ received: true })
}
