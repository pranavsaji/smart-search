export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockToArray = jest.fn()
const mockCount = jest.fn()
const mockUpdateOne = jest.fn()
const mockFindOne = jest.fn()
const mockDistinct = jest.fn()

function findChain() {
  const chain = { sort: () => chain, limit: () => chain, toArray: mockToArray }
  return chain
}

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      find: () => findChain(),
      countDocuments: mockCount,
      updateOne: mockUpdateOne,
      findOne: mockFindOne,
      distinct: mockDistinct,
    }),
  })),
  COLLECTIONS: {
    vendorOrders: 'vendor_orders', stages: 'stages', agentTasks: 'agent_tasks',
    insightReports: 'insight_reports', users: 'users',
  },
}))

const mockNotify = jest.fn()
jest.mock('@/lib/sse/notify', () => ({ notifyInsightReady: (...a: unknown[]) => mockNotify(...a) }))

const mockSendMail = jest.fn()
jest.mock('@/lib/mail', () => ({ sendWeeklyInsights: (...a: unknown[]) => mockSendMail(...a) }))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `I${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  buildUserInsightStats,
  generateInsightReport,
  getUserInsights,
  sendWeeklyInsightsForUser,
  scanAllWeeklyInsights,
} from '@/lib/insights/generate'

const NOW = new Date('2026-05-28T00:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  delete process.env.ANTHROPIC_API_KEY // force deterministic narrative
  mockToArray.mockResolvedValue([])
  mockCount.mockResolvedValue(0)
  mockUpdateOne.mockResolvedValue({ upsertedCount: 1 })
  mockFindOne.mockResolvedValue(null)
  mockDistinct.mockResolvedValue([])
  mockNotify.mockResolvedValue(undefined)
  mockSendMail.mockResolvedValue(undefined)
})

// ─── buildUserInsightStats ─────────────────────────────────────────────────────

describe('buildUserInsightStats', () => {
  it('reduces orders into totals, categories and savings', async () => {
    mockToArray
      .mockResolvedValueOnce([
        {
          totalAmount: 30000,
          currency: 'GBP',
          items: [
            { activityType: 'flights', price: 30000, quantity: 1, marketPriceCents: 34000 },
          ],
        },
        {
          totalAmount: 5000,
          currency: 'GBP',
          items: [{ category: 'products', price: 2500, quantity: 2 }],
        },
      ]) // orders
      .mockResolvedValueOnce([{ parsedIntent: { destination: 'Paris' } }, { parsedIntent: { destination: 'Paris' } }]) // stages
    mockCount.mockResolvedValueOnce(3) // genie tasks

    const s = await buildUserInsightStats('u1', { now: NOW })
    expect(s.orderCount).toBe(2)
    expect(s.totalSpentCents).toBe(35000)
    expect(s.savingsVsMarketCents).toBe(4000) // (34000-30000)*1
    expect(s.byCategory.map(c => c.activityType)).toContain('flights')
    expect(s.topDestinations).toEqual(['Paris'])
    expect(s.genieInteractions).toBe(3)
  })

  it('returns an empty-but-valid shape with no activity', async () => {
    const s = await buildUserInsightStats('u1', { now: NOW })
    expect(s.orderCount).toBe(0)
    expect(s.totalSpentCents).toBe(0)
    expect(s.byCategory).toEqual([])
  })
})

// ─── generateInsightReport ─────────────────────────────────────────────────────

describe('generateInsightReport', () => {
  it('returns null when there is nothing to report', async () => {
    const report = await generateInsightReport('u1', { now: NOW })
    expect(report).toBeNull()
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  it('forces a report even with zero orders when force=true', async () => {
    const report = await generateInsightReport('u1', { now: NOW, force: true })
    expect(report).not.toBeNull()
    expect(mockUpdateOne).toHaveBeenCalled()
  })

  it('persists idempotently keyed on (userId, periodStart)', async () => {
    mockToArray.mockResolvedValueOnce([{ totalAmount: 1000, currency: 'GBP', items: [{ category: 'products', price: 1000, quantity: 1 }] }])
    const report = await generateInsightReport('u1', { now: NOW })
    expect(report).not.toBeNull()
    const filter = mockUpdateOne.mock.calls[0][0]
    expect(filter).toHaveProperty('userId', 'u1')
    expect(filter).toHaveProperty('periodStart')
    expect(mockUpdateOne.mock.calls[0][2]).toEqual({ upsert: true })
  })
})

// ─── getUserInsights ───────────────────────────────────────────────────────────

describe('getUserInsights', () => {
  it('lists reports', async () => {
    mockToArray.mockResolvedValueOnce([{ reportId: 'insight_1' }])
    expect(await getUserInsights('u1')).toHaveLength(1)
  })
})

// ─── sendWeeklyInsightsForUser ───────────────────────────────────────────────────

describe('sendWeeklyInsightsForUser', () => {
  it('does nothing when no report is produced', async () => {
    const res = await sendWeeklyInsightsForUser('u1', { now: NOW })
    expect(res.sent).toBe(false)
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('emails + notifies when a report exists and the user has an email', async () => {
    mockToArray
      .mockResolvedValueOnce([{ totalAmount: 1000, currency: 'GBP', items: [{ category: 'products', price: 1000, quantity: 1 }] }]) // orders
      .mockResolvedValueOnce([]) // stages
    mockCount.mockResolvedValueOnce(0)
    mockFindOne.mockResolvedValueOnce({ email: 'a@b.com', name: 'Ann' }) // user contact

    const res = await sendWeeklyInsightsForUser('u1', { now: NOW })
    expect(res.sent).toBe(true)
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockSendMail.mock.calls[0][0].to).toBe('a@b.com')
  })

  it('still notifies (SSE) when the user has no email', async () => {
    mockToArray
      .mockResolvedValueOnce([{ totalAmount: 1000, currency: 'GBP', items: [{ category: 'products', price: 1000, quantity: 1 }] }])
      .mockResolvedValueOnce([])
    mockCount.mockResolvedValueOnce(0)
    mockFindOne.mockResolvedValueOnce(null) // no user

    const res = await sendWeeklyInsightsForUser('u1', { now: NOW })
    expect(res.sent).toBe(true)
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})

// ─── scanAllWeeklyInsights ───────────────────────────────────────────────────────

describe('scanAllWeeklyInsights', () => {
  it('iterates distinct users with completed orders', async () => {
    mockDistinct.mockResolvedValueOnce(['u1', 'u2'])
    // Each user: orders, stages, genie count, (no report → no contact lookup)
    mockToArray.mockResolvedValue([]) // no orders for anyone → sent stays 0
    const res = await scanAllWeeklyInsights({ now: NOW })
    expect(res.users).toBe(2)
    expect(res.sent).toBe(0)
  })
})
