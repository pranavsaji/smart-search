export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockAgg = jest.fn()
const mockCount = jest.fn()
const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()
const mockFindToArray = jest.fn()

function findChain() {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    project: () => chain,
    toArray: mockFindToArray,
  }
  return chain
}

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      aggregate: () => ({ toArray: mockAgg }),
      countDocuments: mockCount,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      find: () => findChain(),
    }),
  })),
  COLLECTIONS: { stages: 'stages', vendorOrders: 'vendor_orders', vendors: 'vendors', analyticsRollups: 'analytics_rollups' },
}))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `A${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  projectDemand,
  applyKAnonymity,
  categoryDemand,
  destinationDemand,
  conversionFunnel,
  forecastDemand,
  realtimeIntentFeed,
  vendorAnalytics,
  computeDailyRollup,
} from '@/lib/analytics/intentSignals'

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  mockAgg.mockResolvedValue([])
  mockCount.mockResolvedValue(0)
  mockFindOne.mockResolvedValue(null)
  mockUpdateOne.mockResolvedValue({ upsertedCount: 1 })
  mockFindToArray.mockResolvedValue([])
})

// ─── Pure: projectDemand ───────────────────────────────────────────────────────

describe('projectDemand', () => {
  it('returns zeros for empty history', () => {
    expect(projectDemand([], 7)).toEqual({ dailyAverage: 0, projectedTotal: 0, trend: 'flat' })
  })

  it('computes daily average and projected total', () => {
    const r = projectDemand([10, 10, 10, 10], 7)
    expect(r.dailyAverage).toBe(10)
    expect(r.projectedTotal).toBe(70)
  })

  it('labels a rising trend', () => {
    const r = projectDemand([2, 2, 10, 12], 7) // older avg 2, recent avg 11
    expect(r.trend).toBe('rising')
  })

  it('labels a falling trend', () => {
    const r = projectDemand([12, 10, 2, 2], 7)
    expect(r.trend).toBe('falling')
  })

  it('labels flat within the ±15% band', () => {
    const r = projectDemand([10, 10, 10, 11], 7)
    expect(r.trend).toBe('flat')
  })
})

// ─── Pure: k-anonymity ───────────────────────────────────────────────────────

describe('applyKAnonymity', () => {
  it('suppresses cohorts below the threshold', () => {
    const rows = [{ uniqueUsers: 10 }, { uniqueUsers: 4 }, { uniqueUsers: 5 }]
    expect(applyKAnonymity(rows)).toEqual([{ uniqueUsers: 10 }, { uniqueUsers: 5 }])
  })

  it('respects a custom minimum', () => {
    expect(applyKAnonymity([{ uniqueUsers: 3 }], 2)).toHaveLength(1)
  })
})

// ─── categoryDemand ─────────────────────────────────────────────────────────────

describe('categoryDemand', () => {
  it('returns only k-anonymised rows', async () => {
    mockAgg.mockResolvedValueOnce([
      { activityType: 'flights', searches: 100, uniqueUsers: 30 },
      { activityType: 'cars', searches: 8, uniqueUsers: 2 }, // suppressed (< 5)
    ])
    const rows = await categoryDemand()
    expect(rows.map(r => r.activityType)).toEqual(['flights'])
  })
})

describe('destinationDemand', () => {
  it('passes through k-anonymised destinations', async () => {
    mockAgg.mockResolvedValueOnce([
      { destination: 'Paris', searches: 50, uniqueUsers: 12 },
      { destination: 'Nowhere', searches: 3, uniqueUsers: 1 },
    ])
    const rows = await destinationDemand()
    expect(rows).toHaveLength(1)
    expect(rows[0].destination).toBe('Paris')
  })
})

// ─── conversionFunnel ───────────────────────────────────────────────────────────

describe('conversionFunnel', () => {
  it('computes funnel rates', async () => {
    mockCount
      .mockResolvedValueOnce(200) // stages
      .mockResolvedValueOnce(80)  // carts
      .mockResolvedValueOnce(40)  // orders
    const f = await conversionFunnel('products')
    expect(f.stages).toBe(200)
    expect(f.stageToCartRate).toBe(0.4)
    expect(f.cartToOrderRate).toBe(0.5)
    expect(f.overallConversion).toBe(0.2)
  })

  it('guards against divide-by-zero', async () => {
    mockCount.mockResolvedValue(0)
    const f = await conversionFunnel(undefined)
    expect(f.stageToCartRate).toBe(0)
    expect(f.overallConversion).toBe(0)
  })
})

// ─── forecastDemand ─────────────────────────────────────────────────────────────

describe('forecastDemand', () => {
  it('returns null with too little history', async () => {
    mockAgg.mockResolvedValueOnce([{ _id: '2026-05-01', count: 5 }])
    expect(await forecastDemand('flights')).toBeNull()
  })

  it('forecasts when enough days exist', async () => {
    mockAgg.mockResolvedValueOnce([
      { _id: '2026-05-01', count: 5 },
      { _id: '2026-05-02', count: 5 },
      { _id: '2026-05-03', count: 5 },
    ])
    const f = await forecastDemand('flights')
    expect(f).not.toBeNull()
    expect(f!.dailyAverage).toBe(5)
    expect(f!.historyDays).toBe(3)
  })
})

// ─── realtimeIntentFeed ─────────────────────────────────────────────────────────

describe('realtimeIntentFeed', () => {
  it('anonymises and never leaks userId', async () => {
    mockFindToArray.mockResolvedValueOnce([
      { parsedIntent: { destination: 'Tokyo', activityTypes: ['flights'], budgetSignal: 'premium' }, createdAt: new Date() },
    ])
    const feed = await realtimeIntentFeed({ limit: 10 })
    expect(feed).toHaveLength(1)
    expect(feed[0]).not.toHaveProperty('userId')
    expect(feed[0].destination).toBe('Tokyo')
  })

  it('defaults missing fields safely', async () => {
    mockFindToArray.mockResolvedValueOnce([{ createdAt: new Date() }])
    const feed = await realtimeIntentFeed()
    expect(feed[0].destination).toBe('UNKNOWN')
    expect(feed[0].activityTypes).toEqual([])
  })
})

// ─── vendorAnalytics (integration of the sub-aggregations) ─────────────────────

describe('vendorAnalytics', () => {
  it('returns null when the vendor has no category', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    expect(await vendorAnalytics('vendor-x')).toBeNull()
  })

  it('assembles demand + conversion + forecast for the vendor category', async () => {
    mockFindOne.mockResolvedValueOnce({ category: 'products' }) // vendor lookup
    // Sequenced aggregate calls: categoryDemand, forecastDemand, destinationDemand
    mockAgg
      .mockResolvedValueOnce([{ activityType: 'products', searches: 90, uniqueUsers: 20 }]) // categoryDemand
      .mockResolvedValueOnce([
        { _id: '2026-05-01', count: 3 },
        { _id: '2026-05-02', count: 3 },
        { _id: '2026-05-03', count: 3 },
      ]) // forecastDemand
      .mockResolvedValueOnce([{ destination: 'London', searches: 30, uniqueUsers: 9 }]) // destinationDemand
    mockCount.mockResolvedValueOnce(100).mockResolvedValueOnce(40).mockResolvedValueOnce(20) // conversionFunnel

    const a = await vendorAnalytics('vendor-1')
    expect(a).not.toBeNull()
    expect(a!.category).toBe('products')
    expect(a!.demand?.searches).toBe(90)
    expect(a!.conversion.overallConversion).toBe(0.2)
    expect(a!.forecast).not.toBeNull()
    expect(a!.topDestinations[0].destination).toBe('London')
  })
})

// ─── computeDailyRollup ─────────────────────────────────────────────────────────

describe('computeDailyRollup', () => {
  it('upserts a rollup per scope (global + categories) idempotently', async () => {
    // global agg, then per-category agg
    mockAgg
      .mockResolvedValueOnce([{ scope: 'category:flights', searches: 10, uniqueUsers: 4 }]) // perCategory
      .mockResolvedValueOnce([{ scope: 'global', searches: 25, uniqueUsers: 11 }])           // global
    mockCount.mockResolvedValueOnce(7) // orders

    const res = await computeDailyRollup(new Date('2026-05-27T12:00:00Z'))
    expect(res.scopes).toBe(2)
    // upsert keyed by (date, scope)
    expect(mockUpdateOne).toHaveBeenCalledTimes(2)
    const firstCall = mockUpdateOne.mock.calls[0][0]
    expect(firstCall.date).toBe('2026-05-27')
  })
})
