import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import { createSplitRequest, getUserSplits } from '@/lib/wallet/splitPayments'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const splits = await getUserSplits(userId)
    return NextResponse.json({ splits })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const body = await req.json() as {
      stageId?: string
      requesterHandle?: string
      totalAmountCents?: number
      currency?: string
      description?: string
      participants?: unknown[]
    }

    if (!body.stageId || !body.totalAmountCents || !Array.isArray(body.participants) || !body.requesterHandle) {
      return NextResponse.json({ error: 'stageId, requesterHandle, totalAmountCents, and participants required' }, { status: 400 })
    }

    const split = await createSplitRequest({
      stageId: body.stageId,
      requesterId: userId,
      requesterHandle: body.requesterHandle,
      totalAmountCents: body.totalAmountCents,
      currency: body.currency ?? 'USD',
      description: body.description ?? 'Stage split',
      participants: body.participants as Array<{ userId: string; handle: string; ratioPercent: number }>,
    })
    return NextResponse.json(split, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ((err as { code?: string }).code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (err.message.startsWith('INVALID_RATIOS')) return NextResponse.json({ error: err.message }, { status: 400 })
      if (err.message === 'SPLIT_REQUIRES_TWO_PARTICIPANTS') return NextResponse.json({ error: err.message }, { status: 400 })
      if (err.message === 'SPLIT_MINIMUM_100') return NextResponse.json({ error: 'Minimum split is $1' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
