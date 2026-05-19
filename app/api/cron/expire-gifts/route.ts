import { type NextRequest, NextResponse } from 'next/server'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized invocations
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = await getDb()
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const result = await db.collection(COLLECTIONS.giftOrders).updateMany(
    { status: 'pending_address', createdAt: { $lt: cutoff } },
    { $set: { status: 'expired' } }
  )

  return NextResponse.json({ expired: result.modifiedCount })
}
