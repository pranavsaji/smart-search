import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { redeemGiftOrder } from '@/lib/gifts/giftOrder'

const schema = z.object({
  token: z.string(),
  shippingAddress: z.object({
    line1: z.string(), line2: z.string().optional(),
    city: z.string(), state: z.string().optional(),
    postalCode: z.string(), country: z.string(),
  }),
})

export async function POST(req: NextRequest) {
  try {
    const { token, shippingAddress } = schema.parse(await req.json())
    const order = await redeemGiftOrder(token, shippingAddress)
    return NextResponse.json({ order })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('GIFT_NOT_FOUND')) return NextResponse.json({ error: 'Gift not found' }, { status: 404 })
    if (msg.includes('GIFT_EXPIRED')) return NextResponse.json({ error: 'Gift link has expired' }, { status: 410 })
    if (msg.includes('GIFT_INVALID_STATUS')) return NextResponse.json({ error: 'Gift already redeemed' }, { status: 409 })
    if (msg.includes('PAYMENT_FAILED')) return NextResponse.json({ error: 'Payment failed' }, { status: 402 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
