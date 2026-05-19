import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ok, withApiHandler } from '@/lib/api/response'
import { notifyLockUpdate } from '@/lib/sse/notify'
import type { CartItem } from '@/lib/checkout/types'
import { nanoid } from 'nanoid'

const schema = z.object({
  stageId: z.string(),
  card: z.object({
    id: z.string(),
    serviceType: z.string(),
    vendorId: z.string(),
    vendorType: z.string(),
    displayName: z.string(),
    imageUrl: z.string().optional(),
    price: z.object({
      amount: z.number(),
      currency: z.string(),
      displayText: z.string(),
    }).optional(),
    offerExpiresAt: z.string().transform(s => new Date(s)),
    bookingPayload: z.unknown(),
    isBookable: z.boolean().default(true),
    deepLinkUrl: z.string().optional(),
    isShared: z.boolean().default(false),
  }).passthrough(),
  userId: z.string(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const { stageId, card, userId } = schema.parse(await req.json())

  const cartItem: CartItem = {
    id: nanoid(),
    cardId: card.id,
    vendorId: card.vendorId,
    vendorType: card.vendorType as CartItem['vendorType'],
    activityType: card.serviceType as CartItem['activityType'],
    amount: card.price?.amount ?? 0,
    currency: card.price?.currency ?? 'GBP',
    lockedBy: userId,
    isShared: card.isShared,
    bookingPayload: card.bookingPayload,
    isBookable: card.isBookable,
    deepLinkUrl: card.deepLinkUrl,
    offerExpiresAt: card.offerExpiresAt,
    displayName: card.displayName,
    imageUrl: card.imageUrl,
  }

  const db = await getDb()
  await db.collection(COLLECTIONS.stageCarts).updateOne(
    { stageId },
    {
      $push: { items: cartItem } as never,
      $set: { updatedAt: new Date() },
      $setOnInsert: { stageId, participants: [userId], status: 'building', paymentMode: 'one_pays_all', initiatorId: userId, createdAt: new Date() },
    },
    { upsert: true }
  )

  await notifyLockUpdate(stageId, cartItem, userId)
  return ok({ cartItem })
}, 'POST /api/stage/lock')

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const { stageId, cartItemId, userId } = await req.json()
  const db = await getDb()
  await db.collection(COLLECTIONS.stageCarts).updateOne(
    { stageId },
    { $pull: { items: { id: cartItemId, lockedBy: userId } } as never }
  )
  return ok({ ok: true })
}, 'DELETE /api/stage/lock')
