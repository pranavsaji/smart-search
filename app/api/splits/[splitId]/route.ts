import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import {
  getSplitRequest,
  approveAndSettle,
  declineSplit,
  cancelSplit,
} from '@/lib/wallet/splitPayments'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ splitId: string }> }
): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const { splitId } = await params
    const split = await getSplitRequest(splitId)
    if (!split) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isRelated = split.requesterId === userId ||
      split.participants.some(p => p.userId === userId)
    if (!isRelated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json(split)
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ splitId: string }> }
): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const { splitId } = await params
    const body = await req.json() as { action?: string; method?: 'wallet' | 'card' }

    if (!body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

    if (body.action === 'approve') {
      const updated = await approveAndSettle({ splitId, userId, method: body.method ?? 'wallet' })
      return NextResponse.json(updated)
    }
    if (body.action === 'decline') {
      const updated = await declineSplit(splitId, userId)
      return NextResponse.json(updated)
    }
    if (body.action === 'cancel') {
      const updated = await cancelSplit(splitId, userId)
      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: 'Invalid action. Use approve, decline, or cancel' }, { status: 400 })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ((err as { code?: string }).code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (err.message === 'SPLIT_NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (err.message === 'SPLIT_NOT_FOUND_OR_NOT_OWNER') return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 })
      if (err.message === 'NOT_A_PARTICIPANT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (err.message === 'INSUFFICIENT_BALANCE') return NextResponse.json({ error: 'Insufficient wallet balance' }, { status: 402 })
      if (['ALREADY_SETTLED', 'ALREADY_DECLINED', 'SPLIT_NOT_ACTIVE'].includes(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 409 })
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
