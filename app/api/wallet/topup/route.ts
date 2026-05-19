import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import { createTopUpIntent } from '@/lib/wallet/wallet'
import type { WalletCurrency } from '@/lib/wallet/types'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const body = await req.json() as { amountCents?: number; currency?: WalletCurrency }

    if (!body.amountCents || typeof body.amountCents !== 'number') {
      return NextResponse.json({ error: 'amountCents required' }, { status: 400 })
    }

    const result = await createTopUpIntent(userId, body.amountCents, body.currency)
    return NextResponse.json(result, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (err.message === 'TOPUP_MINIMUM_100') return NextResponse.json({ error: 'Minimum top-up is £1' }, { status: 400 })
      if (err.message === 'TOPUP_MAXIMUM_EXCEEDED') return NextResponse.json({ error: 'Maximum top-up is £10,000' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
