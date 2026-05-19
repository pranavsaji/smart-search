import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { createGiftOrder } from '@/lib/gifts/giftOrder'
import { createSetupIntent } from '@/lib/payments/stripe'
import type { CartItem } from '@/lib/checkout/types'

// z.enum() tuples mirror VendorType and ActivityType from checkout/types.ts.
// bookingPayload: z.record() is used (not z.unknown()/z.any()) because Zod v3's addQuestionMarks
// makes any field whose type includes `undefined` optional in the inferred output type.
// z.unknown() and z.any() both satisfy `undefined extends T`, so they become optional.
// z.record() infers as Record<string, unknown> which is required and assignable to CartItem.bookingPayload: unknown.
const CartItemSchema = z.object({
  id:             z.string(),
  cardId:         z.string(),
  vendorId:       z.string(),
  vendorType:     z.enum(['duffel_flight', 'duffel_stay', 'duffel_car', 'viator', 'opentable', 'shopping', 'freelancer', 'home_service', 'health_provider', 'calendly']),
  activityType:   z.enum(['flights', 'stays', 'cars', 'experiences', 'restaurants', 'weather', 'maps', 'products', 'digital_services', 'home_services', 'health_services', 'appointments']),
  amount:         z.number().int().positive(),
  currency:       z.string().length(3),
  lockedBy:       z.string(),
  isShared:       z.boolean(),
  bookingPayload: z.record(z.string(), z.unknown()),
  isBookable:     z.boolean().default(true),
  deepLinkUrl:    z.string().url().optional(),
  offerExpiresAt: z.string().datetime().transform(s => new Date(s)),
  displayName:    z.string(),
  imageUrl:       z.string().url().optional(),
})
// Output compatibility with CartItem is enforced at the createGiftOrder(data.item) call site below.

const schema = z.object({
  item:       CartItemSchema,
  toUserId:   z.string().optional(),
  toEmail:    z.string().email().optional(),
  message:    z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Sender identity comes from the session — never from the request body.
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const fromUserId = session.user.id

    const body = await req.json()
    const data = schema.parse(body)

    // Create Stripe SetupIntent (save card without charging)
    const setupIntent = await createSetupIntent()

    const order = await createGiftOrder(
      fromUserId,
      { ...data.item, lockedBy: fromUserId },
      '', // paymentMethodId filled after SetupIntent confirmation
      data.toUserId,
      data.toEmail,
      data.message
    )

    return NextResponse.json({
      giftOrderId: order.id,
      token: order.token,
      setupIntentClientSecret: setupIntent.client_secret,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL}/gift/${order.token}`,
    })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
