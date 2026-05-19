// Vendor order status webhook — vendors POST status updates from their systems.
// Signature: HMAC-SHA256 over raw body using VENDOR_WEBHOOK_SECRET.
// Header: X-Vendor-Signature: sha256=<hex>

import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { updateOrderStatus } from '@/lib/orders/orders'
import { logger } from '@/lib/logger'
import type { OrderStatus } from '@/lib/services/catalog/types'

export const runtime = 'nodejs'  // needs crypto

const updateSchema = z.object({
  orderId: z.string(),
  status: z.enum(['confirmed', 'shipped', 'delivered', 'cancelled']),
  trackingUrl: z.string().url().optional(),
  vendorOrderReference: z.string().optional(),
})

function verifySignature(payload: string, header: string | null): boolean {
  const secret = process.env.VENDOR_WEBHOOK_SECRET
  if (!secret) return false
  if (!header?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const received = header.slice('sha256='.length)

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  const signature = req.headers.get('X-Vendor-Signature')

  if (!verifySignature(rawBody, signature)) {
    logger.warn('[vendor-webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
  }

  const { orderId, status, trackingUrl } = parsed.data

  const order = await updateOrderStatus(orderId, status as OrderStatus, { trackingUrl })
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  logger.info('[vendor-webhook] Order status updated', { orderId, status })
  return NextResponse.json({ ok: true, orderId, status })
}
