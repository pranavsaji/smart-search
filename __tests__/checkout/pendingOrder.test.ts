export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: 'oid' })
const mockFindOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({ insertOne: mockInsertOne, findOne: mockFindOne }),
  })),
  COLLECTIONS: {
    pendingOrders: 'pendingOrders',
    stageCarts: 'stageCarts',
  },
}))

jest.mock('nanoid', () => ({ nanoid: () => 'test-nanoid-id' }))

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { createPendingOrder, getPendingOrder } from '@/lib/checkout/pendingOrder'
import type { StageCart, CartItem } from '@/lib/checkout/types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    cardId: 'card-1',
    vendorId: 'vendor-1',
    vendorType: 'duffel_flight',
    activityType: 'flights',
    amount: 25000,
    currency: 'GBP',
    lockedBy: 'user-1',
    isShared: false,
    bookingPayload: {},
    isBookable: true,
    offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
    displayName: 'LHR → CDG',
    ...overrides,
  }
}

function makeCart(overrides: Partial<StageCart> = {}): StageCart {
  return {
    stageId: 'stage-1',
    participants: ['user-1'],
    items: [makeCartItem()],
    status: 'building',
    paymentMode: 'one_pays_all',
    initiatorId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createPendingOrder', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a PendingOrder and persists it', async () => {
    const cart = makeCart()
    const order = await createPendingOrder(cart, 'user-1', 'pi_test_123')

    expect(order.id).toBe('test-nanoid-id')
    expect(order.stageId).toBe('stage-1')
    expect(order.payerId).toBe('user-1')
    expect(order.stripePaymentIntentId).toBe('pi_test_123')
    expect(order.status).toBe('pending')
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
  })

  it('calculates totalAmount as sum of item amounts', async () => {
    const cart = makeCart({
      items: [
        makeCartItem({ amount: 25000, currency: 'GBP' }),
        makeCartItem({ id: 'item-2', amount: 12000, currency: 'GBP' }),
      ],
    })
    const order = await createPendingOrder(cart, 'user-1', 'pi_test')
    expect(order.totalAmount).toBe(37000)
    expect(order.currency).toBe('GBP')
  })

  it('uses currency from first item', async () => {
    const cart = makeCart({ items: [makeCartItem({ currency: 'EUR' })] })
    const order = await createPendingOrder(cart, 'user-1', 'pi_test')
    expect(order.currency).toBe('EUR')
  })

  it('throws on invalid paymentMode', async () => {
    const cart = makeCart({ paymentMode: 'invalid_mode' as never })
    await expect(createPendingOrder(cart, 'user-1', 'pi_test')).rejects.toThrow('Invalid paymentMode')
  })

  it('throws OFFER_EXPIRED when an item expires within 60 seconds', async () => {
    const expiredItem = makeCartItem({
      id: 'item-expired',
      offerExpiresAt: new Date(Date.now() + 30_000), // 30s — within 60s threshold
    })
    const cart = makeCart({ items: [expiredItem] })
    await expect(createPendingOrder(cart, 'user-1', 'pi_test'))
      .rejects.toThrow('OFFER_EXPIRED:item-expired')
  })

  it('does not throw when items have plenty of time remaining', async () => {
    const cart = makeCart({
      items: [makeCartItem({ offerExpiresAt: new Date(Date.now() + 20 * 60 * 1000) })],
    })
    await expect(createPendingOrder(cart, 'user-1', 'pi_test')).resolves.toBeDefined()
  })

  it('uses the earliest item expiry for the order expiry', async () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000)   // 5 min
    const later = new Date(Date.now() + 20 * 60 * 1000) // 20 min
    const cart = makeCart({
      items: [
        makeCartItem({ id: 'i1', offerExpiresAt: later }),
        makeCartItem({ id: 'i2', offerExpiresAt: soon }),
      ],
    })
    const order = await createPendingOrder(cart, 'user-1', 'pi_test')
    // Allow 1s tolerance for test execution time
    expect(order.expiresAt.getTime()).toBeLessThanOrEqual(soon.getTime() + 1000)
    expect(order.expiresAt.getTime()).toBeGreaterThanOrEqual(soon.getTime() - 1000)
  })
})

describe('getPendingOrder', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns the order when found', async () => {
    const fakeOrder = { id: 'test-nanoid-id', stripePaymentIntentId: 'pi_abc' }
    mockFindOne.mockResolvedValue(fakeOrder)
    const result = await getPendingOrder('pi_abc')
    expect(result).toEqual(fakeOrder)
    expect(mockFindOne).toHaveBeenCalledWith({ stripePaymentIntentId: 'pi_abc' })
  })

  it('returns null when not found', async () => {
    mockFindOne.mockResolvedValue(null)
    const result = await getPendingOrder('pi_unknown')
    expect(result).toBeNull()
  })
})
