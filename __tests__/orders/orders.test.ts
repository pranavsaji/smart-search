export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockFind = jest.fn()
const mockFindOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOneAndUpdate: mockFindOneAndUpdate,
      find: mockFind,
      findOne: mockFindOne,
    }),
  })),
  COLLECTIONS: { vendorOrders: 'vendor_orders' },
}))

jest.mock('@/lib/sse/notify', () => ({
  notifyOrderUpdate: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('nanoid', () => ({ nanoid: () => 'TESTID1234' }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  createVendorOrder,
  updateOrderStatus,
  getUserOrders,
  getOrderById,
  getVendorOrders,
  orderBelongsToUser,
  orderBelongsToVendor,
} from '@/lib/orders/orders'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrderInput() {
  return {
    userId: 'user-1',
    vendorId: 'techpro-uk',
    items: [{
      productId: 'prod-1',
      vendorId: 'techpro-uk',
      title: 'Earbuds',
      price: 24999,
      currency: 'GBP',
      quantity: 1,
    }],
    totalAmount: 24999,
    currency: 'GBP',
    paymentIntentId: 'pi_test_123',
  }
}

// ─── createVendorOrder() ──────────────────────────────────────────────────────

describe('createVendorOrder()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates an order with pending status', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const order = await createVendorOrder(makeOrderInput())
    expect(order.status).toBe('pending')
    expect(order.userId).toBe('user-1')
    expect(order.vendorId).toBe('techpro-uk')
    expect(order.totalAmount).toBe(24999)
  })

  it('generates a human-readable orderId', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const order = await createVendorOrder(makeOrderInput())
    expect(order.orderId).toMatch(/^ORD-[A-Z0-9]+$/)
  })

  it('persists the paymentIntentId for idempotency', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const order = await createVendorOrder(makeOrderInput())
    expect(order.paymentIntentId).toBe('pi_test_123')
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: 'pi_test_123' })
    )
  })
})

// ─── updateOrderStatus() ──────────────────────────────────────────────────────

describe('updateOrderStatus()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates status and returns updated order', async () => {
    const updated = { orderId: 'ORD-1', userId: 'user-1', status: 'shipped' }
    mockFindOneAndUpdate.mockResolvedValue(updated)
    const result = await updateOrderStatus('ORD-1', 'shipped')
    expect(result?.status).toBe('shipped')
  })

  it('returns null when order not found', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)
    const result = await updateOrderStatus('NOPE', 'shipped')
    expect(result).toBeNull()
  })

  it('includes trackingUrl in update when provided', async () => {
    const updated = { orderId: 'ORD-1', userId: 'user-1', status: 'shipped', trackingUrl: 'https://track.it/123' }
    mockFindOneAndUpdate.mockResolvedValue(updated)
    await updateOrderStatus('ORD-1', 'shipped', { trackingUrl: 'https://track.it/123' })
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { orderId: 'ORD-1' },
      expect.objectContaining({ $set: expect.objectContaining({ trackingUrl: 'https://track.it/123' }) }),
      expect.any(Object)
    )
  })

  it('broadcasts SSE order_update event on status change', async () => {
    const { notifyOrderUpdate } = await import('@/lib/sse/notify')
    mockFindOneAndUpdate.mockResolvedValue({ orderId: 'ORD-1', userId: 'user-1', status: 'delivered' })
    await updateOrderStatus('ORD-1', 'delivered')
    expect(notifyOrderUpdate).toHaveBeenCalledWith('user-1', 'ORD-1', 'delivered', undefined)
  })
})

// ─── getUserOrders() ──────────────────────────────────────────────────────────

describe('getUserOrders()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns orders sorted by createdAt desc', async () => {
    const rows = [{ orderId: 'ORD-2', status: 'shipped' }, { orderId: 'ORD-1', status: 'delivered' }]
    const mockToArray = jest.fn().mockResolvedValue(rows)
    const mockLimit = jest.fn().mockReturnValue({ toArray: mockToArray })
    const mockSort = jest.fn().mockReturnValue({ limit: mockLimit })
    mockFind.mockReturnValue({ sort: mockSort })

    const orders = await getUserOrders('user-1')
    expect(orders).toHaveLength(2)
    expect(mockFind).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(mockLimit).toHaveBeenCalledWith(100)
  })
})

// ─── getVendorOrders() ────────────────────────────────────────────────────────

describe('getVendorOrders()', () => {
  beforeEach(() => jest.clearAllMocks())

  function makeCursorMock(rows: unknown[] = []) {
    const mockToArray = jest.fn().mockResolvedValue(rows)
    const mockLimit = jest.fn().mockReturnValue({ toArray: mockToArray })
    const mockSort = jest.fn().mockReturnValue({ limit: mockLimit })
    return { sort: mockSort, limit: mockLimit, toArray: mockToArray }
  }

  it('filters by vendorId only when no status given', async () => {
    mockFind.mockReturnValue(makeCursorMock())
    await getVendorOrders('techpro-uk')
    expect(mockFind).toHaveBeenCalledWith({ vendorId: 'techpro-uk' })
  })

  it('filters by both vendorId and status', async () => {
    mockFind.mockReturnValue(makeCursorMock())
    await getVendorOrders('techpro-uk', 'pending')
    expect(mockFind).toHaveBeenCalledWith({ vendorId: 'techpro-uk', status: 'pending' })
  })
})

// ─── Ownership guards ─────────────────────────────────────────────────────────

describe('orderBelongsToUser()', () => {
  const order = { orderId: 'ORD-1', userId: 'user-1', vendorId: 'v1' } as Parameters<typeof orderBelongsToUser>[0]

  it('returns true when userId matches', () => {
    expect(orderBelongsToUser(order, 'user-1')).toBe(true)
  })

  it('returns false when userId differs', () => {
    expect(orderBelongsToUser(order, 'user-999')).toBe(false)
  })
})

describe('orderBelongsToVendor()', () => {
  const order = { orderId: 'ORD-1', userId: 'user-1', vendorId: 'techpro-uk' } as Parameters<typeof orderBelongsToVendor>[0]

  it('returns true when vendorId matches', () => {
    expect(orderBelongsToVendor(order, 'techpro-uk')).toBe(true)
  })

  it('returns false when vendorId differs', () => {
    expect(orderBelongsToVendor(order, 'other-vendor')).toBe(false)
  })
})
