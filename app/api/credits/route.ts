import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import { getCreditBalance, getCreditHistory, generateReferralCode } from '@/lib/wallet/credits'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const [balance, history, referralCode] = await Promise.all([
      getCreditBalance(userId),
      getCreditHistory(userId, 20),
      generateReferralCode(userId),
    ])
    return NextResponse.json({ balance, history, referralCode })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
