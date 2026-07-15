import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import { redeemCredits } from '@/lib/wallet/credits'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const body = await req.json() as { amountCents?: number; orderId?: string }

    if (!body.amountCents || !body.orderId) {
      return NextResponse.json({ error: 'amountCents and orderId required' }, { status: 400 })
    }

    const result = await redeemCredits(userId, body.amountCents, body.orderId)
    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ((err as { code?: string }).code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (err.message === 'NO_CREDITS') return NextResponse.json({ error: 'No credits available' }, { status: 402 })
      if (err.message === 'REDEMPTION_TOO_SMALL') return NextResponse.json({ error: 'Redemption amount too small' }, { status: 400 })
      if (err.message === 'CREDIT_ALREADY_APPLIED') return NextResponse.json({ error: 'Credits already applied to this order' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
