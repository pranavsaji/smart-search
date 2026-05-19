export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()
const mockToArray = jest.fn()
const mockDistinct = jest.fn()

function findChain() {
  const chain = { sort: () => chain, limit: () => chain, toArray: mockToArray }
  return chain
}

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
      find: () => findChain(),
      distinct: mockDistinct,
    }),
  })),
  COLLECTIONS: {
    lifeEvents: 'life_events',
    lifeEventPreferences: 'life_event_preferences',
    vendorOrders: 'vendor_orders',
    intentGraphs: 'intentGraphs',
    searches: 'searches',
  },
}))

const mockNotifyLifeEvent = jest.fn()
jest.mock('@/lib/sse/notify', () => ({ notifyLifeEvent: (...a: unknown[]) => mockNotifyLifeEvent(...a) }))

const mockPush = jest.fn()
jest.mock('@/lib/notifications/push', () => ({ sendPushToUser: (...a: unknown[]) => mockPush(...a) }))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `L${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  detectLifeEvents,
  detectTravelSeason,
  getLifeEventPreferences,
  setLifeEventPreferences,
  scanLifeEventsForUser,
  getUserLifeEvents,
  updateLifeEventStatus,
  scanAllLifeEvents,
  DEFAULT_LIFE_EVENT_PREFS,
  type ActivitySnapshot,
  type ActivityOrder,
} from '@/lib/agents/lifeEvents'

function order(activityType: ActivityOrder['activityType'], title: string): ActivityOrder {
  return { activityType, title, createdAt: new Date(), amountCents: 1000 }
}

function snapshot(overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return { userId: 'user-1', orders: [], destinations: [], recentSearchTerms: [], ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 })
  mockToArray.mockResolvedValue([])
  mockDistinct.mockResolvedValue([])
  mockNotifyLifeEvent.mockResolvedValue(undefined)
  mockPush.mockResolvedValue({ sent: 1, failed: 0 })
})

// ─── Pure detection ───────────────────────────────────────────────────────────

describe('detectLifeEvents', () => {
  it('detects a new baby from product titles', () => {
    const snap = snapshot({ orders: [order('products', 'Baby crib'), order('products', 'Stroller')] })
    const events = detectLifeEvents(snap)
    expect(events.map(e => e.type)).toContain('new_baby')
  })

  it('detects wedding planning from search terms', () => {
    const snap = snapshot({ recentSearchTerms: ['wedding venue near me', 'wedding catering'] })
    const events = detectLifeEvents(snap)
    expect(events.map(e => e.type)).toContain('wedding_planning')
  })

  it('detects moving from a cluster of home-service bookings', () => {
    const snap = snapshot({
      orders: [order('home_services', 'Cleaner'), order('home_services', 'Handyman'), order('home_services', 'Locksmith')],
    })
    const events = detectLifeEvents(snap)
    const moving = events.find(e => e.type === 'moving_cities')
    expect(moving).toBeDefined()
    expect(moving!.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('does NOT surface moving on two home-service bookings alone (weak signal)', () => {
    const snap = snapshot({ orders: [order('home_services', 'Cleaner'), order('home_services', 'Handyman')] })
    expect(detectLifeEvents(snap).find(e => e.type === 'moving_cities')).toBeUndefined()
  })

  it('surfaces moving when two bookings combine with a keyword signal', () => {
    const snap = snapshot({
      orders: [order('home_services', 'Cleaner'), order('home_services', 'Handyman')],
      recentSearchTerms: ['movers near me'],
    })
    expect(detectLifeEvents(snap).find(e => e.type === 'moving_cities')).toBeDefined()
  })

  it('returns nothing below the confidence threshold (single weak signal)', () => {
    const snap = snapshot({ orders: [order('products', 'baby')] }) // one hit * 0.3 = 0.3 < 0.5
    const events = detectLifeEvents(snap)
    expect(events.map(e => e.type)).not.toContain('new_baby')
  })

  it('caps confidence at 1', () => {
    const snap = snapshot({ recentSearchTerms: ['wedding venue catering engagement florist bridal honeymoon'] })
    const events = detectLifeEvents(snap)
    const wedding = events.find(e => e.type === 'wedding_planning')!
    expect(wedding.confidence).toBeLessThanOrEqual(1)
  })

  it('produces suggested intents for curated Stages', () => {
    const snap = snapshot({ orders: [order('products', 'Baby crib nursery')] , recentSearchTerms: ['stroller pram'] })
    const events = detectLifeEvents(snap)
    const baby = events.find(e => e.type === 'new_baby')!
    expect(baby.suggestedIntents.length).toBeGreaterThan(0)
  })
})

describe('detectTravelSeason', () => {
  it('fires at 3+ travel bookings', () => {
    const snap = snapshot({ orders: [order('flights', 'A'), order('stays', 'B'), order('flights', 'C')] })
    expect(detectTravelSeason(snap)?.type).toBe('travel_season')
  })
  it('does not fire below 3', () => {
    expect(detectTravelSeason(snapshot({ orders: [order('flights', 'A')] }))).toBeNull()
  })
})

// ─── Preferences (opt-in) ─────────────────────────────────────────────────────

describe('preferences', () => {
  it('defaults to disabled (privacy by default)', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const prefs = await getLifeEventPreferences('user-1')
    expect(prefs.enabled).toBe(DEFAULT_LIFE_EVENT_PREFS.enabled)
    expect(prefs.enabled).toBe(false)
  })

  it('upserts preferences', async () => {
    const prefs = await setLifeEventPreferences('user-1', { enabled: true, disabledTypes: ['new_job'] })
    expect(prefs.enabled).toBe(true)
    expect(prefs.disabledTypes).toEqual(['new_job'])
    expect(mockUpdateOne).toHaveBeenCalledWith({ userId: 'user-1' }, expect.anything(), { upsert: true })
  })
})

// ─── scanLifeEventsForUser ────────────────────────────────────────────────────

describe('scanLifeEventsForUser', () => {
  it('does nothing when the user has not opted in', async () => {
    mockFindOne.mockResolvedValueOnce({ userId: 'user-1', enabled: false, disabledTypes: [], updatedAt: new Date() })
    const res = await scanLifeEventsForUser('user-1')
    expect(res).toEqual({ detected: 0, created: 0 })
    expect(mockNotifyLifeEvent).not.toHaveBeenCalled()
  })

  it('detects + notifies for opted-in users on a fresh event', async () => {
    // prefs.findOne (enabled), then buildActivitySnapshot reads (graph findOne)
    mockFindOne
      .mockResolvedValueOnce({ userId: 'user-1', enabled: true, disabledTypes: [], updatedAt: new Date() }) // prefs
      .mockResolvedValueOnce(null) // intentGraph
    // vendorOrders + searches find().toArray()
    mockToArray
      .mockResolvedValueOnce([{ items: [{ activityType: 'products', displayName: 'Baby crib nursery stroller' }] }]) // orders
      .mockResolvedValueOnce([{ rawPrompt: 'pram pediatric' }]) // searches
    // upsert reports a new event
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 })

    const res = await scanLifeEventsForUser('user-1')
    expect(res.created).toBeGreaterThanOrEqual(1)
    expect(mockNotifyLifeEvent).toHaveBeenCalled()
  })

  it('does not re-notify when the event already exists (dedupe)', async () => {
    mockFindOne
      .mockResolvedValueOnce({ userId: 'user-1', enabled: true, disabledTypes: [], updatedAt: new Date() })
      .mockResolvedValueOnce(null)
    mockToArray
      .mockResolvedValueOnce([{ items: [{ activityType: 'products', displayName: 'Baby crib nursery stroller pram' }] }])
      .mockResolvedValueOnce([])
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }) // already exists

    const res = await scanLifeEventsForUser('user-1')
    expect(res.created).toBe(0)
    expect(mockNotifyLifeEvent).not.toHaveBeenCalled()
  })

  it('respects per-type opt-out', async () => {
    mockFindOne
      .mockResolvedValueOnce({ userId: 'user-1', enabled: true, disabledTypes: ['new_baby'], updatedAt: new Date() })
      .mockResolvedValueOnce(null)
    mockToArray
      .mockResolvedValueOnce([{ items: [{ activityType: 'products', displayName: 'Baby crib nursery stroller pram' }] }])
      .mockResolvedValueOnce([])
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 })

    const res = await scanLifeEventsForUser('user-1')
    expect(res.detected).toBe(0) // new_baby filtered out
  })
})

// ─── Read / update ────────────────────────────────────────────────────────────

describe('getUserLifeEvents / updateLifeEventStatus', () => {
  it('lists events', async () => {
    mockToArray.mockResolvedValueOnce([{ eventId: 'life_1' }])
    expect(await getUserLifeEvents('user-1')).toHaveLength(1)
  })

  it('updates status and sets acknowledgedAt on acknowledge', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 1 })
    expect(await updateLifeEventStatus('life_1', 'user-1', 'acknowledged')).toBe(true)
    const set = mockUpdateOne.mock.calls[0][1] as { $set: { acknowledgedAt?: Date } }
    expect(set.$set.acknowledgedAt).toBeInstanceOf(Date)
  })

  it('returns false when no event matched', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0 })
    expect(await updateLifeEventStatus('nope', 'user-1', 'dismissed')).toBe(false)
  })
})

// ─── scanAllLifeEvents ────────────────────────────────────────────────────────

describe('scanAllLifeEvents', () => {
  it('scans each opted-in user', async () => {
    mockDistinct.mockResolvedValueOnce(['user-1', 'user-2'])
    // each scanLifeEventsForUser: prefs findOne (enabled) + graph findOne, orders + searches toArray
    mockFindOne.mockResolvedValue({ enabled: true, disabledTypes: [], userId: 'x', updatedAt: new Date() })
    mockToArray.mockResolvedValue([])
    const res = await scanAllLifeEvents()
    expect(res.users).toBe(2)
  })
})
