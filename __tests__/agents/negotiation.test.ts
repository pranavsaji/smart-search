export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      find: () => ({ sort: () => ({ limit: () => ({ toArray: mockFind }) }) }),
    }),
  })),
  COLLECTIONS: { negotiations: 'negotiations' },
}))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

let seq = 0
jest.mock('nanoid', () => ({ nanoid: () => `NEG${seq++}` }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  buildSession,
  agentOfferForRound,
  negotiate,
  MockVendorNegotiator,
  createAndRunNegotiation,
  getNegotiation,
  getUserNegotiations,
  BudgetError,
  type VendorNegotiator,
  type NegotiationSession,
} from '@/lib/agents/negotiation'

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
})

const baseInput = {
  userId: 'user-1',
  vendorId: 'vend-1',
  vendorType: 'experiences',
  itemRef: 'offer-1',
  currency: 'GBP',
  listPriceCents: 20_000,
  maxBudgetCents: 15_000,
}

// ─── buildSession ──────────────────────────────────────────────────────────

describe('buildSession', () => {
  it('defaults target to 85% of budget, never above budget', () => {
    const s = buildSession(baseInput)
    expect(s.targetPriceCents).toBe(Math.floor(15_000 * 0.85))
    expect(s.status).toBe('in_progress')
    expect(s.offers).toEqual([])
  })

  it('clamps an over-budget target down to the budget', () => {
    const s = buildSession({ ...baseInput, targetPriceCents: 99_999 })
    expect(s.targetPriceCents).toBe(15_000)
  })

  it('rejects non-positive budget and list price', () => {
    expect(() => buildSession({ ...baseInput, maxBudgetCents: 0 })).toThrow(BudgetError)
    expect(() => buildSession({ ...baseInput, listPriceCents: -1 })).toThrow(BudgetError)
  })
})

// ─── agentOfferForRound — the budget invariant ───────────────────────────────

describe('agentOfferForRound', () => {
  it('opens below target and concedes toward the budget ceiling', () => {
    const s = buildSession({ ...baseInput, maxRounds: 5 })
    const r1 = agentOfferForRound(s, 1)
    const r5 = agentOfferForRound(s, 5)
    expect(r1).toBeLessThan(r5)
    expect(r1).toBe(Math.floor(s.targetPriceCents * 0.8))
  })

  it('NEVER offers above maxBudgetCents across all rounds', () => {
    const s = buildSession({ ...baseInput, maxRounds: 10 })
    for (let round = 1; round <= 10; round++) {
      expect(agentOfferForRound(s, round)).toBeLessThanOrEqual(s.maxBudgetCents)
    }
  })
})

// ─── negotiate (pure loop) ───────────────────────────────────────────────────

describe('negotiate', () => {
  it('reaches a deal within budget against the mock vendor', async () => {
    const s = buildSession({ ...baseInput })
    const result = await negotiate(s, new MockVendorNegotiator(0.65))
    expect(result.status).toBe('accepted')
    expect(result.agreedPriceCents!).toBeLessThanOrEqual(s.maxBudgetCents)
    // audit log records both parties
    expect(result.offers.some(o => o.party === 'agent')).toBe(true)
    expect(result.offers.some(o => o.party === 'vendor')).toBe(true)
  })

  it('rejects when the vendor floor is above budget', async () => {
    // floor = 20000 * 0.95 = 19000 > budget 15000 → never agrees
    const s = buildSession({ ...baseInput })
    const result = await negotiate(s, new MockVendorNegotiator(0.95))
    expect(result.status).toBe('rejected')
    expect(result.agreedPriceCents).toBeUndefined()
  })

  it('never agrees above budget even when vendor would accept higher', async () => {
    const greedyVendor: VendorNegotiator = {
      async negotiate() {
        return { accept: false, counterPriceCents: 18_000 } // always above budget
      },
    }
    const s = buildSession({ ...baseInput, maxRounds: 4 })
    const result = await negotiate(s, greedyVendor)
    expect(result.status).toBe('rejected')
    expect(result.offers.every(o => o.party === 'vendor' || o.priceCents <= s.maxBudgetCents)).toBe(true)
  })

  it('accepts a last-round counter that lands within budget', async () => {
    let round = 0
    const lateVendor: VendorNegotiator = {
      async negotiate(session) {
        round++
        // only concede within budget on the final round
        return round >= session.maxRounds
          ? { accept: false, counterPriceCents: session.maxBudgetCents }
          : { accept: false, counterPriceCents: session.maxBudgetCents + 5_000 }
      },
    }
    const s = buildSession({ ...baseInput, maxRounds: 3 })
    const result = await negotiate(s, lateVendor)
    expect(result.status).toBe('accepted')
    expect(result.agreedPriceCents).toBe(s.maxBudgetCents)
  })

  it('marks failed when the vendor transport throws', async () => {
    const brokenVendor: VendorNegotiator = {
      async negotiate() {
        throw new Error('vendor offline')
      },
    }
    const s = buildSession({ ...baseInput })
    const result = await negotiate(s, brokenVendor)
    expect(result.status).toBe('failed')
  })
})

// ─── DB orchestration ────────────────────────────────────────────────────────

describe('createAndRunNegotiation', () => {
  it('runs to completion and persists the session', async () => {
    const session = await createAndRunNegotiation(baseInput)
    expect(['accepted', 'rejected']).toContain(session.status)
    expect(mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({ negotiationId: expect.any(String) }))
  })
})

describe('getNegotiation / getUserNegotiations', () => {
  it('reads a single negotiation', async () => {
    mockFindOne.mockResolvedValue({ negotiationId: 'neg_1' } as NegotiationSession)
    const s = await getNegotiation('neg_1')
    expect(s?.negotiationId).toBe('neg_1')
  })

  it('lists a user\'s negotiations', async () => {
    mockFind.mockResolvedValue([{ negotiationId: 'neg_1' }, { negotiationId: 'neg_2' }])
    const list = await getUserNegotiations('user-1')
    expect(list).toHaveLength(2)
  })
})
