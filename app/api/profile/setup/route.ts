import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

const schema = z.object({
  budgetSignal: z.enum(['budget', 'mid-range', 'premium', 'unspecified']),
  travelStyle: z.enum(['solo', 'couple', 'group', 'unspecified']),
  activityPreferences: z.record(z.string(), z.number().min(0).max(1)),
  // GAP_ANALYSIS 1.2 — seed the graph from onboarding so a brand-new user's
  // first Stage is already personalised instead of blank.
  destinations: z.array(z.string().min(1).max(80)).max(3).optional(),
})

// Weight for a destination the user typed during onboarding. Deliberately below
// a real booking (1.0) and above a browse (0.1): a stated intent is a strong
// signal, but it is not evidence they actually went.
const ONBOARDING_DESTINATION_WEIGHT = 0.5

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    const body = schema.parse(await req.json())
    const db = await getDb()

    const now = new Date()
    const destinations = (body.destinations ?? [])
      .map(d => d.trim())
      .filter(Boolean)
      .map(value => ({
        value,
        weight: ONBOARDING_DESTINATION_WEIGHT,
        recencyScore: 1,
        lastSeen: now,
      }))

    // No upsert: the session user always exists. Upserting with a mistyped _id
    // used to create shadow docs keyed by the raw string id.
    await db.collection(COLLECTIONS.users).updateOne(
      { _id: new ObjectId(session.user.id) },
      {
        $set: {
          'intentGraph.spendingSignal': body.budgetSignal,
          'intentGraph.travelStyle': body.travelStyle,
          'intentGraph.activityPreferences': body.activityPreferences,
          ...(destinations.length ? { 'intentGraph.destinations': destinations } : {}),
          'intentGraph.updatedAt': now,
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
          ...(destinations.length ? { destinations } : {}),
          updatedAt: now,
        },
        $setOnInsert: {
          userId: session.user.id,
          // Only seeds when $set does not already carry destinations — Mongo
          // rejects the same path in both operators.
          ...(destinations.length ? {} : { destinations: [] }),
          seasonalPatterns: [],
          outcomeHistory: [],
        },
      },
      { upsert: true }
    )

    return NextResponse.json({ ok: true, destinationsSeeded: destinations.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
