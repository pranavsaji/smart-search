// Mock heavy external modules before any imports
jest.mock('@/lib/cache/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(null),
  },
  RedisKeys: jest.requireActual('@/lib/cache/redis').RedisKeys,
}))

jest.mock('@/lib/intent/providers/groq', () => ({
  groqPhaseA: jest.fn(),
  groqPhaseB: jest.fn(),
}))

jest.mock('@/lib/intent/providers/claude', () => ({
  claudePhaseA: jest.fn(),
  claudePhaseB: jest.fn(),
}))

jest.mock('@/lib/config/env', () => ({
  env: {
    AI_PROVIDER: jest.fn().mockReturnValue('groq'),
    GROQ_API_KEY: jest.fn().mockReturnValue('test-key'),
    GROQ_MODEL: jest.fn().mockReturnValue('llama-3.1-70b-versatile'),
    GROQ_MODEL_LIGHT: jest.fn().mockReturnValue('llama-3.1-8b-instant'),
    ANTHROPIC_API_KEY: jest.fn().mockReturnValue('test-key'),
  },
}))

import { parseIntent, parseIntentFromMessages } from '@/lib/intent/parser'
import { groqPhaseA, groqPhaseB } from '@/lib/intent/providers/groq'
import { claudePhaseA, claudePhaseB } from '@/lib/intent/providers/claude'
import { redis } from '@/lib/cache/redis'

const mockGroqPhaseA = groqPhaseA as jest.MockedFunction<typeof groqPhaseA>
const mockGroqPhaseB = groqPhaseB as jest.MockedFunction<typeof groqPhaseB>
const mockClaudePhaseA = claudePhaseA as jest.MockedFunction<typeof claudePhaseA>
const mockClaudePhaseB = claudePhaseB as jest.MockedFunction<typeof claudePhaseB>
const mockRedisGet = redis.get as jest.MockedFunction<typeof redis.get>
const mockRedisSet = redis.set as jest.MockedFunction<typeof redis.set>

function makePhaseAResponse(overrides = {}) {
  return JSON.stringify({
    summary: 'Flight to Tokyo',
    services: ['flights', 'stays'],
    extracted: {
      destination: 'Tokyo',
      originCity: 'London',
      departureDate: '2025-08-01',
      destination_stage: null,
      brand: null,
      collaborator: null,
    },
    ...overrides,
  })
}

function makePhaseBResponse(overrides = {}) {
  return JSON.stringify({
    destination: 'Tokyo',
    origin: 'London',
    dates: { start: '2025-08-01', end: '2025-08-07' },
    groupSize: 1,
    budgetSignal: 'mid-range',
    constraints: [],
    activityTypes: ['flights', 'stays'],
    genieServices: [],
    confidence: 0.9,
    summary: 'Flight to Tokyo + hotel',
    companions: [],
    clarificationNeeded: false,
    clarificationMessage: null,
    services: [],
    ...overrides,
  })
}

