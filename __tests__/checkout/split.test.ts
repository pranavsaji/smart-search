export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: 'oid' })
const mockCancelPaymentIntent = jest.fn().mockResolvedValue(undefined)
const mockCreateOrder = jest.fn()
const mockGetEnabledByType = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({ insertOne: mockInsertOne }),
  })),
  COLLECTIONS: {
    processedSplits: 'processedSplits',
    orders: 'orders',
  },
}))

jest.mock('@/lib/payments/stripe', () => ({
  cancelPaymentIntent: (...args: unknown[]) => mockCancelPaymentIntent(...args),
}))

jest.mock('@/lib/services/registry', () => ({
  serviceRegistry: {
    getEnabledByType: (...args: unknown[]) => mockGetEnabledByType(...args),
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { executeVendorSplit, isDuplicateKeyError } from '@/lib/checkout/split'
import type { CartItem } from '@/lib/checkout/types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBookableItem(id: string): CartItem {
  return {
    id,
    cardId: `card-${id}`,
    vendorId: `vendor-${id}`,
    vendorType: 'duffel_flight',
    activityType: 'flights',
    amount: 25000,
    currency: 'GBP',
    lockedBy: 'user-1',
    isShared: false,
    bookingPayload: {},
    isBookable: true,
    offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    displayName: `Flight ${id}`,
  }
}

function makeRedirectItem(id: string): CartItem {
  return {
    ...makeBookableItem(id),
    isBookable: false,
    deepLinkUrl: `https://example.com/${id}`,
    displayName: `Restaurant ${id}`,
    activityType: 'restaurants',
    vendorType: 'opentable',
  }
}

// ─── Tests: isDuplicateKeyError ───────────────────────────────────────────────

describe('isDuplicateKeyError', () => {
  it('returns true for MongoDB code 11000', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true)
  })

  it('returns false for other error codes', () => {
    expect(isDuplicateKeyError({ code: 500 })).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isDuplicateKeyError('error string')).toBe(false)
    expect(isDuplicateKeyError(null)).toBe(false)
    expect(isDuplicateKeyError(undefined)).toBe(false)
  })

  it('returns false when code property is absent', () => {
    expect(isDuplicateKeyError({ message: 'no code' })).toBe(false)
  })
})

// ─── Tests: executeVendorSplit ────────────────────────────────────────────────

describe('executeVendorSplit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: adapter found and createOrder succeeds
    mockGetEnabledByType.mockReturnValue({ createOrder: mockCreateOrder })
    mockCreateOrder.mockResolvedValue({
      vendorOrderId: 'order-1',
      confirmationCode: 'ABC123',
      status: 'confirmed',
    })
  })

  it('dispatches createOrder only for bookable items', async () => {
    const bookable = makeBookableItem('b1')
    const redirect = makeRedirectItem('r1')

    await executeVendorSplit('order-id', 'pi_test', [bookable, redirect])

    expect(mockCreateOrder).toHaveBeenCalledTimes(1)
    expect(mockCreateOrder).toHaveBeenCalledWith(bookable)
  })

  it('returns redirect confirmations for non-bookable items with deep links', async () => {
    const redirect = makeRedirectItem('r1')
    const confirmations = await executeVendorSplit('order-id', 'pi_test', [redirect])

    expect(confirmations).toHaveLength(1)
    expect(confirmations[0].status).toBe('confirmed')
    expect(confirmations[0].deepLinkUrl).toBe('https://example.com/r1')
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })

  it('returns failed confirmation when no adapter is found for item type', async () => {
    mockGetEnabledByType.mockReturnValue(null)
    const bookable = makeBookableItem('b1')

    const confirmations = await executeVendorSplit('order-id', 'pi_test', [bookable])

    expect(confirmations[0].status).toBe('failed')
    expect(confirmations[0].errorMessage).toContain('No enabled adapter')
  })

  it('cancels PaymentIntent when ALL bookable items fail', async () => {
    mockCreateOrder.mockResolvedValue({ vendorOrderId: '', confirmationCode: '', status: 'failed' })
    const items = [makeBookableItem('b1'), makeBookableItem('b2')]

    await executeVendorSplit('order-id', 'pi_cancel', items)

    expect(mockCancelPaymentIntent).toHaveBeenCalledWith('pi_cancel')
  })

  it('does NOT cancel PaymentIntent when at least one booking succeeds', async () => {
    mockCreateOrder
      .mockResolvedValueOnce({ vendorOrderId: 'o1', confirmationCode: 'C1', status: 'confirmed' })
      .mockResolvedValueOnce({ vendorOrderId: '', confirmationCode: '', status: 'failed' })

    const items = [makeBookableItem('b1'), makeBookableItem('b2')]
    await executeVendorSplit('order-id', 'pi_partial', items)

    expect(mockCancelPaymentIntent).not.toHaveBeenCalled()
  })

  it('does NOT cancel PaymentIntent when there are no bookable items', async () => {
    const redirect = makeRedirectItem('r1')
    await executeVendorSplit('order-id', 'pi_redirect_only', [redirect])

    expect(mockCancelPaymentIntent).not.toHaveBeenCalled()
  })

  it('returns failed confirmation when createOrder throws', async () => {
    mockCreateOrder.mockRejectedValue(new Error('Duffel API error'))
    const bookable = makeBookableItem('b1')

    const confirmations = await executeVendorSplit('order-id', 'pi_test', [bookable])

    expect(confirmations[0].status).toBe('failed')
  })

  it('persists split record and order record in MongoDB', async () => {
    const bookable = makeBookableItem('b1')
    await executeVendorSplit('po-1', 'pi_persist', [bookable])

    // Two insertOne calls: processedSplits + orders
    expect(mockInsertOne).toHaveBeenCalledTimes(2)
  })

  it('includes both bookable and redirect confirmations in the final result', async () => {
    const bookable = makeBookableItem('b1')
    const redirect = makeRedirectItem('r1')

    const confirmations = await executeVendorSplit('order-id', 'pi_test', [bookable, redirect])

    expect(confirmations).toHaveLength(2)
    const statuses = confirmations.map(c => c.status)
    expect(statuses).toContain('confirmed') // bookable
    expect(statuses.filter(s => s === 'confirmed')).toHaveLength(2) // redirect also confirmed
  })
})
