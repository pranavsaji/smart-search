export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockVerifyWebhookSignature = jest.fn()
const mockGetPendingOrder = jest.fn()
const mockUpdateOrderStatus = jest.fn().mockResolvedValue(undefined)
const mockExecuteVendorSplit = jest.fn()
const mockNotifyConfirmation = jest.fn().mockResolvedValue(undefined)
const mockRecordOutcome = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/payments/stripe', () => ({
  verifyWebhookSignature: (...args: unknown[]) => mockVerifyWebhookSignature(...args),
}))

jest.mock('@/lib/checkout/pendingOrder', () => ({
  getPendingOrder: (...args: unknown[]) => mockGetPendingOrder(...args),
  updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
}))

jest.mock('@/lib/checkout/split', () => ({
  executeVendorSplit: (...args: unknown[]) => mockExecuteVendorSplit(...args),
  isDuplicateKeyError: (err: unknown) =>
    typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000,
}))

jest.mock('@/lib/sse/notify', () => ({
  notifyConfirmation: (...args: unknown[]) => mockNotifyConfirmation(...args),
}))

jest.mock('@/lib/intent/graph', () => ({
  recordOutcome: (...args: unknown[]) => mockRecordOutcome(...args),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePendingOrder(overrides = {}) {
  return {
    id: 'order-1',
    stageId: 'stage-1',
    payerId: 'user-1',
    status: 'pending',
    cartSnapshot: {
      items: [
        {
          id: 'item-1',
          activityType: 'flights',
          vendorId: 'vendor-1',
          displayName: 'LHR → CDG',
          isBookable: true,
        },
      ],
    },
    ...overrides,
  }
}

function makeRequest(body: object, sig = 'valid-sig') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: JSON.stringify(body),
  })
}

function makeEvent(type: string, piId = 'pi_test_123', extraFields = {}) {
  return {
    type,
    data: { object: { id: piId, metadata: {}, ...extraFields } },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExecuteVendorSplit.mockResolvedValue([
      { vendorOrderId: 'o1', confirmationCode: 'C1', status: 'confirmed' },
    ])
    mockGetPendingOrder.mockResolvedValue(makePendingOrder())
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    expect(mockVerifyWebhookSignature).not.toHaveBeenCalled()
  })

  it('returns 400 when signature verification fails', async () => {
    mockVerifyWebhookSignature.mockImplementation(() => { throw new Error('Invalid signature') })
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest({}) as never)
    expect(res.status).toBe(400)
  })

  it('processes payment_intent.succeeded and executes vendor split', async () => {
    const event = makeEvent('payment_intent.succeeded')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    expect(res.status).toBe(200)
    expect(mockGetPendingOrder).toHaveBeenCalledWith('pi_test_123')
    expect(mockExecuteVendorSplit).toHaveBeenCalledWith(
      'order-1', 'pi_test_123',
      expect.arrayContaining([expect.objectContaining({ id: 'item-1' })])
    )
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'payment_received')
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'confirmed')
  })

  it('marks order failed when all bookable items fail', async () => {
    mockExecuteVendorSplit.mockResolvedValue([
      { vendorOrderId: '', confirmationCode: '', status: 'failed' },
    ])
    const event = makeEvent('payment_intent.succeeded')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    expect(res.status).toBe(200)
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'failed')
    expect(mockNotifyConfirmation).not.toHaveBeenCalled()
  })

  it('sends SSE confirmation when at least one booking succeeds', async () => {
    const event = makeEvent('payment_intent.succeeded')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    await POST(makeRequest(event) as never)

    expect(mockNotifyConfirmation).toHaveBeenCalledWith(
      'stage-1',
      expect.objectContaining({ orderId: 'order-1' })
    )
  })

  it('returns 200 without executing split when no pending order found', async () => {
    mockGetPendingOrder.mockResolvedValue(null)
    const event = makeEvent('payment_intent.succeeded')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    expect(res.status).toBe(200)
    expect(mockExecuteVendorSplit).not.toHaveBeenCalled()
  })

  it('returns idempotent 200 on duplicate key error from split', async () => {
    mockExecuteVendorSplit.mockRejectedValue({ code: 11000 })
    const event = makeEvent('payment_intent.succeeded')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.idempotent).toBe(true)
  })

  it('marks order failed on payment_intent.payment_failed', async () => {
    const event = makeEvent('payment_intent.payment_failed')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    expect(res.status).toBe(200)
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'failed')
    expect(mockExecuteVendorSplit).not.toHaveBeenCalled()
  })

  it('marks order failed on payment_intent.canceled', async () => {
    const event = makeEvent('payment_intent.canceled')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    expect(res.status).toBe(200)
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'failed')
  })

  it('ignores unrelated event types', async () => {
    const event = makeEvent('customer.subscription.created')
    mockVerifyWebhookSignature.mockReturnValue(event)
    jest.resetModules()
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const res = await POST(makeRequest(event) as never)

    expect(res.status).toBe(200)
    expect(mockExecuteVendorSplit).not.toHaveBeenCalled()
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled()
  })
})
