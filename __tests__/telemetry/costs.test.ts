export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockAggregate = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: async () => ({
    collection: () => ({
      insertOne: (...a: unknown[]) => mockInsertOne(...a),
      aggregate: (...a: unknown[]) => ({ toArray: async () => mockAggregate(...a) }),
    }),
  }),
  COLLECTIONS: { apiCosts: 'api_costs' },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  estimateCostCents,
  utcDay,
  trackLLMCost,
  trackAPICall,
  getDailyCosts,
} from '@/lib/telemetry/costs'

beforeEach(() => {
  jest.clearAllMocks()
  mockInsertOne.mockResolvedValue({ acknowledged: true })
  mockAggregate.mockResolvedValue([])
})

// ─── estimateCostCents() ─────────────────────────────────────────────────────

describe('estimateCostCents()', () => {
  it('prices a known model from its published rate', () => {
    // Haiku: $0.80/Mtok in, $4/Mtok out.
    // 1M in + 1M out = $4.80 = 480 cents.
    expect(estimateCostCents('claude-3-5-haiku-20241022', 1_000_000, 1_000_000))
      .toBeCloseTo(480, 4)
  })

  it('scales linearly with token count', () => {
    const one = estimateCostCents('llama-3.3-70b-versatile', 1000, 1000)
    const ten = estimateCostCents('llama-3.3-70b-versatile', 10_000, 10_000)
    expect(ten).toBeCloseTo(one * 10, 6)
  })

  it('charges input and output at different rates', () => {
    const inputHeavy = estimateCostCents('claude-3-5-haiku-20241022', 1_000_000, 0)
    const outputHeavy = estimateCostCents('claude-3-5-haiku-20241022', 0, 1_000_000)
    expect(outputHeavy).toBeGreaterThan(inputHeavy)
  })

  it('bills an unknown model rather than reporting it as free', () => {
    // A zero fallback is how real spend goes unnoticed after a model rename.
    expect(estimateCostCents('some-new-model', 1_000_000, 1_000_000)).toBeGreaterThan(0)
  })

  it('keeps sub-cent precision instead of rounding small calls to zero', () => {
    const cost = estimateCostCents('llama-3.1-8b-instant', 500, 200)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(1)
  })

  it('returns zero for a zero-token call', () => {
    expect(estimateCostCents('claude-3-5-haiku-20241022', 0, 0)).toBe(0)
  })
})

// ─── utcDay() ────────────────────────────────────────────────────────────────

describe('utcDay()', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-08-25T13:45:00Z'))).toBe('2026-08-25')
  })

  it('groups by UTC, not local time', () => {
    // Late-UTC timestamps must not land on the next/previous day for the
    // rollup depending on where the server happens to run.
    expect(utcDay(new Date('2026-08-25T23:59:59Z'))).toBe('2026-08-25')
    expect(utcDay(new Date('2026-08-26T00:00:01Z'))).toBe('2026-08-26')
  })
})

// ─── trackLLMCost() ──────────────────────────────────────────────────────────

describe('trackLLMCost()', () => {
  it('persists the computed cost alongside the token counts', async () => {
    await trackLLMCost({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      inputTokens: 1000,
      outputTokens: 500,
    })

    const [doc] = mockInsertOne.mock.calls[0] as [Record<string, unknown>]
    expect(doc).toMatchObject({
      kind: 'llm',
      provider: 'anthropic',
      inputTokens: 1000,
      outputTokens: 500,
    })
    expect(doc.costCents).toBeGreaterThan(0)
    expect(doc.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('omits userId entirely when not supplied', async () => {
    await trackLLMCost({ provider: 'groq', model: 'x', inputTokens: 1, outputTokens: 1 })
    const [doc] = mockInsertOne.mock.calls[0] as [Record<string, unknown>]
    expect('userId' in doc).toBe(false)
  })

  it('swallows database failures — telemetry must not fail the request', async () => {
    mockInsertOne.mockRejectedValue(new Error('mongo down'))
    await expect(
      trackLLMCost({ provider: 'groq', model: 'x', inputTokens: 1, outputTokens: 1 })
    ).resolves.toBeUndefined()
  })
})

// ─── trackAPICall() ──────────────────────────────────────────────────────────

describe('trackAPICall()', () => {
  it('records the call with its duration and defaults ok to true', async () => {
    await trackAPICall({ service: 'duffel', endpoint: '/offers', durationMs: 420 })
    const [doc] = mockInsertOne.mock.calls[0] as [Record<string, unknown>]
    expect(doc).toMatchObject({ kind: 'api', service: 'duffel', durationMs: 420, ok: true })
  })

  it('records failures as ok:false', async () => {
    await trackAPICall({ service: 'duffel', endpoint: '/offers', durationMs: 5, ok: false })
    const [doc] = mockInsertOne.mock.calls[0] as [Record<string, unknown>]
    expect(doc).toMatchObject({ ok: false })
  })

  it('swallows database failures', async () => {
    mockInsertOne.mockRejectedValue(new Error('mongo down'))
    await expect(
      trackAPICall({ service: 'x', endpoint: '/y', durationMs: 1 })
    ).resolves.toBeUndefined()
  })
})

// ─── getDailyCosts() ─────────────────────────────────────────────────────────

describe('getDailyCosts()', () => {
  it('sums per-provider spend within a day', async () => {
    mockAggregate.mockResolvedValue([
      {
        _id: '2026-08-25',
        totalCostCents: 12.5,
        byProvider: [
          { provider: 'anthropic', cost: 10 },
          { provider: 'groq', cost: 2.5 },
        ],
        llmCalls: 2,
        apiCalls: 0,
      },
    ])

    const [day] = await getDailyCosts(7)
    expect(day.day).toBe('2026-08-25')
    expect(day.byProvider).toEqual({ anthropic: 10, groq: 2.5 })
    expect(day.llmCalls).toBe(2)
  })

  it('merges repeated providers rather than keeping only the last', async () => {
    mockAggregate.mockResolvedValue([
      {
        _id: '2026-08-25',
        totalCostCents: 6,
        byProvider: [
          { provider: 'groq', cost: 2 },
          { provider: 'groq', cost: 4 },
        ],
        llmCalls: 2,
        apiCalls: 0,
      },
    ])

    const [day] = await getDailyCosts()
    expect(day.byProvider).toEqual({ groq: 6 })
  })

  it('returns an empty list when nothing was recorded', async () => {
    mockAggregate.mockResolvedValue([])
    await expect(getDailyCosts()).resolves.toEqual([])
  })
})
