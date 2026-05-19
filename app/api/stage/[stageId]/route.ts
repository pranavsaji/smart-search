import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { redis, RedisKeys } from '@/lib/cache/redis'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ stageId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { stageId } = await params

  // Try Redis cache first
  const cached = await redis.get(RedisKeys.stageState(stageId))
  if (cached) {
    return NextResponse.json(typeof cached === 'string' ? JSON.parse(cached) : cached)
  }

  const db = await getDb()
  const stage = await db.collection(COLLECTIONS.stages).findOne({ _id: stageId as never })
  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  return NextResponse.json(stage)
}
