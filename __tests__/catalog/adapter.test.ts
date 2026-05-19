export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSearchProducts = jest.fn()
const mockGetProductById = jest.fn()
const mockDecrementStock = jest.fn()
const mockRestoreStock = jest.fn()
const mockCreateVendorOrder = jest.fn()
const mockGetVendorById = jest.fn()
const mockStripeTransfers = { create: jest.fn() }

jest.mock('@/lib/vendor/portal', () => ({
  searchProducts: (...a: unknown[]) => mockSearchProducts(...a),
  getProductById: (...a: unknown[]) => mockGetProductById(...a),
  decrementStock: (...a: unknown[]) => mockDecrementStock(...a),
  restoreStock: (...a: unknown[]) => mockRestoreStock(...a),
  getVendorById: (...a: unknown[]) => mockGetVendorById(...a),
}))

jest.mock('@/lib/orders/orders', () => ({
  createVendorOrder: (...a: unknown[]) => mockCreateVendorOrder(...a),
}))

jest.mock('@/lib/payments/stripe', () => ({
  getStripe: () => ({ transfers: mockStripeTransfers }),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { CatalogAdapter } from '@/lib/services/catalog/adapter'
import type { CartItem } from '@/lib/checkout/types'
import type { SearchContext } from '@/lib/intent/types'
import type { Product } from '@/lib/services/catalog/types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function mockProduct(overrides: Partial<Product> = {}): Product {
  return {
    productId: 'earbuds-abc123',
    vendorId: 'techpro-uk',
    title: 'Premium Wireless Earbuds',
    description: 'Active noise cancellation',
    price: 24999,
    currency: 'GBP',
    stock: 10,
    imageUrls: ['https://example.com/img.jpg'],
    category: 'audio',
    tags: ['earbuds', 'wireless'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function mockCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    cardId: 'cat-earbuds-abc123',
    vendorId: 'techpro-uk',
    vendorType: 'catalog_product',
    activityType: 'products',
    amount: 24999,
    currency: 'GBP',
    lockedBy: 'user-1',
    isShared: false,
    isBookable: true,
    bookingPayload: {
      productId: 'earbuds-abc123',
      vendorId: 'techpro-uk',
      quantity: 1,
      title: 'Premium Wireless Earbuds',
      unitPrice: 24999,
    },
    offerExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    displayName: 'Premium Wireless Earbuds',
    ...overrides,
  }
}

function mockSearchContext(overrides: Partial<SearchContext['intent']> = {}): SearchContext {
  return {
    intent: {
      destination: 'UNKNOWN',
      dates: { start: '2026-06-01', end: '2026-06-03' },
      participants: [],
      groupSize: 1,
      activityTypes: ['products'],
      budgetSignal: 'mid-range',
      rawPrompt: 'find me some wireless earbuds',
      confidence: 0.9,
      ...overrides,
    },
    graph: {
      userId: 'user-1',
      destinations: [],
      spendingSignal: 'mid-range',
      activityPreferences: {} as Record<import('@/lib/intent/types').ActivityType, number>,
      travelStyle: 'solo',
      seasonalPatterns: [],
      outcomeHistory: [],
      updatedAt: new Date(),
    },
    stageId: 'stage-1',
  }
}

// ─── Adapter metadata ─────────────────────────────────────────────────────────

describe('CatalogAdapter — metadata', () => {
  const adapter = new CatalogAdapter()

  it('has correct id and type', () => {
    expect(adapter.id).toBe('catalog_products')
    expect(adapter.type).toBe('products')
  })

  it('is enabled in dev mode', () => {
    const orig = process.env.APP_MODE
    process.env.APP_MODE = 'dev'
    expect(adapter.isEnabled()).toBe(true)
    process.env.APP_MODE = orig
  })

  it('requires VENDOR_PORTAL_ENABLED in prod mode', () => {
    const origMode = process.env.APP_MODE
    const origFlag = process.env.VENDOR_PORTAL_ENABLED
    process.env.APP_MODE = 'prod'
    process.env.VENDOR_PORTAL_ENABLED = 'false'
    expect(adapter.isEnabled()).toBe(false)
    process.env.VENDOR_PORTAL_ENABLED = 'true'
    expect(adapter.isEnabled()).toBe(true)
    process.env.APP_MODE = origMode
    process.env.VENDOR_PORTAL_ENABLED = origFlag
  })
})

// ─── search() ────────────────────────────────────────────────────────────────

describe('CatalogAdapter — search()', () => {
  const adapter = new CatalogAdapter()

  beforeEach(() => jest.clearAllMocks())

  it('returns catalog cards when products found', async () => {
    mockSearchProducts.mockResolvedValue([mockProduct()])
    const result = await adapter.search(mockSearchContext())
    expect(result.isAvailable).toBe(true)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].vendorType).toBe('catalog_product')
    expect(result.cards[0].isBookable).toBe(true)
  })

  it('returns mock cards when no products found', async () => {
    mockSearchProducts.mockResolvedValue([])
    const result = await adapter.search(mockSearchContext())
    expect(result.isAvailable).toBe(true)
    expect(result.cards.length).toBeGreaterThan(0)
    expect(result.cards[0].isBookable).toBe(true)
  })

  it('falls back to mock on search error', async () => {
    mockSearchProducts.mockRejectedValue(new Error('MongoDB timeout'))
    const result = await adapter.search(mockSearchContext())
    expect(result.isAvailable).toBe(true)
    expect(result.cards.length).toBeGreaterThan(0)
  })

  it('marks out-of-stock products as not bookable', async () => {
    mockSearchProducts.mockResolvedValue([mockProduct({ stock: 0 })])
    const result = await adapter.search(mockSearchContext())
    expect(result.cards[0].isBookable).toBe(false)
    expect(result.cards[0].ctaLabel).toBe('Out of Stock')
  })

  it('maps price correctly to minor units', async () => {
    mockSearchProducts.mockResolvedValue([mockProduct({ price: 24999, currency: 'GBP' })])
    const result = await adapter.search(mockSearchContext())
    expect(result.cards[0].price?.amount).toBe(24999)
    expect(result.cards[0].price?.currency).toBe('GBP')
    expect(result.cards[0].price?.displayText).toContain('249.99')
  })

  it('sets 30-minute offer expiry', async () => {
    mockSearchProducts.mockResolvedValue([mockProduct()])
    const before = Date.now()
    const result = await adapter.search(mockSearchContext())
    const expiry = result.cards[0].offerExpiresAt!.getTime()
    expect(expiry).toBeGreaterThan(before + 29 * 60 * 1000)
    expect(expiry).toBeLessThan(before + 31 * 60 * 1000)
  })

  it('truncates long titles to 80 chars', async () => {
    const longTitle = 'A'.repeat(100)
    mockSearchProducts.mockResolvedValue([mockProduct({ title: longTitle })])
    const result = await adapter.search(mockSearchContext())
    expect(result.cards[0].displayName.length).toBeLessThanOrEqual(80)
    expect(result.cards[0].displayName.endsWith('…')).toBe(true)
  })

  it('uses premium mock cards for premium budget signal', async () => {
    mockSearchProducts.mockResolvedValue([])
    const result = await adapter.search(mockSearchContext({ budgetSignal: 'premium' }))
    expect(result.cards[0].price!.amount).toBeGreaterThan(20000)
  })
})

// ─── createOrder() — success path ─────────────────────────────────────────────

describe('CatalogAdapter — createOrder() success', () => {
  const adapter = new CatalogAdapter()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetProductById.mockResolvedValue(mockProduct())
    mockDecrementStock.mockResolvedValue(true)
    mockCreateVendorOrder.mockResolvedValue({ orderId: 'ORD-ABC1234567' })
    mockGetVendorById.mockResolvedValue(null) // no Stripe payout without Connect ID
  })

  it('returns confirmed status on success', async () => {
    const result = await adapter.createOrder(mockCartItem())
    expect(result.status).toBe('confirmed')
    expect(result.vendorOrderId).toBe('ORD-ABC1234567')
    expect(result.confirmationCode).toBe('ORD-ABC1234567')
  })

  it('calls decrementStock with correct productId and quantity', async () => {
    await adapter.createOrder(mockCartItem())
    expect(mockDecrementStock).toHaveBeenCalledWith('earbuds-abc123', 1)
  })

  it('passes shipping address to createVendorOrder', async () => {
    const address = { line1: '1 High St', city: 'London', postalCode: 'SW1A 1AA', country: 'GB' }
    await adapter.createOrder(mockCartItem(), address)
    expect(mockCreateVendorOrder).toHaveBeenCalledWith(
      expect.objectContaining({ shippingAddress: expect.objectContaining({ line1: '1 High St' }) })
    )
  })
})

