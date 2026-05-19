import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import type { AdapterRating } from '@/lib/ecosystem/types'

const schema = z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })

export const POST = withApiHandler(async (req: NextRequest, ctx: { params: Promise<{ adapterId: string }> }) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const { adapterId } = await ctx.params
  const body = schema.parse(await req.json())
  const db = await getDb()

  const adapter = await db.collection(COLLECTIONS.adapterRegistry).findOne({ adapterId, status: 'approved' })
  if (!adapter) throw new NotFoundError('Adapter')

  const rating: AdapterRating = {
    ratingId: nanoid(16),
    adapterId,
    userId: session.user.id,
    score: body.score,
    comment: body.comment,
    createdAt: new Date(),
  }

  // Upsert — one rating per user per adapter
  await db.collection(COLLECTIONS.adapterRatings).replaceOne(
    { adapterId, userId: session.user.id },
    { _id: new ObjectId(), ...rating },
    { upsert: true }
  )

  // Recalculate aggregate rating
  const agg = await db.collection(COLLECTIONS.adapterRatings).aggregate([
    { $match: { adapterId } },
    { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } },
  ]).toArray()

  if (agg.length > 0) {
    await db.collection(COLLECTIONS.adapterRegistry).updateOne(
      { adapterId },
      { $set: { rating: Math.round(agg[0].avg * 10) / 10, ratingCount: agg[0].count, updatedAt: new Date() } }
    )
  }

  return ok(rating, 201)
}, 'POST /api/ecosystem/adapters/[adapterId]/rate')
