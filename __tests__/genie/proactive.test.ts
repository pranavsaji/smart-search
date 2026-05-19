export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockUpdateOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      find: mockFind,
      updateOne: mockUpdateOne,
      findOneAndUpdate: mockFindOneAndUpdate,
    }),
  })),
  COLLECTIONS: {
    stages: 'stages',
    vendorOrders: 'vendor_orders',
    proactiveSuggestions: 'proactive_suggestions',
    proactivePreferences: 'proactive_preferences',
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('nanoid', () => ({ nanoid: () => 'TESTNANOID12345X' }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  generateSuggestionsForStage,
  storeSuggestion,
  getUserSuggestions,
  dismissSuggestion,
  markSuggestionActed,
  markSuggestionSent,
  getNotificationPreferences,
  upsertNotificationPreferences,
  DEFAULT_PREFS,
  scanAndGenerateSuggestions,
  type ProactiveSuggestion,
} from '@/lib/genie/proactive'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStage(daysUntil: number, overrides = {}) {
  const tripDate = new Date(Date.now() + daysUntil * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  return {
    stageId: 'stage-001',
    initiatorId: 'user-001',
    intent: { destination: 'Barcelona', dates: { start: tripDate } },
    ...overrides,
  }
}

// ─── generateSuggestionsForStage() ────────────────────────────────────────────

describe('generateSuggestionsForStage()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Return default prefs (all enabled) for all tests
    mockFindOne.mockResolvedValue(null)
  })

  it('generates weather + restaurant + experience + reminder for trip in 3 days', async () => {
    const suggestions = await generateSuggestionsForStage(makeStage(3))
    const types = suggestions.map(s => s.type)
    expect(types).toContain('weather_check')
    expect(types).toContain('restaurant_suggestion')
    expect(types).toContain('experience_suggestion')
    expect(types).toContain('trip_reminder')
  })

  it('generates reminder + restaurant + experience (no weather) for trip in 6 days', async () => {
    const suggestions = await generateSuggestionsForStage(makeStage(6))
    const types = suggestions.map(s => s.type)
    expect(types).toContain('trip_reminder')
    expect(types).toContain('restaurant_suggestion')
    expect(types).toContain('experience_suggestion')
    expect(types).not.toContain('weather_check')
  })

  it('returns empty array when stage has no destination', async () => {
    const suggestions = await generateSuggestionsForStage({
      stageId: 'stage-001',
      initiatorId: 'user-001',
      intent: { dates: { start: new Date(Date.now() + 86400000).toISOString() } },
    })
    expect(suggestions).toEqual([])
  })

  it('returns empty array when stage has no tripDate', async () => {
    const suggestions = await generateSuggestionsForStage({
      stageId: 'stage-001',
      initiatorId: 'user-001',
      intent: { destination: 'Paris' },
    })
    expect(suggestions).toEqual([])
  })

  it('returns empty array when stage has no initiatorId', async () => {
    const suggestions = await generateSuggestionsForStage({
      stageId: 'stage-001',
      intent: { destination: 'Paris', dates: { start: new Date().toISOString() } },
    })
    expect(suggestions).toEqual([])
  })

  it('each suggestion has required fields', async () => {
    const suggestions = await generateSuggestionsForStage(makeStage(2))
    for (const s of suggestions) {
      expect(s.suggestionId).toMatch(/^pgs_/)
      expect(s.userId).toBe('user-001')
      expect(s.stageId).toBe('stage-001')
      expect(s.status).toBe('pending')
      expect(s.actionPrompt).toBeTruthy()
      expect(s.title).toBeTruthy()
      expect(s.body).toBeTruthy()
    }
  })

  it('respects disabled weather preference', async () => {
    mockFindOne.mockResolvedValue({
      userId: 'user-001',
      ...DEFAULT_PREFS,
      enableWeather: false,
      updatedAt: new Date(),
    })

    const suggestions = await generateSuggestionsForStage(makeStage(3))
    expect(suggestions.map(s => s.type)).not.toContain('weather_check')
  })

  it('respects disabled restaurants preference', async () => {
    mockFindOne.mockResolvedValue({
      userId: 'user-001',
      ...DEFAULT_PREFS,
      enableRestaurants: false,
      updatedAt: new Date(),
    })

    const suggestions = await generateSuggestionsForStage(makeStage(3))
    expect(suggestions.map(s => s.type)).not.toContain('restaurant_suggestion')
  })

  it('generates today reminder when daysUntil is 0', async () => {
    const suggestions = await generateSuggestionsForStage(makeStage(0))
    const reminder = suggestions.find(s => s.type === 'trip_reminder')
    expect(reminder?.title).toContain('today')
  })
})

// ─── storeSuggestion() ────────────────────────────────────────────────────────

