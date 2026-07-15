import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/auth'
import {
  getVendorSubscription,
  getVendorPlatformFeePercent,
  upgradeVendorSubscription,
} from '@/lib/wallet/subscriptions'
import type { VendorTier } from '@/lib/wallet/types'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireUserId()
    const { searchParams } = new URL(req.url)
    const vendorId = searchParams.get('vendorId')
    if (!vendorId) return NextResponse.json({ error: 'vendorId required' }, { status: 400 })

    const [subscription, platformFeePercent] = await Promise.all([
      getVendorSubscription(vendorId),
      getVendorPlatformFeePercent(vendorId),
    ])
    return NextResponse.json({ subscription, platformFeePercent })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireUserId()
    const body = await req.json() as {
      vendorId?: string
      tier?: VendorTier
      stripeCustomerId?: string
      paymentMethodId?: string
    }

    if (!body.vendorId || !body.tier || !body.stripeCustomerId || !body.paymentMethodId) {
      return NextResponse.json({ error: 'vendorId, tier, stripeCustomerId, paymentMethodId required' }, { status: 400 })
    }
    if (body.tier === 'basic') {
      return NextResponse.json({ error: 'Basic tier is free — no subscription needed' }, { status: 400 })
    }

    const sub = await upgradeVendorSubscription({
      vendorId: body.vendorId,
      tier: body.tier as Exclude<VendorTier, 'basic'>,
      stripeCustomerId: body.stripeCustomerId,
      paymentMethodId: body.paymentMethodId,
    })
    return NextResponse.json(sub, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ((err as { code?: string }).code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (err.message.includes('not configured')) return NextResponse.json({ error: 'Subscription tier not configured' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
