import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { enforceRateLimit, rateLimitIdentifier, RATE_LIMITS } from '@/lib/ratelimit'
import { ApiError, handleApiError } from '@/lib/api/response'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  handle: z.string().min(2).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(80),
})

export async function POST(req: NextRequest) {
  try {
    // No session yet, so this buckets by IP — it is the account-spam surface.
    await enforceRateLimit(RATE_LIMITS.register, rateLimitIdentifier(null, req))

    const body = schema.parse(await req.json())
    const db = await getDb()

    const existing = await db.collection(COLLECTIONS.users).findOne({
      $or: [{ email: body.email }, { handle: body.handle }],
    })
    if (existing) {
      const field = existing.email === body.email ? 'email' : 'handle'
      return NextResponse.json({ error: `${field} already taken` }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(body.password, 12)
    const userId = new ObjectId()
    await db.collection(COLLECTIONS.users).insertOne({
      _id: userId,
      email: body.email,
      passwordHash,
      handle: body.handle,
      displayName: body.displayName,
      intentGraph: {
        userId: userId.toString(),
        destinations: [],
        spendingSignal: 'unspecified',
        activityPreferences: {
          flights: 0.5, stays: 0.5, cars: 0.5, experiences: 0.5, restaurants: 0.5,
          weather: 0.5, maps: 0.5, products: 0.5, digital_services: 0.5,
          home_services: 0.5, health_services: 0.5, appointments: 0.5,
        },
        travelStyle: 'unspecified',
        seasonalPatterns: [],
        outcomeHistory: [],
        updatedAt: new Date(),
      },
      createdAt: new Date(),
    })

    return NextResponse.json({ ok: true, userId: userId.toString(), redirectTo: '/onboarding' }, { status: 201 })
  } catch (err) {
    if (err instanceof ApiError) return handleApiError(err, 'POST /api/auth/register')
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
