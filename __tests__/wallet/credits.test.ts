export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockFindOne2 = jest.fn()
const mockAggregate = jest.fn()
const mockUpdateOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: (name: string) => ({
      insertOne: mockInsertOne,
      findOne: name === 'referral_codes' ? mockFindOne2 : mockFindOne,
      find: () => ({ sort: () => ({ limit: () => ({ toArray: mockFind }) }) }),
      aggregate: () => ({ toArray: mockAggregate }),
      updateOne: mockUpdateOne,
    }),
  })),
  COLLECTIONS: {
    creditLedger: 'credit_ledger',
    referralCodes: 'referral_codes',
  },
}))

const mockRedisGet = jest.fn()
const mockRedisSet = jest.fn()
const mockRedisDel = jest.fn()

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    get: (...a: unknown[]) => mockRedisGet(...a),
    set: (...a: unknown[]) => mockRedisSet(...a),
    del: (...a: unknown[]) => mockRedisDel(...a),
  },
  RedisKeys: {
    creditBalance: (id: string) => `credits:balance:${id}`,
    referralCode: (code: string) => `referral:${code}`,
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

let idCounter = 0
jest.mock('nanoid', () => ({ nanoid: (n?: number) => `${'X'.repeat(n ?? 10)}${++idCounter}` }))

import {
  getCreditBalance,
  getCreditHistory,
  earnCashback,
  redeemCredits,
  generateReferralCode,
  resolveReferralCode,
  processReferralBonus,
  applyVendorSponsoredCredits,
} from '@/lib/wallet/credits'

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  idCounter = 0
  mockRedisGet.mockResolvedValue(null)
  mockRedisSet.mockResolvedValue('OK')
  mockRedisDel.mockResolvedValue(1)
  mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
  mockFindOne.mockResolvedValue(null)
  mockFindOne2.mockResolvedValue(null)
  mockFind.mockResolvedValue([])
  mockAggregate.mockResolvedValue([])
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })
})

// ─── getCreditBalance ─────────────────────────────────────────────────────────

describe('getCreditBalance', () => {
  it('returns cached value from Redis', async () => {
    mockRedisGet.mockResolvedValue('2500')
    expect(await getCreditBalance('user-1')).toBe(2500)
    expect(mockAggregate).not.toHaveBeenCalled()
  })

  it('aggregates from DB on cache miss', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockAggregate.mockResolvedValue([{ _id: null, total: 1500 }])
    expect(await getCreditBalance('user-1')).toBe(1500)
  })

  it('returns 0 when no entries exist', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockAggregate.mockResolvedValue([])
    expect(await getCreditBalance('user-1')).toBe(0)
  })

  it('caches aggregated result with 5min TTL', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockAggregate.mockResolvedValue([{ _id: null, total: 800 }])
    await getCreditBalance('user-1')
    expect(mockRedisSet).toHaveBeenCalledWith('credits:balance:user-1', 800, { ex: 300 })
  })
})

// ─── getCreditHistory ─────────────────────────────────────────────────────────

describe('getCreditHistory', () => {
  it('returns entries sorted by createdAt desc', async () => {
    const entries = [{ entryId: 'CRE-1' }, { entryId: 'CRE-2' }]
    mockFind.mockResolvedValue(entries)
    expect(await getCreditHistory('user-1')).toEqual(entries)
  })

  it('returns empty array when no history', async () => {
    mockFind.mockResolvedValue([])
    expect(await getCreditHistory('user-1')).toEqual([])
  })
})

// ─── earnCashback ─────────────────────────────────────────────────────────────

describe('earnCashback', () => {
  beforeEach(() => {
    // balance check for balanceAfterCents snapshot
    mockAggregate.mockResolvedValue([{ _id: null, total: 0 }])
  })

  it('calculates 1% cashback correctly', async () => {
    mockFindOne.mockResolvedValue(null)  // no dup
    await earnCashback('user-1', 'ord-1', 10000)  // £100 order → £1 cashback
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 100, type: 'cashback_earned' })
    )
  })

  it('throws CASHBACK_TOO_SMALL when cashback rounds to 0', async () => {
    await expect(earnCashback('user-1', 'ord-1', 50)).rejects.toThrow('CASHBACK_TOO_SMALL')
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('throws CREDIT_ALREADY_APPLIED for duplicate orderId', async () => {
    mockFindOne.mockResolvedValue({ entryId: 'existing' })
    await expect(earnCashback('user-1', 'ord-dup', 10000)).rejects.toThrow('CREDIT_ALREADY_APPLIED')
  })

  it('uses floor for fractional cashback', async () => {
    mockFindOne.mockResolvedValue(null)
    await earnCashback('user-1', 'ord-frac', 150)  // 1.5 → floor → 1 cent
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1 })
    )
  })

  it('invalidates credit balance cache', async () => {
    mockFindOne.mockResolvedValue(null)
    await earnCashback('user-1', 'ord-cache', 10000)
    expect(mockRedisDel).toHaveBeenCalledWith('credits:balance:user-1')
  })
})

// ─── redeemCredits ────────────────────────────────────────────────────────────

