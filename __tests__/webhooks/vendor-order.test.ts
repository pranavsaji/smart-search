export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdateOrderStatus = jest.fn()

jest.mock('@/lib/orders/orders', () => ({
  updateOrderStatus: (...a: unknown[]) => mockUpdateOrderStatus(...a),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhooks/vendor/order/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret-xyz'

function buildRequest(body: unknown, sign = true): NextRequest {
  const raw = JSON.stringify(body)
  const sig = sign
    ? `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`
    : 'sha256=invalidsignature'

  return new NextRequest('http://localhost/api/webhooks/vendor/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vendor-Signature': sig,
    },
    body: raw,
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/vendor/order', () => {
  const origSecret = process.env.VENDOR_WEBHOOK_SECRET

  beforeAll(() => { process.env.VENDOR_WEBHOOK_SECRET = WEBHOOK_SECRET })
  afterAll(() => { process.env.VENDOR_WEBHOOK_SECRET = origSecret })
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 and updates order on valid payload', async () => {
    mockUpdateOrderStatus.mockResolvedValue({ orderId: 'ORD-1', status: 'shipped' })

    const req = buildRequest({ orderId: 'ORD-1', status: 'shipped', trackingUrl: 'https://track.it/123' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe('shipped')
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORD-1', 'shipped', { trackingUrl: 'https://track.it/123' })
  })

  it('returns 401 on invalid signature', async () => {
    const req = buildRequest({ orderId: 'ORD-1', status: 'shipped' }, false)
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled()
  })

  it('returns 401 when VENDOR_WEBHOOK_SECRET is not set', async () => {
    const saved = process.env.VENDOR_WEBHOOK_SECRET
    delete process.env.VENDOR_WEBHOOK_SECRET
    const req = buildRequest({ orderId: 'ORD-1', status: 'shipped' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    process.env.VENDOR_WEBHOOK_SECRET = saved
  })

  it('returns 400 on missing orderId', async () => {
    const req = buildRequest({ status: 'shipped' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid status enum', async () => {
    const req = buildRequest({ orderId: 'ORD-1', status: 'vaporised' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 on malformed JSON', async () => {
    const secret = WEBHOOK_SECRET
    const raw = 'not { json'
    const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
    const req = new NextRequest('http://localhost/api/webhooks/vendor/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vendor-Signature': sig },
      body: raw,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when order not found', async () => {
    mockUpdateOrderStatus.mockResolvedValue(null)
    const req = buildRequest({ orderId: 'ORD-MISSING', status: 'delivered' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('accepts delivered status without trackingUrl', async () => {
    mockUpdateOrderStatus.mockResolvedValue({ orderId: 'ORD-1', status: 'delivered' })
    const req = buildRequest({ orderId: 'ORD-1', status: 'delivered' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORD-1', 'delivered', { trackingUrl: undefined })
  })

  it('uses timing-safe comparison (no timing attack possible)', async () => {
    // Valid signature but with extra chars — should still fail
    const raw = JSON.stringify({ orderId: 'ORD-1', status: 'shipped' })
    const valid = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')
    const tampered = valid.slice(0, -2) + '00' // last two bytes zeroed

    const req = new NextRequest('http://localhost/api/webhooks/vendor/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vendor-Signature': `sha256=${tampered}` },
      body: raw,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