describe('storeSuggestion()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('stores suggestion and returns true when no duplicate', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })

    const s: ProactiveSuggestion = {
      suggestionId: 'pgs_abc',
      userId: 'u1',
      stageId: 'stage-1',
      type: 'weather_check',
      title: 'Check weather',
      body: 'Want to know?',
      actionPrompt: 'weather in Paris',
      status: 'pending',
      createdAt: new Date(),
    }

    const stored = await storeSuggestion(s)
    expect(stored).toBe(true)
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
  })

  it('returns false when a duplicate already exists', async () => {
    mockFindOne.mockResolvedValueOnce({ suggestionId: 'existing' })

    const s: ProactiveSuggestion = {
      suggestionId: 'pgs_new',
      userId: 'u1',
      stageId: 'stage-1',
      type: 'weather_check',
      title: 'Check weather',
      body: 'Want to know?',
      actionPrompt: 'weather in Paris',
      status: 'pending',
      createdAt: new Date(),
    }

    const stored = await storeSuggestion(s)
    expect(stored).toBe(false)
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('stores without de-dupe check when stageId is absent', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })

    const s: ProactiveSuggestion = {
      suggestionId: 'pgs_no_stage',
      userId: 'u1',
      type: 'seasonal_nudge',
      title: 'Summer is here',
      body: 'Book a trip',
      actionPrompt: 'summer trips',
      status: 'pending',
      createdAt: new Date(),
    }

    const stored = await storeSuggestion(s)
    expect(stored).toBe(true)
    expect(mockFindOne).not.toHaveBeenCalled()
  })
})

// ─── getUserSuggestions() ─────────────────────────────────────────────────────

describe('getUserSuggestions()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('queries pending and sent suggestions sorted by date', async () => {
    const fakeDocs = [{ suggestionId: 'pgs_1', status: 'pending' }]
    mockFind.mockReturnValueOnce({
      sort: () => ({ limit: () => ({ toArray: async () => fakeDocs }) }),
    })

    const result = await getUserSuggestions('user-1')
    expect(result).toHaveLength(1)
    expect(mockFind).toHaveBeenCalledWith({
      userId: 'user-1',
      status: { $in: ['pending', 'sent'] },
    })
  })
})

// ─── dismissSuggestion() ─────────────────────────────────────────────────────

describe('dismissSuggestion()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns true when suggestion matched and updated', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 1 })
    const result = await dismissSuggestion('pgs_abc', 'user-1')
    expect(result).toBe(true)

    const call = mockUpdateOne.mock.calls[0]
    expect(call[0]).toEqual({ suggestionId: 'pgs_abc', userId: 'user-1' })
    expect(call[1].$set.status).toBe('dismissed')
  })

  it('returns false when suggestion not found', async () => {
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0 })
    const result = await dismissSuggestion('pgs_missing', 'user-1')
    expect(result).toBe(false)
  })
})

// ─── markSuggestionActed() ────────────────────────────────────────────────────

describe('markSuggestionActed()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets status to acted', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await markSuggestionActed('pgs_abc', 'user-1')

    const call = mockUpdateOne.mock.calls[0]
    expect(call[1].$set.status).toBe('acted')
  })
})

// ─── markSuggestionSent() ────────────────────────────────────────────────────

describe('markSuggestionSent()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets status to sent with sentAt timestamp', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await markSuggestionSent('pgs_abc')

    const call = mockUpdateOne.mock.calls[0]
    expect(call[0]).toEqual({ suggestionId: 'pgs_abc' })
    expect(call[1].$set.status).toBe('sent')
    expect(call[1].$set.sentAt).toBeInstanceOf(Date)
  })
})

// ─── getNotificationPreferences() ────────────────────────────────────────────

describe('getNotificationPreferences()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns default prefs when no record found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const prefs = await getNotificationPreferences('user-new')

    expect(prefs.userId).toBe('user-new')
    expect(prefs.enableWeather).toBe(DEFAULT_PREFS.enableWeather)
    expect(prefs.enableRestaurants).toBe(DEFAULT_PREFS.enableRestaurants)
    expect(prefs.enableSeasonalNudges).toBe(DEFAULT_PREFS.enableSeasonalNudges)
  })

  it('returns stored prefs when found', async () => {
    const stored = {
      userId: 'user-1',
      ...DEFAULT_PREFS,
      enableWeather: false,
      updatedAt: new Date(),
    }
    mockFindOne.mockResolvedValueOnce(stored)

    const prefs = await getNotificationPreferences('user-1')
    expect(prefs.enableWeather).toBe(false)
  })
})

// ─── upsertNotificationPreferences() ─────────────────────────────────────────

describe('upsertNotificationPreferences()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upserts and returns updated preferences', async () => {
    const updated = {
      userId: 'user-1',
      ...DEFAULT_PREFS,
      enableWeather: false,
      updatedAt: new Date(),
    }
    mockFindOneAndUpdate.mockResolvedValueOnce(updated)

    const result = await upsertNotificationPreferences('user-1', { enableWeather: false })
    expect(result.enableWeather).toBe(false)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1' },
      expect.objectContaining({ $set: expect.objectContaining({ enableWeather: false }) }),
      { upsert: true, returnDocument: 'after' }
    )
  })
})

// ─── scanAndGenerateSuggestions() ────────────────────────────────────────────

describe('scanAndGenerateSuggestions()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns processed/generated counts', async () => {
    // stages.find → return empty array (no upcoming stages)
    mockFind.mockReturnValueOnce({
      find: jest.fn(),
      limit: () => ({ toArray: async () => [] }),
    })

    // getDb calls collection() — need to handle multiple collection calls
    const { getDb } = require('@/lib/db/mongo')
    getDb.mockImplementationOnce(async () => ({
      collection: () => ({
        find: () => ({ limit: () => ({ toArray: async () => [] }) }),
        findOne: mockFindOne,
        insertOne: mockInsertOne,
        updateOne: mockUpdateOne,
      }),
    }))

    const result = await scanAndGenerateSuggestions()
    expect(result).toHaveProperty('processed')
    expect(result).toHaveProperty('generated')
    expect(typeof result.processed).toBe('number')
    expect(typeof result.generated).toBe('number')
  })
})
