import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

const schema = z.object({
  budgetSignal: z.enum(['budget', 'mid-range', 'premium', 'unspecified']),
  travelStyle: z.enum(['solo', 'couple', 'group', 'unspecified']),
  activityPreferences: z.record(z.string(), z.number().min(0).max(1)),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    const body = schema.parse(await req.json())
    const db = await getDb()

    // No upsert: the session user always exists. Upserting with a mistyped _id
    // used to create shadow docs keyed by the raw string id.
    await db.collection(COLLECTIONS.users).updateOne(
      { _id: new ObjectId(session.user.id) },
      {
        $set: {
          'intentGraph.spendingSignal': body.budgetSignal,
          'intentGraph.travelStyle': body.travelStyle,
          'intentGraph.activityPreferences': body.activityPreferences,
          'intentGraph.updatedAt': new Date(),
          onboardingComplete: true,
        },
      }
    )

    // Mirror to intentGraphs collection for ranking lookups
    await db.collection(COLLECTIONS.intentGraphs ?? 'intentGraphs').updateOne(
      { userId: session.user.id },
      {
        $set: {
          spendingSignal: body.budgetSignal,
          travelStyle: body.travelStyle,
          activityPreferences: body.activityPreferences,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: session.user.id,
          destinations: [],
          seasonalPatterns: [],
          outcomeHistory: [],
        },
      },
      { upsert: true }
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
