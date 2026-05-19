export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/cache/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
  RedisKeys: { routerResult: (h: string) => `router:${h}` },
}))

jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn()
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    _mockCreate: mockCreate,
  }
})

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  routeIntent,
  buildWebSearchCardId,
  isKnownActivityType,
} from '@/lib/intent/router'
import type { ParsedIntent } from '@/lib/intent/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    destination: 'Paris',
    dates: { start: '2026-07-01', end: '2026-07-05' },
    participants: [{ handle: 'alice', userId: 'u1', intentGraph: null }],
    groupSize: 1,
    activityTypes: [],
    budgetSignal: 'mid-range',
    rawPrompt: 'test query',
    confidence: 0.5,
    clarificationNeeded: false,
    clarificationMessage: null,
    services: [],
    ...overrides,
  }
}

// ─── routeIntent() ────────────────────────────────────────────────────────────

describe('routeIntent()', () => {
  const SAVED_API_KEY = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    // Ensure redis.get returns null (falsy) so no stale cache hits bleed through
    const { redis } = require('@/lib/cache/redis')
    redis.get.mockResolvedValue(null)
    // Set API key by default so LLM path is exercised
    process.env.ANTHROPIC_API_KEY = 'sk-test'
  })

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = SAVED_API_KEY
  })

  it('returns known_service when confidence is high and activityTypes are known', async () => {
    const intent = makeIntent({ activityTypes: ['flights', 'stays'], confidence: 0.8 })
    const result = await routeIntent('flights to Paris', intent)
    expect(result.route).toBe('known_service')
    expect(result.intent).toBe(intent)
  })

  it('returns clarification when clarificationNeeded is true', async () => {
    const intent = makeIntent({ clarificationNeeded: true, activityTypes: ['flights'], confidence: 0.9 })
    const result = await routeIntent('flights to Paris', intent)
    expect(result.route).toBe('clarification')
  })

  it('classifies unknown query via LLM and returns open_ended when matched services found', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          route: 'known_service',
          matchedServices: ['products'],
          suggestions: ['Did you mean shopping?'],
          webSearchQuery: null,
          confidence: 0.7,
        }),
      }],
    })

    const intent = makeIntent({ activityTypes: [], confidence: 0.2 })
    const result = await routeIntent('buy a new camera lens', intent)

    expect(['known_service', 'open_ended']).toContain(result.route)
    expect(result.intent.activityTypes).toContain('products')
  })

  it('returns web_search when LLM classifies as web_search with no skipWebSearch provider', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          route: 'web_search',
          matchedServices: [],
          suggestions: [],
          webSearchQuery: 'best programming books 2026',
          confidence: 0.3,
        }),
      }],
    })

    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    const result = await routeIntent('what are the best programming books', intent)

    expect(result.route).toBe('web_search')
    expect(result.webSearchQuery).toBeDefined()
    expect(result.synthesizedCards).toEqual([])
  })

  it('calls web search provider and returns synthesized cards', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          route: 'web_search',
          matchedServices: [],
          suggestions: [],
          webSearchQuery: 'typescript tips',
          confidence: 0.2,
        }),
      }],
    })

    const mockCards = [{ id: 'ws_abc', title: 'TypeScript Tips', snippet: '...', url: 'https://example.com', sourceType: 'web_result', relevanceScore: 0.8 }]
    const provider = { search: jest.fn().mockResolvedValueOnce(mockCards) }

    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    const result = await routeIntent('typescript tips', intent, { webSearchProvider: provider })

    expect(result.synthesizedCards).toEqual(mockCards)
    expect(provider.search).toHaveBeenCalledWith('typescript tips')
  })

  it('skips web search when skipWebSearch is true', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          route: 'web_search',
          matchedServices: [],
          suggestions: [],
          webSearchQuery: 'some query',
          confidence: 0.1,
        }),
      }],
    })

    const provider = { search: jest.fn() }
    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    const result = await routeIntent('some query', intent, { skipWebSearch: true, webSearchProvider: provider })

    expect(result.route).toBe('web_search')
    expect(result.synthesizedCards).toEqual([])
    expect(provider.search).not.toHaveBeenCalled()
  })

  it('returns web_search fallback when no ANTHROPIC_API_KEY is set', async () => {
    delete process.env.ANTHROPIC_API_KEY  // afterEach restores it

    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    const result = await routeIntent('anything', intent)

    expect(result.route).toBe('web_search')
  })

  it('returns web_search fallback when LLM response has no JSON', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot classify this.' }],
    })

    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    // Use a unique prompt to avoid any cross-test cache collision
    const result = await routeIntent('unique-no-json-fallback-prompt-xyz', intent)
    expect(result.route).toBe('web_search')
  })

  it('returns suggestions from LLM response', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          route: 'open_ended',
          matchedServices: [],
          suggestions: ['Search flights', 'Book a hotel', 'Find experiences'],
          webSearchQuery: null,
          confidence: 0.4,
        }),
      }],
    })

    const intent = makeIntent({ activityTypes: [], confidence: 0.2 })
    const result = await routeIntent('i want to travel', intent)
    expect(result.suggestions?.length).toBeGreaterThan(0)
    expect(result.suggestions!.length).toBeLessThanOrEqual(3)
  })

  it('filters out unknown activity types from LLM response', async () => {
    const Anthropic = require('@anthropic-ai/sdk')
    Anthropic._mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          route: 'known_service',
          matchedServices: ['flights', 'fake_service', 'unicorns'],
          suggestions: [],
          webSearchQuery: null,
          confidence: 0.8,
        }),
      }],
    })

    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    const result = await routeIntent('fly somewhere', intent)
    expect(result.intent.activityTypes).toEqual(['flights'])
    expect(result.intent.activityTypes).not.toContain('fake_service')
  })

  it('serves cached result on second call', async () => {
    const { redis } = require('@/lib/cache/redis')
    const cached = { intent: makeIntent(), route: 'known_service', suggestions: [] }
    redis.get.mockResolvedValueOnce(cached)

    const intent = makeIntent({ activityTypes: [], confidence: 0.1 })
    const result = await routeIntent('anything cached', intent)
    expect(result).toEqual(cached)
  })
})

// ─── buildWebSearchCardId() ───────────────────────────────────────────────────

describe('buildWebSearchCardId()', () => {
  it('returns a string starting with "ws_"', () => {
    const id = buildWebSearchCardId('https://example.com/page')
    expect(id).toMatch(/^ws_[a-f0-9]{12}$/)
  })

  it('is deterministic for the same URL', () => {
    const url = 'https://example.com/product'
    expect(buildWebSearchCardId(url)).toBe(buildWebSearchCardId(url))
  })

  it('produces different IDs for different URLs', () => {
    expect(buildWebSearchCardId('https://a.com')).not.toBe(buildWebSearchCardId('https://b.com'))
  })
})

// ─── isKnownActivityType() ────────────────────────────────────────────────────

describe('isKnownActivityType()', () => {
  it('returns true for all 12 known types', () => {
    const known = [
      'flights', 'stays', 'cars', 'experiences', 'restaurants',
      'weather', 'maps', 'products', 'digital_services',
      'home_services', 'health_services', 'appointments',
    ]
    known.forEach(t => expect(isKnownActivityType(t)).toBe(true))
  })

  it('returns false for unknown strings', () => {
    expect(isKnownActivityType('web_search')).toBe(false)
    expect(isKnownActivityType('unicorns')).toBe(false)
    expect(isKnownActivityType('')).toBe(false)
  })
})