describe('intent pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue(null as unknown as 'OK')
  })

  describe('parseIntent (single prompt)', () => {
    it('calls Phase A then Phase B and returns ParsedIntent', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      const result = await parseIntent('fly from London to Tokyo next month', 'alice')

      expect(mockGroqPhaseA).toHaveBeenCalledTimes(1)
      expect(mockGroqPhaseB).toHaveBeenCalledTimes(1)
      expect(result.destination).toBe('Tokyo')
      expect(result.activityTypes).toContain('flights')
    })

    it('sets rawPrompt to the original user message', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      const result = await parseIntent('fly from London to Tokyo', 'alice')
      expect(result.rawPrompt).toContain('fly from London to Tokyo')
    })

    it('attaches _phaseA debug metadata to result', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      const result = await parseIntent('fly to Tokyo', 'alice') as import('@/lib/intent/types').ParsedIntent & { _phaseA?: unknown }
      expect(result._phaseA).toBeDefined()
    })
  })

  describe('Phase A and Phase B param mapping', () => {
    it('when Phase A returns flights+stays, Phase B maps params correctly', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse({
        services: ['flights', 'stays', 'weather'],
      }))
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse({
        activityTypes: ['flights', 'stays', 'weather'],
        destination: 'Tokyo',
        origin: 'London',
      }))

      const result = await parseIntent('fly from London to Tokyo and book a hotel', 'alice')

      expect(result.activityTypes).toContain('flights')
      expect(result.activityTypes).toContain('stays')
      expect(result.destination).toBe('Tokyo')
      expect(result.origin).toBe('London')
    })

    it('injects weather and maps for travel with named destination', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse({ services: ['flights', 'stays'] }))
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse({
        activityTypes: ['flights', 'stays'],
        destination: 'Paris',
      }))

      const result = await parseIntent('fly to Paris and stay', 'alice')

      // parsePhaseBResponse injects weather + maps for travel with named destination
      expect(result.activityTypes).toContain('weather')
      expect(result.activityTypes).toContain('maps')
    })
  })

  describe('fallback to regex heuristics', () => {
    it('falls back to regex heuristics when AI provider throws', async () => {
      mockGroqPhaseA.mockRejectedValue(new Error('API error'))
      mockClaudePhaseA.mockRejectedValue(new Error('Claude also down'))
      mockGroqPhaseB.mockRejectedValue(new Error('API error'))
      mockClaudePhaseB.mockRejectedValue(new Error('Claude also down'))

      const result = await parseIntent('fly from London to Tokyo next month', 'alice')

      // Should not throw and should return a ParsedIntent with some data
      expect(result).toBeDefined()
      expect(result.rawPrompt).toBeDefined()
      expect(result.participants.length).toBeGreaterThanOrEqual(1)
    })

    it('fallback result has confidence 0.5', async () => {
      mockGroqPhaseA.mockRejectedValue(new Error('API error'))
      mockClaudePhaseA.mockRejectedValue(new Error('Claude also down'))

      const result = await parseIntent('fly to Paris', 'alice')
      expect(result.confidence).toBe(0.5)
    })

    it('fallback detects flights keyword', async () => {
      mockGroqPhaseA.mockRejectedValue(new Error('API error'))
      mockClaudePhaseA.mockRejectedValue(new Error('Claude also down'))

      const result = await parseIntent('I want to fly to Paris for a trip', 'alice')
      expect(result.activityTypes).toContain('flights')
    })
  })

  describe('parseIntentFromMessages', () => {
    it('works with message array format', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      const result = await parseIntentFromMessages(
        [{ role: 'user', content: 'fly to Paris' }],
        'alice'
      )

      expect(result).toBeDefined()
      expect(result.destination).toBe('Tokyo') // from mock response
    })

    it('includes multiple user messages', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      const result = await parseIntentFromMessages(
        [
          { role: 'user', content: 'fly to Paris' },
          { role: 'assistant', content: 'Got it, searching for flights...' },
          { role: 'user', content: 'make it business class' },
        ],
        'alice'
      )

      expect(result).toBeDefined()
      expect(mockGroqPhaseA).toHaveBeenCalledTimes(1)
    })
  })

  describe('Redis cache', () => {
    it('returns cached result without calling AI providers on cache hit', async () => {
      const cachedResult = {
        destination: 'Cached City',
        activityTypes: ['flights'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
        participants: [{ handle: 'alice', userId: null, intentGraph: null }],
        groupSize: 1,
        budgetSignal: 'mid-range',
        constraints: [],
        genieServices: [],
        rawPrompt: 'fly to cached city',
        confidence: 0.9,
        clarificationNeeded: false,
        clarificationMessage: null,
        services: [],
      }
      mockRedisGet.mockResolvedValue(cachedResult)

      const result = await parseIntent('fly to cached city', 'alice')

      expect(result.destination).toBe('Cached City')
      expect(mockGroqPhaseA).not.toHaveBeenCalled()
      expect(mockGroqPhaseB).not.toHaveBeenCalled()
      expect(mockClaudePhaseA).not.toHaveBeenCalled()
      expect(mockClaudePhaseB).not.toHaveBeenCalled()
    })

    it('caches result after successful AI parse', async () => {
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      await parseIntent('fly to Tokyo for a week', 'alice')

      expect(mockRedisSet).toHaveBeenCalled()
    })

    it('proceeds without cache when redis returns null', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockGroqPhaseA.mockResolvedValue(makePhaseAResponse())
      mockGroqPhaseB.mockResolvedValue(makePhaseBResponse())

      const result = await parseIntent('fly to Tokyo', 'alice')

      expect(mockGroqPhaseA).toHaveBeenCalledTimes(1)
      expect(result).toBeDefined()
    })
  })
})
