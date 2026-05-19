import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'

const updateSchema = z.object({
  title: z.string().max(200).optional(),
  messages: z.array(z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
  intentResult: z.any().optional(),
  stageId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  isBrandSession: z.boolean().optional(),
  serviceData: z.record(z.unknown()).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const db = await getDb()
    const chatSession = await db.collection(COLLECTIONS.chatSessions).findOne({
      _id: new ObjectId(id),
      userId: session.user.id,
    })

    if (!chatSession) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ session: chatSession })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const body = await req.json()
    const updates = updateSchema.parse(body)
    const db = await getDb()

    const result = await db.collection(COLLECTIONS.chatSessions).updateOne(
      { _id: new ObjectId(id), userId: session.user.id },
      { $set: { ...updates, updatedAt: new Date() } }
    )

    if (result.matchedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const db = await getDb()
    await db.collection(COLLECTIONS.chatSessions).deleteOne({
      _id: new ObjectId(id),
      userId: session.user.id,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
