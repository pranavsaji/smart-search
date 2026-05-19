import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { z } from 'zod'

const styleSchema = z.object({
  styleProfile: z.object({
    style: z.string(),
    taste: z.string(),
    vibes: z.string(),
    budget: z.string(),
    sizes: z.string().optional().default(''),
    visibility: z.object({
      style: z.boolean(),
      taste: z.boolean(),
      vibes: z.boolean(),
      budget: z.boolean(),
      sizes: z.boolean(),
    }),
  }),
})

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = await getDb()
    const graph = await db.collection(COLLECTIONS.intentGraphs).findOne({ userId: session.user.id })
    return NextResponse.json({ styleProfile: graph?.styleProfile ?? null })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { styleProfile } = styleSchema.parse(body)
    const db = await getDb()

    await db.collection(COLLECTIONS.intentGraphs).updateOne(
      { userId: session.user.id },
      {
        $set: {
          styleProfile: { ...styleProfile, updatedAt: new Date() },
          updatedAt: new Date(),
        },
      },
      { upsert: false }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