// ─── createOrder() — failure paths ───────────────────────────────────────────

describe('CatalogAdapter — createOrder() failures', () => {
  const adapter = new CatalogAdapter()

  beforeEach(() => jest.clearAllMocks())

  it('fails when bookingPayload is missing productId', async () => {
    const item = mockCartItem({ bookingPayload: {} })
    const result = await adapter.createOrder(item)
    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/Missing product payload/)
  })

  it('fails when product not found', async () => {
    mockGetProductById.mockResolvedValue(null)
    const result = await adapter.createOrder(mockCartItem())
    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/not found/)
  })

  it('fails on price mismatch (stale offer)', async () => {
    mockGetProductById.mockResolvedValue(mockProduct({ price: 29999 })) // price changed
    const result = await adapter.createOrder(mockCartItem()) // payload has unitPrice: 24999
    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/Price has changed/)
  })

  it('fails when out of stock', async () => {
    mockGetProductById.mockResolvedValue(mockProduct())
    mockDecrementStock.mockResolvedValue(false)
    const result = await adapter.createOrder(mockCartItem())
    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/Out of stock/)
  })

  it('restores stock on order creation failure', async () => {
    mockGetProductById.mockResolvedValue(mockProduct())
    mockDecrementStock.mockResolvedValue(true)
    mockCreateVendorOrder.mockRejectedValue(new Error('DB write failed'))
    mockRestoreStock.mockResolvedValue(undefined)

    const result = await adapter.createOrder(mockCartItem())
    expect(result.status).toBe('failed')
    expect(mockRestoreStock).toHaveBeenCalledWith('earbuds-abc123', 1)
  })

  it('does NOT call decrementStock when product is not found', async () => {
    mockGetProductById.mockResolvedValue(null)
    await adapter.createOrder(mockCartItem())
    expect(mockDecrementStock).not.toHaveBeenCalled()
  })
})
