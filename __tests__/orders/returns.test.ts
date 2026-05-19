export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetOrderById = jest.fn()
const mockUpdateOrderStatus = jest.fn()
const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockFind = jest.fn()
const mockStripeRefundsCreate = jest.fn()

jest.mock('@/lib/orders/orders', () => ({
  getOrderById: (...a: unknown[]) => mockGetOrderById(...a),
  updateOrderStatus: (...a: unknown[]) => mockUpdateOrderStatus(...a),
}))

jest.mock('@/lib/payments/stripe', () => ({
  getStripe: () => ({ refunds: { create: mockStripeRefundsCreate } }),
}))

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      findOneAndUpdate: mockFindOneAndUpdate,
      find: mockFind,
    }),
  })),
  COLLECTIONS: { returnRequests: 'return_requests' },
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('nanoid', () => ({ nanoid: () => 'RETID12345' }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { initiateReturn, processReturn, isWithinReturnWindow, RETURN_WINDOW_DAYS } from '@/lib/orders/returns'
import type { VendorOrder } from '@/lib/orders/orders'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<VendorOrder> = {}): VendorOrder {
  return {
    orderId: 'ORD-TEST1',
    userId: 'user-1',
    vendorId: 'techpro-uk',
    items: [],
    totalAmount: 24999,
    currency: 'GBP',
    status: 'delivered',
    paymentIntentId: 'pi_test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ─── isWithinReturnWindow() ───────────────────────────────────────────────────

describe('isWithinReturnWindow()', () => {
  it('returns true when within 14 days', () => {
    const order = { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }
    expect(isWithinReturnWindow(order)).toBe(true)
  })

  it('returns false when beyond 14 days', () => {
    const order = { createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) }
    expect(isWithinReturnWindow(order)).toBe(false)
  })

  it('returns false exactly at the boundary (15 days out)', () => {
    const order = { createdAt: new Date(Date.now() - (RETURN_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000) }
    expect(isWithinReturnWindow(order)).toBe(false)
  })

  it('returns true for order created just now', () => {
    expect(isWithinReturnWindow({ createdAt: new Date() })).toBe(true)
  })
})

// ─── initiateReturn() ─────────────────────────────────────────────────────────

describe('initiateReturn()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a return request for an eligible order', async () => {
    mockGetOrderById.mockResolvedValue(makeOrder())
    mockFindOne.mockResolvedValue(null) // no existing return
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })

    const ret = await initiateReturn({ orderId: 'ORD-TEST1', userId: 'user-1', reason: 'Item is defective' })
    expect(ret.returnId).toMatch(/^RET-/)
    expect(ret.status).toBe('requested')
    expect(ret.orderId).toBe('ORD-TEST1')
  })

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    mockGetOrderById.mockResolvedValue(null)
    await expect(initiateReturn({ orderId: 'NOPE', userId: 'user-1', reason: 'defect' }))
      .rejects.toThrow('ORDER_NOT_FOUND')
  })

  it('throws FORBIDDEN when userId does not match order', async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({ userId: 'user-99' }))
    await expect(initiateReturn({ orderId: 'ORD-TEST1', userId: 'user-1', reason: 'defect' }))
      .rejects.toThrow('FORBIDDEN')
  })

  it('throws RETURN_INVALID_STATUS for pending orders', async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({ status: 'pending' }))
    await expect(initiateReturn({ orderId: 'ORD-TEST1', userId: 'user-1', reason: 'defect' }))
      .rejects.toThrow('RETURN_INVALID_STATUS')
  })

  it('throws RETURN_WINDOW_EXPIRED for orders older than 14 days', async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    }))
    await expect(initiateReturn({ orderId: 'ORD-TEST1', userId: 'user-1', reason: 'defect' }))
      .rejects.toThrow('RETURN_WINDOW_EXPIRED')
  })

  it('throws RETURN_ALREADY_REQUESTED when one is in flight', async () => {
    mockGetOrderById.mockResolvedValue(makeOrder())
    mockFindOne.mockResolvedValue({ returnId: 'RET-EXISTING', status: 'requested' }) // existing
    await expect(initiateReturn({ orderId: 'ORD-TEST1', userId: 'user-1', reason: 'defect' }))
      .rejects.toThrow('RETURN_ALREADY_REQUESTED')
  })
})

// ─── processReturn() ──────────────────────────────────────────────────────────

describe('processReturn() — vendor approves', () => {
  beforeEach(() => jest.clearAllMocks())

  it('issues Stripe refund and marks return as refunded', async () => {
    mockFindOne.mockResolvedValue({
      returnId: 'RET-1',
      orderId: 'ORD-TEST1',
      userId: 'user-1',
      vendorId: 'techpro-uk',
      reason: 'defect',
      status: 'requested',
    })
    mockGetOrderById.mockResolvedValue(makeOrder())
    mockStripeRefundsCreate.mockResolvedValue({ id: 'ref_123' })
    mockFindOneAndUpdate.mockResolvedValue({ returnId: 'RET-1', status: 'refunded', stripeRefundId: 'ref_123' })
    mockUpdateOrderStatus.mockResolvedValue({ orderId: 'ORD-TEST1', status: 'returned' })

    const result = await processReturn('RET-1', 'techpro-uk', 'approve')
    expect(result.status).toBe('refunded')
    expect(mockStripeRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test', reason: 'requested_by_customer' })
    )
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith('ORD-TEST1', 'returned')
  })

  it('throws RETURN_NOT_FOUND when returnId does not exist', async () => {
    mockFindOne.mockResolvedValue(null)
    await expect(processReturn('NOPE', 'techpro-uk', 'approve')).rejects.toThrow('RETURN_NOT_FOUND')
  })

  it('throws FORBIDDEN when vendorId does not match', async () => {
    mockFindOne.mockResolvedValue({ returnId: 'RET-1', vendorId: 'other-vendor', status: 'requested' })
    await expect(processReturn('RET-1', 'techpro-uk', 'approve')).rejects.toThrow('FORBIDDEN')
  })

  it('throws RETURN_INVALID_STATUS for already-processed returns', async () => {
    mockFindOne.mockResolvedValue({ returnId: 'RET-1', vendorId: 'techpro-uk', status: 'refunded' })
    await expect(processReturn('RET-1', 'techpro-uk', 'approve')).rejects.toThrow('RETURN_INVALID_STATUS')
  })

  it('throws REFUND_FAILED when Stripe refund errors', async () => {
    mockFindOne.mockResolvedValue({ returnId: 'RET-1', vendorId: 'techpro-uk', orderId: 'ORD-TEST1', status: 'requested' })
    mockGetOrderById.mockResolvedValue(makeOrder())
    mockStripeRefundsCreate.mockRejectedValue(new Error('Stripe error'))
    await expect(processReturn('RET-1', 'techpro-uk', 'approve')).rejects.toThrow('REFUND_FAILED')
  })
})

describe('processReturn() — vendor rejects', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects the return without calling Stripe', async () => {
    mockFindOne.mockResolvedValue({ returnId: 'RET-1', vendorId: 'techpro-uk', orderId: 'ORD-TEST1', status: 'requested' })
    const rejected = { returnId: 'RET-1', status: 'rejected' }
    mockFindOneAndUpdate.mockResolvedValue(rejected)

    const result = await processReturn('RET-1', 'techpro-uk', 'reject')
    expect(result.status).toBe('rejected')
    expect(mockStripeRefundsCreate).not.toHaveBeenCalled()
    expect(mockGetOrderById).not.toHaveBeenCalled()
  })
})
