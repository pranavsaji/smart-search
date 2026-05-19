import { type NextRequest, NextResponse } from 'next/server'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export async function GET(req: NextRequest) {
  if (!process.env.MONGODB_URI) return NextResponse.json({ searches: [] })

  try {
    const userId = req.nextUrl.searchParams.get('userId') ?? 'anonymous'
    const db = await getDb()
    const searches = await db
      .collection(COLLECTIONS.searches)
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray()

    return NextResponse.json({
      searches: searches.map(s => ({
        stageId: s.stageId,
        prompt: s.prompt,
        destination: s.destination,
        activityTypes: s.activityTypes,
        createdAt: s.createdAt,
      })),
    })
  } catch (err) {
    console.error('[GET /api/searches]', err)
    return NextResponse.json({ searches: [] })
  }
}
