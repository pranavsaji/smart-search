import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

// GET /api/follow?handle=alice — get follow status
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ following: false })
  }

  const handle = req.nextUrl.searchParams.get('handle')
  if (!handle) return NextResponse.json({ error: 'Missing handle' }, { status: 400 })

  const db = await getDb()
  const target = await db.collection(COLLECTIONS.users).findOne({ handle: handle.replace('@', '') })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const exists = await db.collection('follows').findOne({
    followerId: session.user.id,
    followingId: target._id.toString(),
  })

  return NextResponse.json({ following: Boolean(exists) })
}

// POST /api/follow — follow a user
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { handle } = await req.json() as { handle: string }
  if (!handle) return NextResponse.json({ error: 'Missing handle' }, { status: 400 })

  const db = await getDb()
  const target = await db.collection(COLLECTIONS.users).findOne({ handle: handle.replace('@', '') })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const targetId = target._id.toString()
  if (targetId === session.user.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
  }

  await db.collection('follows').updateOne(
    { followerId: session.user.id, followingId: targetId },
    { $setOnInsert: { followerId: session.user.id, followingId: targetId, createdAt: new Date() } },
    { upsert: true }
  )

  return NextResponse.json({ following: true })
}

// DELETE /api/follow — unfollow
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { handle } = await req.json() as { handle: string }
  if (!handle) return NextResponse.json({ error: 'Missing handle' }, { status: 400 })

  const db = await getDb()
  const target = await db.collection(COLLECTIONS.users).findOne({ handle: handle.replace('@', '') })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await db.collection('follows').deleteOne({
    followerId: session.user.id,
    followingId: target._id.toString(),
  })

  return NextResponse.json({ following: false })
}
