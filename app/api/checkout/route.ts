import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { createPendingOrder } from '@/lib/checkout/pendingOrder'
import { createPaymentIntent } from '@/lib/payments/stripe'
import { ok, withApiHandler, BadRequestError } from '@/lib/api/response'
import { requireUserId } from '@/lib/api/auth'

const schema = z.object({
  stageId: z.string(),
  paymentMode: z.enum(['one_pays_all', 'split_equally', 'pay_your_own']).default('one_pays_all'),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const userId = await requireUserId()
  const { stageId, paymentMode } = schema.parse(await req.json())

  const db = await getDb()
  const cart = await db.collection(COLLECTIONS.stageCarts).findOne({ stageId })
  if (!cart || !cart.items?.length) throw new BadRequestError('Cart is empty')

  const items = cart.items as Array<{ amount: number; currency: string }>
  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0)
  const currency = items[0]?.currency ?? 'USD'

  const paymentIntent = await createPaymentIntent(totalAmount, currency, { stageId, userId, paymentMode })

  await createPendingOrder(
    { ...cart, items: cart.items, paymentMode, initiatorId: userId } as unknown as Parameters<typeof createPendingOrder>[0],
    userId,
    paymentIntent.id,
  )

  return ok({
    clientSecret: paymentIntent.client_secret,
    totalAmount,
    currency,
    paymentIntentId: paymentIntent.id,
  })
}, 'POST /api/checkout')
