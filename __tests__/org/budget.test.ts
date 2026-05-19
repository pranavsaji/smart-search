export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
    }),
  })),
  COLLECTIONS: { organisations: 'organisations' },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { checkBudget, recordSpend, resetBudgetPeriod, getBudgetUsagePercent, isPeriodExpired } from '@/lib/org/budget'
import type { BudgetLimit, Organisation } from '@/lib/org/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLimit(overrides: Partial<BudgetLimit> = {}): BudgetLimit {
  return {
    limitId: 'lim_001',
    periodType: 'monthly',
    limitCents: 100000,
    currency: 'GBP',
    currentSpendCents: 0,
    periodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),  // 5 days ago
    alertThresholdPercent: 80,
    ...overrides,
  }
}

function makeOrg(limits: BudgetLimit[] = []): Organisation {
  return {
    orgId: 'org_001',
    name: 'Acme',
    ownerId: 'user-owner',
    members: [
      { userId: 'user-member', email: 'm@acme.com', role: 'member', joinedAt: new Date() },
    ],
    budgetLimits: limits,
    approvalRules: [],
    consolidatedBilling: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// ─── checkBudget() ────────────────────────────────────────────────────────────

describe('checkBudget()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('allows purchase when within budget', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg([makeLimit({ currentSpendCents: 30000 })]))

    const result = await checkBudget('org_001', 'user-member', 20000, 'GBP')
    expect(result.allowed).toBe(true)
    expect(result.remainingCents).toBe(50000)  // 100000 - 30000 - 20000
    expect(result.limitCents).toBe(100000)
  })

  it('blocks purchase when it would exceed budget', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg([makeLimit({ currentSpendCents: 90000 })]))

    const result = await checkBudget('org_001', 'user-member', 20000, 'GBP')
    expect(result.allowed).toBe(false)
    expect(result.remainingCents).toBe(10000)
  })

  it('allows purchase exactly at limit boundary', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg([makeLimit({ currentSpendCents: 80000 })]))

    const result = await checkBudget('org_001', 'user-member', 20000, 'GBP')
    expect(result.allowed).toBe(true)
    expect(result.remainingCents).toBe(0)
  })

  it('triggers alert when crossing threshold', async () => {
    // Currently at 75000 (75%), threshold is 80% — 20000 more would put at 95%
    mockFindOne.mockResolvedValueOnce(makeOrg([makeLimit({ currentSpendCents: 75000 })]))

    const result = await checkBudget('org_001', 'user-member', 10000, 'GBP')
    expect(result.alertTriggered).toBe(true)
  })

  it('does not trigger alert when already over threshold', async () => {
    // Already at 90% — no new alert
    mockFindOne.mockResolvedValueOnce(makeOrg([makeLimit({ currentSpendCents: 90000 })]))

    const result = await checkBudget('org_001', 'user-member', 5000, 'GBP')
    // blocked, so alertTriggered is irrelevant — but should be false
    expect(result.alertTriggered).toBe(false)
  })

  it('returns allowed=true with Infinity when no limits configured', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg([]))

    const result = await checkBudget('org_001', 'user-member', 999999, 'GBP')
    expect(result.allowed).toBe(true)
    expect(result.remainingCents).toBe(Infinity)
  })

  it('ignores limits in a different currency', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg([makeLimit({ currency: 'USD' })]))

    const result = await checkBudget('org_001', 'user-member', 999999, 'GBP')
    expect(result.allowed).toBe(true)
  })

  it('returns allowed=true when org not found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const result = await checkBudget('org_missing', 'user-member', 50000, 'GBP')
    expect(result.allowed).toBe(true)
  })
})

// ─── recordSpend() ────────────────────────────────────────────────────────────

describe('recordSpend()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls updateOne with $inc on matching limits', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await recordSpend('org_001', 25000, 'GBP')

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { orgId: 'org_001' },
      expect.objectContaining({
        $inc: { 'budgetLimits.$[elem].currentSpendCents': 25000 },
      }),
      expect.objectContaining({ arrayFilters: expect.any(Array) })
    )
  })
})

// ─── resetBudgetPeriod() ──────────────────────────────────────────────────────

describe('resetBudgetPeriod()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('resets currentSpendCents to zero and updates periodStart', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    const result = await resetBudgetPeriod('org_001', 'lim_001')

    expect(result).toBe(true)
    const call = mockUpdateOne.mock.calls[0]
    expect(call[0]).toEqual({ orgId: 'org_001', 'budgetLimits.limitId': 'lim_001' })
    expect(call[1].$set['budgetLimits.$.currentSpendCents']).toBe(0)
    expect(call[1].$set['budgetLimits.$.periodStart']).toBeInstanceOf(Date)
  })

  it('returns false when limit not found', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 0 })
    const result = await resetBudgetPeriod('org_001', 'lim_missing')
    expect(result).toBe(false)
  })
})

// ─── getBudgetUsagePercent() ──────────────────────────────────────────────────

describe('getBudgetUsagePercent()', () => {
  it('calculates correct percentage', () => {
    expect(getBudgetUsagePercent(makeLimit({ currentSpendCents: 25000 }))).toBe(25)
    expect(getBudgetUsagePercent(makeLimit({ currentSpendCents: 100000 }))).toBe(100)
    expect(getBudgetUsagePercent(makeLimit({ currentSpendCents: 0 }))).toBe(0)
  })

  it('caps at 100% even when over-budget', () => {
    expect(getBudgetUsagePercent(makeLimit({ currentSpendCents: 150000 }))).toBe(100)
  })

  it('returns 100 when limitCents is zero (defensive)', () => {
    expect(getBudgetUsagePercent(makeLimit({ limitCents: 0 }))).toBe(100)
  })
})

// ─── isPeriodExpired() ────────────────────────────────────────────────────────

describe('isPeriodExpired()', () => {
  it('returns false within the period', () => {
    const limit = makeLimit({
      periodType: 'monthly',
      periodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    })
    expect(isPeriodExpired(limit)).toBe(false)
  })

  it('returns true when monthly period has passed', () => {
    const limit = makeLimit({
      periodType: 'monthly',
      periodStart: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    })
    expect(isPeriodExpired(limit)).toBe(true)
  })

  it('returns true when annual period has passed', () => {
    const limit = makeLimit({
      periodType: 'annual',
      periodStart: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000),
    })
    expect(isPeriodExpired(limit)).toBe(true)
  })
})
