import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import { getOrCreateWallet, getWalletBalance, getWalletTransactions } from '@/lib/wallet/wallet'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const [wallet, balance, transactions] = await Promise.all([
      getOrCreateWallet(userId),
      getWalletBalance(userId),
      getWalletTransactions(userId, 20),
    ])
    return NextResponse.json({ wallet: { ...wallet, balanceCents: balance }, transactions })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
