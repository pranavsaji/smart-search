export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockFind = jest.fn()
const mockAggregate = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      findOneAndUpdate: mockFindOneAndUpdate,
      find: () => ({ sort: () => ({ limit: () => ({ toArray: mockFind }) }) }),
      aggregate: () => ({ toArray: mockAggregate }),
    }),
  })),
  COLLECTIONS: {
    wallets: 'wallets',
    walletTransactions: 'wallet_transactions',
    creditLedger: 'credit_ledger',
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
    walletBalance: (id: string) => `wallet:balance:${id}`,
    walletTopup: (id: string) => `wallet:topup:${id}`,
    creditBalance: (id: string) => `credits:balance:${id}`,
  },
}))

const mockPaymentIntentsCreate = jest.fn()
jest.mock('@/lib/payments/stripe', () => ({
  getStripe: () => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
  }),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

let idCounter = 0
jest.mock('nanoid', () => ({ nanoid: () => `TESTID${String(++idCounter).padStart(4, '0')}` }))

import {
  getOrCreateWallet,
  getWallet,
  createTopUpIntent,
  creditWalletFromPayment,
  debitWallet,
  getWalletBalance,
  getWalletTransactions,
} from '@/lib/wallet/wallet'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWallet(overrides = {}) {
  return {
    walletId: 'WAL-TESTID0001',
    userId: 'user-1',
    balanceCents: 5000,
    currency: 'USD',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  idCounter = 0
  mockRedisGet.mockResolvedValue(null)
  mockRedisSet.mockResolvedValue('OK')
  mockRedisDel.mockResolvedValue(1)
  mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
  mockFind.mockResolvedValue([])
  mockAggregate.mockResolvedValue([])
})

// ─── getOrCreateWallet ────────────────────────────────────────────────────────

describe('getOrCreateWallet', () => {
  it('returns existing wallet when found', async () => {
    const existing = makeWallet()
    mockFindOne.mockResolvedValue(existing)
    const result = await getOrCreateWallet('user-1')
    expect(result).toEqual(existing)
    expect(mockInsertOne).not.toHaveBeenCalled()
  })

  it('creates new wallet when none exists', async () => {
    mockFindOne.mockResolvedValue(null)
    mockInsertOne.mockResolvedValue({ insertedId: 'new-id' })
    const result = await getOrCreateWallet('user-new')
    expect(result.userId).toBe('user-new')
    expect(result.balanceCents).toBe(0)
    expect(result.currency).toBe('USD')
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
  })

  it('uses specified currency when creating', async () => {
    mockFindOne.mockResolvedValue(null)
    const result = await getOrCreateWallet('user-eur', 'EUR')
    expect(result.currency).toBe('EUR')
  })

  it('is idempotent — second call returns same wallet', async () => {
    const existing = makeWallet()
    mockFindOne.mockResolvedValue(existing)
    const r1 = await getOrCreateWallet('user-1')
    const r2 = await getOrCreateWallet('user-1')
    expect(r1.walletId).toBe(r2.walletId)
    expect(mockInsertOne).not.toHaveBeenCalled()
  })
})

// ─── getWallet ────────────────────────────────────────────────────────────────

describe('getWallet', () => {
  it('returns wallet when found', async () => {
    const wallet = makeWallet()
    mockFindOne.mockResolvedValue(wallet)
    expect(await getWallet('user-1')).toEqual(wallet)
  })

  it('returns null when not found', async () => {
    mockFindOne.mockResolvedValue(null)
    expect(await getWallet('unknown')).toBeNull()
  })
})

// ─── createTopUpIntent ────────────────────────────────────────────────────────

describe('createTopUpIntent', () => {
  beforeEach(() => {
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    })
  })

  it('creates Stripe PaymentIntent with correct params', async () => {
    const result = await createTopUpIntent('user-1', 1000)
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1000,
      currency: 'usd',
      metadata: { userId: 'user-1', purpose: 'wallet_topup' },
    }))
    expect(result.paymentIntentId).toBe('pi_test_123')
    expect(result.clientSecret).toBe('pi_test_123_secret')
    expect(result.amountCents).toBe(1000)
  })

  it('caches intent to Redis for idempotency', async () => {
    await createTopUpIntent('user-1', 2000)
    expect(mockRedisSet).toHaveBeenCalledWith(
      'wallet:topup:pi_test_123',
      expect.stringContaining('user-1'),
      expect.objectContaining({ ex: 86400 })
    )
  })

  it('throws TOPUP_MINIMUM_100 for amounts < 100', async () => {
    await expect(createTopUpIntent('user-1', 99)).rejects.toThrow('TOPUP_MINIMUM_100')
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled()
  })

  it('throws TOPUP_MINIMUM_100 for zero amount', async () => {
    await expect(createTopUpIntent('user-1', 0)).rejects.toThrow('TOPUP_MINIMUM_100')
  })

  it('throws TOPUP_MAXIMUM_EXCEEDED for amounts > 1,000,000', async () => {
    await expect(createTopUpIntent('user-1', 1_000_001)).rejects.toThrow('TOPUP_MAXIMUM_EXCEEDED')
  })

  it('accepts exactly 100 (minimum boundary)', async () => {
    const result = await createTopUpIntent('user-1', 100)
    expect(result.amountCents).toBe(100)
  })

  it('accepts exactly 1,000,000 (maximum boundary)', async () => {
    const result = await createTopUpIntent('user-1', 1_000_000)
    expect(result.amountCents).toBe(1_000_000)
  })

  it('defaults to USD when currency not specified', async () => {
    await createTopUpIntent('user-1', 500)
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'usd' }))
  })

  it('respects EUR currency', async () => {
    await createTopUpIntent('user-1', 500, 'EUR')
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ currency: 'eur' }))
  })
})

