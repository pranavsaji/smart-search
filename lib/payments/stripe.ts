import Stripe from 'stripe'
import { env } from '@/lib/config/env'

declare global {
  // eslint-disable-next-line no-var
  var _stripeClient: Stripe | undefined
}

export function getStripe(): Stripe {
  if (!global._stripeClient) {
    global._stripeClient = new Stripe(env.STRIPE_SECRET_KEY(), {
      apiVersion: '2025-02-24.acacia',
    })
  }
  return global._stripeClient
}

export async function createPaymentIntent(
  amount: number,
  currency: string,
  metadata: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    metadata,
    automatic_payment_methods: { enabled: true },
  })
}

export async function createSetupIntent(
  customerId?: string
): Promise<Stripe.SetupIntent> {
  return getStripe().setupIntents.create({
    usage: 'off_session', // required for SCA-compliant gift flow
    ...(customerId ? { customer: customerId } : {}),
  })
}

export async function chargeOffSession(
  paymentMethodId: string,
  amount: number,
  currency: string,
  metadata: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    payment_method: paymentMethodId,
    confirm: true,
    off_session: true,
    metadata,
    error_on_requires_action: true,
  })
}

export async function cancelPaymentIntent(id: string): Promise<void> {
  await getStripe().paymentIntents.cancel(id)
}

export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    env.STRIPE_WEBHOOK_SECRET()
  )
}