describe('redeemCredits', () => {
  it('redeems exact amount when balance is sufficient', async () => {
    mockRedisGet.mockResolvedValue('1000')  // 1000 credits
    mockFindOne.mockResolvedValue(null)
    mockAggregate.mockResolvedValue([{ total: 1000 }])
    const result = await redeemCredits('user-1', 500, 'ord-1')
    expect(result.redeemedCents).toBe(500)
    expect(result.remainingBalanceCents).toBe(500)
  })

  it('caps redemption at available balance', async () => {
    mockRedisGet.mockResolvedValue('300')  // only 300 available
    mockFindOne.mockResolvedValue(null)
    mockAggregate.mockResolvedValue([{ total: 300 }])
    const result = await redeemCredits('user-1', 1000, 'ord-1')
    expect(result.redeemedCents).toBe(300)
    expect(result.remainingBalanceCents).toBe(0)
  })

  it('throws NO_CREDITS when balance is 0', async () => {
    mockRedisGet.mockResolvedValue('0')
    await expect(redeemCredits('user-1', 500, 'ord-1')).rejects.toThrow('NO_CREDITS')
  })

  it('creates negative ledger entry for redemption', async () => {
    mockRedisGet.mockResolvedValue('1000')
    mockFindOne.mockResolvedValue(null)
    mockAggregate.mockResolvedValue([{ total: 1000 }])
    await redeemCredits('user-1', 200, 'ord-2')
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: -200, type: 'cashback_redeemed' })
    )
  })

  it('throws REDEMPTION_TOO_SMALL for zero amount', async () => {
    mockRedisGet.mockResolvedValue('100')
    await expect(redeemCredits('user-1', 0, 'ord-1')).rejects.toThrow('REDEMPTION_TOO_SMALL')
  })
})

// ─── generateReferralCode ─────────────────────────────────────────────────────

describe('generateReferralCode', () => {
  it('creates new referral code for new user', async () => {
    mockFindOne2.mockResolvedValue(null)
    const code = await generateReferralCode('user-new')
    expect(code).toMatch(/^SS-/)
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-new', timesUsed: 0 })
    )
  })

  it('returns existing code idempotently', async () => {
    mockFindOne2.mockResolvedValue({ code: 'SS-EXISTING', userId: 'user-1' })
    const code = await generateReferralCode('user-1')
    expect(code).toBe('SS-EXISTING')
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('caches code to Redis with 7-day TTL', async () => {
    mockFindOne2.mockResolvedValue(null)
    const code = await generateReferralCode('user-new')
    expect(mockRedisSet).toHaveBeenCalledWith(`referral:${code}`, 'user-new', { ex: 604800 })
  })
})

// ─── resolveReferralCode ──────────────────────────────────────────────────────

describe('resolveReferralCode', () => {
  it('returns userId from Redis cache', async () => {
    mockRedisGet.mockResolvedValue('user-owner')
    expect(await resolveReferralCode('SS-CACHED')).toBe('user-owner')
    expect(mockFindOne2).not.toHaveBeenCalled()
  })

  it('fetches from DB on cache miss', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne2.mockResolvedValue({ code: 'SS-DB', userId: 'user-db' })
    expect(await resolveReferralCode('SS-DB')).toBe('user-db')
  })

  it('re-populates cache on DB hit', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne2.mockResolvedValue({ code: 'SS-DB', userId: 'user-db' })
    await resolveReferralCode('SS-DB')
    expect(mockRedisSet).toHaveBeenCalledWith('referral:SS-DB', 'user-db', { ex: 604800 })
  })

  it('returns null for unknown code', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne2.mockResolvedValue(null)
    expect(await resolveReferralCode('SS-UNKNOWN')).toBeNull()
  })
})

// ─── processReferralBonus ─────────────────────────────────────────────────────

describe('processReferralBonus', () => {
  beforeEach(() => {
    mockAggregate.mockResolvedValue([{ total: 0 }])
  })

  it('issues bonuses to both referrer and referee', async () => {
    mockFindOne.mockResolvedValue(null)  // no duplicate
    await processReferralBonus('referrer-1', 'newuser-1', 'SS-TESTCODE')
    // Two insertOne calls: one per user
    expect(mockInsertOne).toHaveBeenCalledTimes(2)
    const calls = mockInsertOne.mock.calls.map((c: unknown[]) => c[0] as { type: string; amountCents: number })
    expect(calls.some(c => c.type === 'referral_bonus_given' && c.amountCents === 500)).toBe(true)
    expect(calls.some(c => c.type === 'referral_bonus_received' && c.amountCents === 500)).toBe(true)
  })

  it('increments referral code usage counter', async () => {
    mockFindOne.mockResolvedValue(null)
    await processReferralBonus('referrer-1', 'newuser-1', 'SS-TESTCODE')
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { code: 'SS-TESTCODE' },
      { $inc: { timesUsed: 1 } }
    )
  })

  it('skips if bonus already processed for this new user', async () => {
    mockFindOne.mockResolvedValue({ entryId: 'already-processed' })
    await processReferralBonus('referrer-1', 'newuser-dup', 'SS-TESTCODE')
    expect(mockInsertOne).not.toHaveBeenCalled()
  })
})

// ─── applyVendorSponsoredCredits ──────────────────────────────────────────────

describe('applyVendorSponsoredCredits', () => {
  beforeEach(() => {
    mockAggregate.mockResolvedValue([{ total: 0 }])
    mockFindOne.mockResolvedValue(null)
  })

  it('creates vendor_sponsored ledger entry', async () => {
    await applyVendorSponsoredCredits('user-1', 'vendor-1', 300, 'campaign-summer')
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'vendor_sponsored',
        amountCents: 300,
        metadata: { vendorId: 'vendor-1', campaignId: 'campaign-summer' },
      })
    )
  })

  it('includes vendorId and campaignId in metadata', async () => {
    const entry = await applyVendorSponsoredCredits('user-1', 'vend-42', 150, 'camp-xyz')
    expect(entry.metadata).toEqual({ vendorId: 'vend-42', campaignId: 'camp-xyz' })
  })

  it('is idempotent for same campaignId', async () => {
    mockFindOne.mockResolvedValue({ entryId: 'already' })
    await expect(
      applyVendorSponsoredCredits('user-1', 'vendor-1', 300, 'campaign-dup')
    ).rejects.toThrow('CREDIT_ALREADY_APPLIED')
  })
})
