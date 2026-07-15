import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import {
  getUserSubscription,
  isUserPro,
  createProSubscription,
  cancelProSubscription,
} from '@/lib/wallet/subscriptions'

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const userId = await requireUserId()
    const [subscription, pro] = await Promise.all([
      getUserSubscription(userId),
      isUserPro(userId),
    ])
    return NextResponse.json({ subscription, isPro: pro })
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
      action?: string
      stripeCustomerId?: string
      paymentMethodId?: string
    }

    if (body.action === 'cancel') {
      const sub = await cancelProSubscription(userId)
      return NextResponse.json(sub)
    }

    if (!body.stripeCustomerId || !body.paymentMethodId) {
      return NextResponse.json({ error: 'stripeCustomerId and paymentMethodId required' }, { status: 400 })
    }

    const sub = await createProSubscription({
      userId,
      stripeCustomerId: body.stripeCustomerId,
      paymentMethodId: body.paymentMethodId,
    })
    return NextResponse.json(sub, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ((err as { code?: string }).code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (err.message === 'NO_ACTIVE_SUBSCRIPTION') return NextResponse.json({ error: 'No active subscription' }, { status: 404 })
      if (err.message.includes('not configured')) return NextResponse.json({ error: 'Subscription not configured on this server' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
