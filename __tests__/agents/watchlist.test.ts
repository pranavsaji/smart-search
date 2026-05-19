export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()
const mockDeleteOne = jest.fn()
const mockToArray = jest.fn()

function findChain() {
  const chain = { sort: () => chain, limit: () => chain, toArray: mockToArray }
  return chain
}

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      deleteOne: mockDeleteOne,
      find: () => findChain(),
    }),
  })),
  COLLECTIONS: { watchlist: 'watchlist' },
}))

const mockRedisSet = jest.fn()
jest.mock('@/lib/cache/redis', () => ({
  redis: { set: (...a: unknown[]) => mockRedisSet(...a) },
  RedisKeys: { watchPrice: (id: string) => `watchlist:price:${id}` },
}))

const mockNotifyPriceAlert = jest.fn()
jest.mock('@/lib/sse/notify', () => ({ notifyPriceAlert: (...a: unknown[]) => mockNotifyPriceAlert(...a) }))

const mockPush = jest.fn()
jest.mock('@/lib/notifications/push', () => ({ sendPushToUser: (...a: unknown[]) => mockPush(...a) }))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `W${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  createWatch,
  getUserWatchlist,
  deactivateWatch,
  deleteWatch,
  checkWatchItem,
  scanDueWatches,
  type WatchlistItem,
} from '@/lib/agents/watchlist'
import type { PriceProvider, PriceQuote, WatchTarget } from '@/lib/agents/types'

const target: WatchTarget = {
  itemType: 'products',
  itemRef: 'sku-1',
  label: 'Headphones',
  query: {},
  currency: 'GBP',
}

function makeWatch(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    watchId: 'watch_1',
    userId: 'user-1',
    target,
    targetPriceCents: 10000,
    pollIntervalMinutes: 60,
    active: true,
    alertSent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function providerAt(priceCents: number): PriceProvider {
  const quote: PriceQuote = {
    priceCents, currency: 'GBP', vendorId: 'v', vendorType: 'products',
    label: 'Headphones', isBookable: true, fetchedAt: new Date(),
  }
  return { lookup: async () => quote }
}

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
  mockDeleteOne.mockResolvedValue({ deletedCount: 1 })
  mockToArray.mockResolvedValue([])
  mockRedisSet.mockResolvedValue('OK')
  mockNotifyPriceAlert.mockResolvedValue(undefined)
  mockPush.mockResolvedValue({ sent: 1, failed: 0 })
})

// ─── CRUD ───────────────────────────────────────────────────────────────────

describe('createWatch', () => {
  it('creates an active watch with a default poll cadence by type', async () => {
    const w = await createWatch({ userId: 'user-1', target, targetPriceCents: 10000 })
    expect(w.active).toBe(true)
    expect(w.alertSent).toBe(false)
    expect(w.pollIntervalMinutes).toBe(60) // products default
    expect(mockInsertOne).toHaveBeenCalled()
  })

  it('uses 360min cadence for flights', async () => {
    const w = await createWatch({ userId: 'u', target: { ...target, itemType: 'flights' }, targetPriceCents: 50000 })
    expect(w.pollIntervalMinutes).toBe(360)
  })

  it('rejects a non-positive target price', async () => {
    await expect(createWatch({ userId: 'u', target, targetPriceCents: 0 })).rejects.toThrow()
  })
})

describe('getUserWatchlist / deactivate / delete', () => {
  it('lists a user\'s watches', async () => {
    mockToArray.mockResolvedValueOnce([makeWatch(), makeWatch({ watchId: 'watch_2' })])
    expect(await getUserWatchlist('user-1')).toHaveLength(2)
  })

  it('deactivates a watch', async () => {
    expect(await deactivateWatch('watch_1', 'user-1')).toBe(true)
  })

  it('deletes a watch', async () => {
    expect(await deleteWatch('watch_1', 'user-1')).toBe(true)
  })
})

// ─── checkWatchItem — alert semantics ─────────────────────────────────────────

describe('checkWatchItem', () => {
  it('fires an alert when price drops to/below target (first time)', async () => {
    const res = await checkWatchItem(makeWatch(), providerAt(9000))
    expect(res.alertFired).toBe(true)
    expect(res.priceCents).toBe(9000)
    expect(mockNotifyPriceAlert).toHaveBeenCalledWith('user-1', expect.objectContaining({ priceCents: 9000 }))
    expect(mockPush).toHaveBeenCalled()
    // alertSent persisted as true
    const set = mockUpdateOne.mock.calls[0][1] as { $set: { alertSent: boolean } }
    expect(set.$set.alertSent).toBe(true)
  })

  it('does NOT re-fire while already alerted and still below target', async () => {
    const res = await checkWatchItem(makeWatch({ alertSent: true }), providerAt(9000))
    expect(res.alertFired).toBe(false)
    expect(mockNotifyPriceAlert).not.toHaveBeenCalled()
  })

  it('does not alert when price is above target', async () => {
    const res = await checkWatchItem(makeWatch(), providerAt(12000))
    expect(res.alertFired).toBe(false)
    const set = mockUpdateOne.mock.calls[0][1] as { $set: { alertSent: boolean } }
    expect(set.$set.alertSent).toBe(false) // re-armed
  })

  it('re-arms after the price rises back above target', async () => {
    // was alerted, price now above target → alertSent reset to false
    const res = await checkWatchItem(makeWatch({ alertSent: true }), providerAt(12000))
    expect(res.alertFired).toBe(false)
    const set = mockUpdateOne.mock.calls[0][1] as { $set: { alertSent: boolean } }
    expect(set.$set.alertSent).toBe(false)
  })

  it('tracks lowestSeenCents', async () => {
    await checkWatchItem(makeWatch({ lowestSeenCents: 9500 }), providerAt(8000))
    const set = mockUpdateOne.mock.calls[0][1] as { $set: { lowestSeenCents: number } }
    expect(set.$set.lowestSeenCents).toBe(8000)
  })

  it('skips an inactive watch', async () => {
    const res = await checkWatchItem(makeWatch({ active: false }), providerAt(1))
    expect(res.checked).toBe(false)
    expect(res.reason).toBe('inactive')
  })

  it('skips when the provider returns no quote', async () => {
    const res = await checkWatchItem(makeWatch(), { lookup: async () => null })
    expect(res.checked).toBe(false)
    expect(res.reason).toBe('no_quote')
  })
})

// ─── scanDueWatches ───────────────────────────────────────────────────────────

describe('scanDueWatches', () => {
  it('checks only watches whose cadence is due', async () => {
    const now = new Date('2026-01-01T12:00:00Z')
    const due = makeWatch({ watchId: 'due', lastCheckedAt: new Date('2026-01-01T10:00:00Z') }) // 2h ago, 60m cadence → due
    const notDue = makeWatch({ watchId: 'fresh', lastCheckedAt: new Date('2026-01-01T11:50:00Z') }) // 10m ago → not due
    mockToArray.mockResolvedValueOnce([due, notDue])
    const result = await scanDueWatches(providerAt(9000), now)
    expect(result.scanned).toBe(1)
    expect(result.alerts).toBe(1)
  })

  it('treats never-checked watches as due', async () => {
    mockToArray.mockResolvedValueOnce([makeWatch({ lastCheckedAt: undefined })])
    const result = await scanDueWatches(providerAt(12000), new Date())
    expect(result.scanned).toBe(1)
    expect(result.alerts).toBe(0)
  })
})
