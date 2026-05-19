import { NextResponse, type NextRequest } from 'next/server'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const db = await getDb()
    const brand = await db.collection(COLLECTIONS.brands).findOne({
      $or: [{ brandId }, { aliases: brandId }],
      isActive: true,
    })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    return NextResponse.json({ brand })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