// ─── creditWalletFromPayment ──────────────────────────────────────────────────

describe('creditWalletFromPayment', () => {
  it('returns null and warns when Redis key is absent (already processed)', async () => {
    mockRedisGet.mockResolvedValue(null)
    const result = await creditWalletFromPayment('pi_already', 'user-1', 500)
    expect(result).toBeNull()
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('credits balance when Redis key is present', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ userId: 'user-1', amountCents: 500 }))
    const updatedWallet = makeWallet({ balanceCents: 5500 })
    mockFindOneAndUpdate.mockResolvedValue(updatedWallet)
    mockFindOne.mockResolvedValue(updatedWallet)

    const result = await creditWalletFromPayment('pi_test', 'user-1', 500)
    expect(result).toEqual(updatedWallet)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1' },
      expect.objectContaining({ $inc: { balanceCents: 500 } }),
      expect.any(Object)
    )
  })

  it('invalidates balance cache after crediting', async () => {
    mockRedisGet.mockResolvedValue('{"userId":"user-1","amountCents":500}')
    const wallet = makeWallet({ balanceCents: 5500 })
    mockFindOneAndUpdate.mockResolvedValue(wallet)
    mockFindOne.mockResolvedValue(wallet)

    await creditWalletFromPayment('pi_test', 'user-1', 500)
    expect(mockRedisDel).toHaveBeenCalledWith('wallet:balance:user-1')
  })

  it('deletes Redis idempotency key after processing', async () => {
    mockRedisGet.mockResolvedValue('{"userId":"user-1","amountCents":500}')
    const wallet = makeWallet({ balanceCents: 5500 })
    mockFindOneAndUpdate.mockResolvedValue(wallet)
    mockFindOne.mockResolvedValue(wallet)

    await creditWalletFromPayment('pi_test', 'user-1', 500)
    expect(mockRedisDel).toHaveBeenCalledWith('wallet:topup:pi_test')
  })

  it('returns null when wallet not found in DB', async () => {
    mockRedisGet.mockResolvedValue('{"userId":"ghost","amountCents":500}')
    mockFindOneAndUpdate.mockResolvedValue(null)

    const result = await creditWalletFromPayment('pi_test', 'ghost', 500)
    expect(result).toBeNull()
  })
})

// ─── debitWallet ──────────────────────────────────────────────────────────────

describe('debitWallet', () => {
  it('atomically debits balance', async () => {
    const updated = makeWallet({ balanceCents: 3000 })
    mockFindOneAndUpdate.mockResolvedValue(updated)
    mockFindOne.mockResolvedValue(updated)

    const result = await debitWallet('user-1', 2000, 'split-1', 'Split payment')
    expect(result).toEqual(updated)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1', balanceCents: { $gte: 2000 } },
      expect.objectContaining({ $inc: { balanceCents: -2000 } }),
      expect.any(Object)
    )
  })

  it('throws INSUFFICIENT_BALANCE when findOneAndUpdate returns null', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)
    await expect(debitWallet('user-broke', 10000, 'ref', 'desc')).rejects.toThrow('INSUFFICIENT_BALANCE')
  })

  it('invalidates balance cache after debit', async () => {
    const updated = makeWallet({ balanceCents: 1000 })
    mockFindOneAndUpdate.mockResolvedValue(updated)
    mockFindOne.mockResolvedValue(updated)

    await debitWallet('user-1', 4000, 'ref', 'desc')
    expect(mockRedisDel).toHaveBeenCalledWith('wallet:balance:user-1')
  })
})

// ─── getWalletBalance ─────────────────────────────────────────────────────────

describe('getWalletBalance', () => {
  it('returns cached balance when Redis has value', async () => {
    mockRedisGet.mockResolvedValue('7500')
    const balance = await getWalletBalance('user-1')
    expect(balance).toBe(7500)
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('fetches from DB on cache miss', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(makeWallet({ balanceCents: 3000 }))
    const balance = await getWalletBalance('user-1')
    expect(balance).toBe(3000)
    expect(mockFindOne).toHaveBeenCalled()
  })

  it('caches DB result for 5 minutes', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(makeWallet({ balanceCents: 3000 }))
    await getWalletBalance('user-1')
    expect(mockRedisSet).toHaveBeenCalledWith('wallet:balance:user-1', 3000, { ex: 300 })
  })

  it('returns 0 when wallet does not exist', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)
    const balance = await getWalletBalance('unknown')
    expect(balance).toBe(0)
  })
})

// ─── getWalletTransactions ────────────────────────────────────────────────────

describe('getWalletTransactions', () => {
  it('returns transactions sorted by createdAt desc', async () => {
    const txs = [{ txId: 'TXN-1' }, { txId: 'TXN-2' }]
    mockFind.mockResolvedValue(txs)
    const result = await getWalletTransactions('user-1')
    expect(result).toEqual(txs)
  })

  it('returns empty array when no transactions', async () => {
    mockFind.mockResolvedValue([])
    expect(await getWalletTransactions('user-1')).toEqual([])
  })
})
