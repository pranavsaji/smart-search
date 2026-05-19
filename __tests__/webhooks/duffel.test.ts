/**
 * Duffel webhook handler — unit tests.
 * MongoDB and SSE broadcast are mocked; signature verification is tested in isolation.
 */
export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockBroadcastToStage = jest.fn()
const mockNotifyOfferExpired = jest.fn()
const mockFindOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({ findOne: mockFindOne }),
  })),
  COLLECTIONS: {
    orders: 'orders',
    pendingOrders: 'pendingOrders',
  },
}))

jest.mock('@/lib/sse/broadcast', () => ({
  broadcastToStage: (...args: unknown[]) => mockBroadcastToStage(...args),
}))

jest.mock('@/lib/sse/notify', () => ({
  notifyOfferExpired: (...args: unknown[]) => mockNotifyOfferExpired(...args),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildSignedRequest(
  secret: string,
  body: object,
  options?: { badSig?: boolean }
): Promise<Request> {
  const payload = JSON.stringify(body)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sig = 'sha256=' + Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return new Request('http://localhost/api/webhooks/duffel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Duffel-Signature': options?.badSig ? 'sha256=badbadbadbad' : sig,
    },
    body: payload,
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/duffel', () => {
  const SECRET = 'test-webhook-secret-12345'

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.DUFFEL_WEBHOOK_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.DUFFEL_WEBHOOK_SECRET
  })

  it('returns 400 for invalid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/duffel/route')
    const req = await buildSignedRequest(SECRET, { type: 'order.cancellation.confirmed', data: { object: { order_id: 'ord_1' } } }, { badSig: true })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    expect(mockBroadcastToStage).not.toHaveBeenCalled()
  })

  it('returns 500 when DUFFEL_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.DUFFEL_WEBHOOK_SECRET
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/duffel/route')
    const req = new Request('http://localhost/api/webhooks/duffel', { method: 'POST', body: '{}' })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
  })

  it('broadcasts offer_expired for order.cancellation.confirmed', async () => {
    // Lookup returns a matching stageId
    mockFindOne
      .mockResolvedValueOnce({ pendingOrderId: 'poid_1' })   // orders lookup
      .mockResolvedValueOnce({ stageId: 'stage-abc' })        // pendingOrders lookup

    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/duffel/route')

    const body = {
      type: 'order.cancellation.confirmed',
      data: { object: { order_id: 'ord_1' } },
    }
    const req = await buildSignedRequest(SECRET, body)
    const res = await POST(req as never)

    expect(res.status).toBe(200)
    expect(mockBroadcastToStage).toHaveBeenCalledWith(
      'stage-abc',
      'offer_expired',
      expect.objectContaining({ cardId: 'ord_1', reason: 'airline_cancellation' })
    )
  })

  it('broadcasts checkout_update for order.airline_initiated_change', async () => {
    mockFindOne
      .mockResolvedValueOnce({ pendingOrderId: 'poid_2' })
      .mockResolvedValueOnce({ stageId: 'stage-xyz' })

    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/duffel/route')

    const body = {
      type: 'order.airline_initiated_change',
      data: { object: { order_id: 'ord_2', change_type: 'schedule_change' } },
    }
    const req = await buildSignedRequest(SECRET, body)
    const res = await POST(req as never)

    expect(res.status).toBe(200)
    expect(mockBroadcastToStage).toHaveBeenCalledWith(
      'stage-xyz',
      'checkout_update',
      expect.objectContaining({ type: 'airline_initiated_change', orderId: 'ord_2' })
    )
  })

  it('returns 200 without broadcasting when order is not found in platform', async () => {
    mockFindOne.mockResolvedValue(null)

    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/duffel/route')

    const body = {
      type: 'order.cancellation.confirmed',
      data: { object: { order_id: 'ord_unknown' } },
    }
    const req = await buildSignedRequest(SECRET, body)
    const res = await POST(req as never)

    expect(res.status).toBe(200)
    expect(mockBroadcastToStage).not.toHaveBeenCalled()
  })
})
