export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRecordApiCall = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/ecosystem/metering', () => ({
  recordApiCall: (...a: unknown[]) => mockRecordApiCall(...a),
}))

jest.mock('@/lib/cache/serviceCache', () => ({
  withCache: jest.fn((_key: string, _ttl: number, fn: () => unknown) => fn()),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Imports ─────────────────────────────────────────────────────────────────

import { DynamicAdapterProxy } from '@/lib/ecosystem/proxy'
import type { AdapterManifest } from '@/lib/ecosystem/types'
import type { SearchContext } from '@/lib/intent/types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<AdapterManifest> = {}): AdapterManifest {
  return {
    adapterId: 'acme-hotels',
    developerId: 'dev-1',
    name: 'Acme Hotels',
    description: 'Hotel search and booking',
    category: 'travel',
    endpoints: {
      search: 'https://api.acme.com/search',
      createOrder: 'https://api.acme.com/order',
    },
    auth: { type: 'bearer', token: 'secret-token' },
    status: 'approved',
    rating: 4.5,
    ratingCount: 10,
    installCount: 50,
    featured: false,
    revenueSharePercent: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeSearchContext(): SearchContext {
  return {
    intent: {
      destination: 'Paris',
      dates: { start: '2026-07-01', end: '2026-07-05' },
      participants: [],
      groupSize: 2,
      activityTypes: ['stays'],
      budgetSignal: 'mid-range',
      rawPrompt: 'hotels in Paris',
      confidence: 0.9,
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

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('DynamicAdapterProxy — metadata', () => {
  it('id is prefixed with "ecosystem:"', () => {
    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    expect(proxy.id).toBe('ecosystem:acme-hotels')
  })

  it('displayName matches manifest name', () => {
    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    expect(proxy.displayName).toBe('Acme Hotels')
  })

  it('isEnabled() returns true for approved adapters in prod mode', () => {
    const origMode = process.env.APP_MODE
    process.env.APP_MODE = 'prod'
    const proxy = new DynamicAdapterProxy(makeManifest({ status: 'approved' }), 'stays')
    expect(proxy.isEnabled()).toBe(true)
    process.env.APP_MODE = origMode
  })

  it('isEnabled() returns false for non-approved adapters in prod mode', () => {
    const origMode = process.env.APP_MODE
    process.env.APP_MODE = 'prod'
    const proxy = new DynamicAdapterProxy(makeManifest({ status: 'pending' }), 'stays')
    expect(proxy.isEnabled()).toBe(false)
    process.env.APP_MODE = origMode
  })

  it('genieCapable is false', () => {
    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    expect(proxy.genieCapable).toBe(false)
  })
})

// ─── search() ────────────────────────────────────────────────────────────────

describe('DynamicAdapterProxy — search()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls the manifest search endpoint via fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ serviceType: 'stays', cards: [], isAvailable: true, fetchedAt: new Date() }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    await proxy.search(makeSearchContext())
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.acme.com/search',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sets Bearer Authorization header for bearer auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ serviceType: 'stays', cards: [], isAvailable: true, fetchedAt: new Date() }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest({ auth: { type: 'bearer', token: 'my-token' } }), 'stays')
    await proxy.search(makeSearchContext())
    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['Authorization']).toBe('Bearer my-token')
  })

  it('sets X-Smart Search-Signature header for hmac auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ serviceType: 'stays', cards: [], isAvailable: true, fetchedAt: new Date() }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest({ auth: { type: 'hmac', secret: 'hmac-secret' } }), 'stays')
    await proxy.search(makeSearchContext())
    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['X-Smart Search-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('returns errorResult when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const result = await proxy.search(makeSearchContext())
    expect(result.isAvailable).toBe(false)
    expect(result.cards).toHaveLength(0)
    expect(result.errorMessage).toContain('Network failure')
  })

  it('returns errorResult when endpoint returns non-200', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const result = await proxy.search(makeSearchContext())
    expect(result.isAvailable).toBe(false)
    expect(result.errorMessage).toContain('503')
  })

  it('returns errorResult on timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const result = await proxy.search(makeSearchContext())
    expect(result.isAvailable).toBe(false)
  })

  it('calls recordApiCall after successful search', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ serviceType: 'stays', cards: [], isAvailable: true, fetchedAt: new Date() }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    await proxy.search(makeSearchContext())

    // Give fire-and-forget a tick to resolve
    await new Promise(r => setImmediate(r))
    expect(mockRecordApiCall).toHaveBeenCalledWith('dev-1', 'acme-hotels', 'search')
  })

  it('sets serviceType from the constructor type parameter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ serviceType: 'stays', cards: [], isAvailable: true, fetchedAt: new Date() }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'experiences')
    const result = await proxy.search(makeSearchContext())
    expect(result.serviceType).toBe('experiences')
  })
})

// ─── createOrder() ────────────────────────────────────────────────────────────

describe('DynamicAdapterProxy — createOrder()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls the manifest createOrder endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ vendorOrderId: 'ORD-1', confirmationCode: 'CODE-1', status: 'confirmed' }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const item = { id: 'item-1', isBookable: true } as import('@/lib/checkout/types').CartItem
    await proxy.createOrder(item)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.acme.com/order',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('returns failed OrderConfirmation on fetch error', async () => {
    mockFetch.mockRejectedValue(new Error('Adapter down'))

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const item = { id: 'item-1', isBookable: true } as import('@/lib/checkout/types').CartItem
    const result = await proxy.createOrder(item)

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toContain('Adapter down')
  })

  it('returns failed OrderConfirmation on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const item = { id: 'item-1', isBookable: true } as import('@/lib/checkout/types').CartItem
    const result = await proxy.createOrder(item)

    expect(result.status).toBe('failed')
  })

  it('calls recordApiCall after successful createOrder', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ vendorOrderId: 'ORD-1', confirmationCode: 'C1', status: 'confirmed' }),
    })

    const proxy = new DynamicAdapterProxy(makeManifest(), 'stays')
    const item = { id: 'item-1', isBookable: true } as import('@/lib/checkout/types').CartItem
    await proxy.createOrder(item)

    await new Promise(r => setImmediate(r))
    expect(mockRecordApiCall).toHaveBeenCalledWith('dev-1', 'acme-hotels', 'createOrder')
  })
})
