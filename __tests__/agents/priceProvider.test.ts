export {}

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

// Mock the service registry so AdapterPriceProvider is deterministic.
const mockGetEnabledByType = jest.fn()
const mockGetAll = jest.fn(() => [{ id: 'x' }])
jest.mock('@/lib/services/registry', () => ({
  serviceRegistry: {
    getAll: () => mockGetAll(),
    getEnabledByType: (t: string) => mockGetEnabledByType(t),
  },
  registerAllAdapters: jest.fn(async () => {}),
}))

import {
  mockPriceCents,
  MockPriceProvider,
  AdapterPriceProvider,
  DefaultPriceProvider,
} from '@/lib/agents/priceProvider'
import type { WatchTarget } from '@/lib/agents/types'

const target: WatchTarget = {
  itemType: 'flights',
  itemRef: 'offer-1',
  label: 'LON→TYO',
  query: { destination: 'Tokyo', origin: 'London' },
  currency: 'GBP',
}

beforeEach(() => jest.clearAllMocks())

describe('mockPriceCents', () => {
  it('is deterministic for the same target', () => {
    expect(mockPriceCents(target)).toBe(mockPriceCents(target))
  })

  it('varies by query', () => {
    const other = { ...target, query: { destination: 'Paris' } }
    expect(mockPriceCents(target)).not.toBe(mockPriceCents(other))
  })

  it('never returns below the minimum floor', () => {
    expect(mockPriceCents(target)).toBeGreaterThanOrEqual(100)
  })
})

describe('MockPriceProvider', () => {
  it('always returns a bookable quote', async () => {
    const quote = await new MockPriceProvider().lookup(target)
    expect(quote.priceCents).toBeGreaterThan(0)
    expect(quote.isBookable).toBe(true)
    expect(quote.currency).toBe('GBP')
  })
})

describe('AdapterPriceProvider', () => {
  it('returns the cheapest bookable card from the adapter', async () => {
    mockGetEnabledByType.mockReturnValue({
      search: async () => ({
        cards: [
          { vendorId: 'a', vendorType: 'flights', displayName: 'A', isBookable: true, price: { amount: 50000, currency: 'GBP' }, bookingPayload: {} },
          { vendorId: 'b', vendorType: 'flights', displayName: 'B', isBookable: true, price: { amount: 30000, currency: 'GBP' }, bookingPayload: {} },
        ],
      }),
    })
    const quote = await new AdapterPriceProvider().lookup({ ...target, itemRef: undefined })
    expect(quote?.priceCents).toBe(30000)
  })

  it('prefers the exact itemRef card when watched', async () => {
    mockGetEnabledByType.mockReturnValue({
      search: async () => ({
        cards: [
          { vendorId: 'a', vendorType: 'flights', displayName: 'A', isBookable: true, price: { amount: 30000, currency: 'GBP' }, bookingPayload: {} },
          { vendorId: 'offer-1', vendorType: 'flights', displayName: 'Watched', isBookable: true, price: { amount: 45000, currency: 'GBP' }, bookingPayload: {} },
        ],
      }),
    })
    const quote = await new AdapterPriceProvider().lookup(target)
    expect(quote?.vendorId).toBe('offer-1')
  })

  it('returns null when no adapter is enabled (caller falls back to mock)', async () => {
    mockGetEnabledByType.mockReturnValue(undefined)
    const quote = await new AdapterPriceProvider().lookup(target)
    expect(quote).toBeNull()
  })

  it('returns null and does not throw when the adapter errors', async () => {
    mockGetEnabledByType.mockReturnValue({ search: async () => { throw new Error('boom') } })
    const quote = await new AdapterPriceProvider().lookup(target)
    expect(quote).toBeNull()
  })
})

describe('DefaultPriceProvider', () => {
  it('falls back to the mock when the adapter yields nothing', async () => {
    mockGetEnabledByType.mockReturnValue(undefined)
    const quote = await new DefaultPriceProvider().lookup(target)
    expect(quote.priceCents).toBe(mockPriceCents(target))
  })

  it('uses the real adapter quote when available', async () => {
    mockGetEnabledByType.mockReturnValue({
      search: async () => ({
        cards: [{ vendorId: 'offer-1', vendorType: 'flights', displayName: 'X', isBookable: true, price: { amount: 12345, currency: 'GBP' }, bookingPayload: {} }],
      }),
    })
    const quote = await new DefaultPriceProvider().lookup(target)
    expect(quote.priceCents).toBe(12345)
  })
})
