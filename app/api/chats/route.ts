import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'

const createSchema = z.object({
  title: z.string().max(200).default('New session'),
  messages: z.array(z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).default([]),
  intentResult: z.any().optional(),
  stageId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  isBrandSession: z.boolean().default(false),
  serviceData: z.record(z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = await getDb()
    const sessions = await db.collection(COLLECTIONS.chatSessions)
      .find({ userId: session.user.id })
      .sort({ updatedAt: -1 })
      .limit(50)
      .project({ title: 1, isBrandSession: 1, brandId: 1, createdAt: 1, updatedAt: 1, stageId: 1 })
      .toArray()

    return NextResponse.json({ sessions })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const data = createSchema.parse(body)
    const db = await getDb()

    const doc = {
      _id: new ObjectId(),
      userId: session.user.id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.collection(COLLECTIONS.chatSessions).insertOne(doc)
    return NextResponse.json({ id: doc._id.toString() }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
