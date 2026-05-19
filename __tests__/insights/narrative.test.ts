export {}

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { mockNarrative, generateNarrative, type Narrative } from '@/lib/insights/narrative'
import type { InsightStats } from '@/lib/insights/types'

function stats(overrides: Partial<InsightStats> = {}): InsightStats {
  return {
    userId: 'u1',
    periodStart: '2026-05-21',
    periodEnd: '2026-05-28',
    currency: 'GBP',
    orderCount: 2,
    totalSpentCents: 35000,
    byCategory: [{ activityType: 'flights', orders: 1, spentCents: 30000 }, { activityType: 'products', orders: 1, spentCents: 5000 }],
    topDestinations: ['Paris', 'Tokyo'],
    savingsVsMarketCents: 4000,
    genieInteractions: 1,
    ...overrides,
  }
}

describe('mockNarrative', () => {
  it('summarises an active period with money + category', () => {
    const n = mockNarrative(stats())
    expect(n.headline).toMatch(/2 bookings/)
    expect(n.narrative).toMatch(/£350\.00/)
    expect(n.narrative).toMatch(/flights/)
    expect(n.narrative).toMatch(/saved/i)
  })

  it('handles a quiet period gracefully', () => {
    const n = mockNarrative(stats({ orderCount: 0, totalSpentCents: 0, byCategory: [], topDestinations: [], savingsVsMarketCents: 0, genieInteractions: 0 }))
    expect(n.headline).toMatch(/quiet/i)
    expect(n.narrative).toMatch(/No bookings/i)
  })

  it('singularises a single booking', () => {
    const n = mockNarrative(stats({ orderCount: 1 }))
    expect(n.headline).toMatch(/1 booking\b/)
  })

  it('omits savings line when there are no savings', () => {
    const n = mockNarrative(stats({ savingsVsMarketCents: 0 }))
    expect(n.narrative).not.toMatch(/saved/i)
  })
})

describe('generateNarrative', () => {
  const prevKey = process.env.ANTHROPIC_API_KEY
  afterEach(() => {
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prevKey
  })

  it('falls back to the deterministic mock when no API key is set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const n: Narrative = await generateNarrative(stats())
    expect(n).toEqual(mockNarrative(stats()))
  })
})
