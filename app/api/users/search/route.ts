import { type NextRequest, NextResponse } from 'next/server'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  try {
    const db = await getDb()
    const filter = q.length > 0
      ? { handle: { $regex: `^${q}`, $options: 'i' } }
      : {}
    const users = await db
      .collection(COLLECTIONS.users)
      .find(filter, { projection: { handle: 1, name: 1, _id: 0 } })
      .sort({ handle: 1 })
      .limit(6)
      .toArray()

    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ users: [] })
  }
}
