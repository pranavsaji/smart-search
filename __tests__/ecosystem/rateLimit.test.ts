export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockIncr = jest.fn()
const mockExpire = jest.fn()
const mockGet = jest.fn()

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    incr: (...a: unknown[]) => mockIncr(...a),
    expire: (...a: unknown[]) => mockExpire(...a),
    get: (...a: unknown[]) => mockGet(...a),
  },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { checkAndIncrementRateLimit, getUsage } from '@/lib/ecosystem/rateLimit'

// ─── checkAndIncrementRateLimit() ─────────────────────────────────────────────

describe('checkAndIncrementRateLimit()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('first call: incr returns 1, allowed=true', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const result = await checkAndIncrementRateLimit('key-1', 100)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(1)
    expect(result.limit).toBe(100)
  })

  it('call at limit: incr returns limit, allowed=true', async () => {
    mockIncr.mockResolvedValue(100)
    mockExpire.mockResolvedValue(0)

    const result = await checkAndIncrementRateLimit('key-1', 100)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(100)
  })

  it('call over limit: incr returns limit+1, allowed=false', async () => {
    mockIncr.mockResolvedValue(101)
    mockExpire.mockResolvedValue(0)

    const result = await checkAndIncrementRateLimit('key-1', 100)
    expect(result.allowed).toBe(false)
    expect(result.used).toBe(101)
  })

  it('enterprise tier (Infinity limit): no Redis call, always allowed=true', async () => {
    const result = await checkAndIncrementRateLimit('key-enterprise', Infinity)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(Infinity)
    expect(mockIncr).not.toHaveBeenCalled()
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('sets TTL on first increment (incr returns 1)', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    await checkAndIncrementRateLimit('key-new', 1000)
    expect(mockExpire).toHaveBeenCalledTimes(1)
    expect(mockExpire).toHaveBeenCalledWith(expect.stringContaining('key-new'), expect.any(Number))
  })

  it('TTL not set on subsequent increments (incr > 1)', async () => {
    mockIncr.mockResolvedValue(5)

    await checkAndIncrementRateLimit('key-existing', 1000)
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('resetAt is the first day of next month (UTC)', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const result = await checkAndIncrementRateLimit('key-1', 100)
    const now = new Date()
    const expectedMonth = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1
    expect(result.resetAt.getUTCDate()).toBe(1)
    expect(result.resetAt.getUTCMonth()).toBe(expectedMonth)
    expect(result.resetAt.getUTCHours()).toBe(0)
  })

  it('Redis key includes keyId and current year-month', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    await checkAndIncrementRateLimit('mykey-abc', 50)
    const now = new Date()
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    expect(mockIncr).toHaveBeenCalledWith(expect.stringContaining('mykey-abc'))
    expect(mockIncr).toHaveBeenCalledWith(expect.stringContaining(ym))
  })
})

// ─── getUsage() ───────────────────────────────────────────────────────────────

describe('getUsage()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 0 when key does not exist', async () => {
    mockGet.mockResolvedValue(null)
    const count = await getUsage('key-absent')
    expect(count).toBe(0)
  })

  it('returns the stored count', async () => {
    mockGet.mockResolvedValue(42)
    const count = await getUsage('key-present')
    expect(count).toBe(42)
  })

  it('includes keyId in the Redis key', async () => {
    mockGet.mockResolvedValue(0)
    await getUsage('specific-key-id')
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('specific-key-id'))
  })
})
