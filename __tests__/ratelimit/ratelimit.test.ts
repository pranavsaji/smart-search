export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockIncr = jest.fn()
const mockExpire = jest.fn()

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    incr: (...a: unknown[]) => mockIncr(...a),
    expire: (...a: unknown[]) => mockExpire(...a),
  },
  RedisKeys: {
    apiRateLimit: (scope: string, id: string, w: number) => `ratelimit:${scope}:${id}:${w}`,
  },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  checkRateLimit,
  enforceRateLimit,
  rateLimitIdentifier,
  RATE_LIMITS,
} from '@/lib/ratelimit'
import { TooManyRequestsError } from '@/lib/api/response'

const RULE = { scope: 'test', limit: 3, windowSeconds: 60 }

// ─── checkRateLimit() ────────────────────────────────────────────────────────

describe('checkRateLimit()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('allows the first call and reports the remaining quota', async () => {
    mockIncr.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)

    const r = await checkRateLimit(RULE, 'u:alice')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
    expect(r.limit).toBe(3)
  })

  it('allows the call that lands exactly on the limit', async () => {
    mockIncr.mockResolvedValue(3)

    const r = await checkRateLimit(RULE, 'u:alice')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(0)
  })

  it('denies the call past the limit', async () => {
    mockIncr.mockResolvedValue(4)

    const r = await checkRateLimit(RULE, 'u:alice')
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('sets the TTL only on the call that opens the window', async () => {
    mockIncr.mockResolvedValue(1)
    await checkRateLimit(RULE, 'u:alice')
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 60)

    // A sliding expiry would mean the window never closes and the caller is
    // locked out forever once they hit the limit.
    jest.clearAllMocks()
    mockIncr.mockResolvedValue(2)
    await checkRateLimit(RULE, 'u:alice')
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('buckets different identifiers under different keys', async () => {
    mockIncr.mockResolvedValue(1)
    await checkRateLimit(RULE, 'u:alice')
    await checkRateLimit(RULE, 'u:bob')

    const [[keyA], [keyB]] = mockIncr.mock.calls as [string][]
    expect(keyA).not.toBe(keyB)
    expect(keyA).toContain('u:alice')
    expect(keyB).toContain('u:bob')
  })

  it('buckets different scopes under different keys', async () => {
    mockIncr.mockResolvedValue(1)
    await checkRateLimit({ ...RULE, scope: 'intent' }, 'u:alice')
    await checkRateLimit({ ...RULE, scope: 'genie' }, 'u:alice')

    const [[keyA], [keyB]] = mockIncr.mock.calls as [string][]
    expect(keyA).not.toBe(keyB)
  })

  it('reports seconds until the window rolls over', async () => {
    mockIncr.mockResolvedValue(4)
    const r = await checkRateLimit(RULE, 'u:alice')
    expect(r.retryAfter).toBeGreaterThan(0)
    expect(r.retryAfter).toBeLessThanOrEqual(60)
  })

  // ── Fail-open ──
  // The no-op Redis proxy (no Upstash env vars, i.e. dev and CI) resolves null.

  it('fails open when Redis returns null', async () => {
    mockIncr.mockResolvedValue(null)

    const r = await checkRateLimit(RULE, 'u:alice')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(3)
  })

  it('fails open when Redis throws', async () => {
    mockIncr.mockRejectedValue(new Error('ECONNREFUSED'))

    const r = await checkRateLimit(RULE, 'u:alice')
    expect(r.allowed).toBe(true)
  })
})

// ─── enforceRateLimit() ──────────────────────────────────────────────────────

describe('enforceRateLimit()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('resolves silently while under the limit', async () => {
    mockIncr.mockResolvedValue(1)
    await expect(enforceRateLimit(RULE, 'u:alice')).resolves.toBeUndefined()
  })

  it('throws TooManyRequestsError carrying a 429 and a retry hint', async () => {
    mockIncr.mockResolvedValue(99)

    await expect(enforceRateLimit(RULE, 'u:alice')).rejects.toThrow(TooManyRequestsError)
    try {
      await enforceRateLimit(RULE, 'u:alice')
      throw new Error('should have thrown')
    } catch (err) {
      const e = err as TooManyRequestsError
      expect(e.statusCode).toBe(429)
      expect(e.code).toBe('RATE_LIMITED')
      expect(e.retryAfterSeconds).toBeGreaterThan(0)
    }
  })
})

// ─── rateLimitIdentifier() ───────────────────────────────────────────────────

describe('rateLimitIdentifier()', () => {
  const req = (h: Record<string, string>) => ({ headers: new Headers(h) })

  it('prefers the session user over any header', () => {
    expect(rateLimitIdentifier('alice', req({ 'x-forwarded-for': '1.2.3.4' })))
      .toBe('u:alice')
  })

  it('falls back to the first x-forwarded-for hop', () => {
    expect(rateLimitIdentifier(null, req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })))
      .toBe('ip:1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    expect(rateLimitIdentifier(null, req({ 'x-real-ip': '9.9.9.9' }))).toBe('ip:9.9.9.9')
  })

  it('buckets fully unidentifiable traffic together rather than exempting it', () => {
    expect(rateLimitIdentifier(null, req({}))).toBe('anonymous')
  })
})

// ─── Configured rules ────────────────────────────────────────────────────────

describe('RATE_LIMITS', () => {
  it('gives every rule a positive limit and window', () => {
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.limit).toBeGreaterThan(0)
      expect(rule.windowSeconds).toBeGreaterThan(0)
    }
  })

  it('uses a unique scope per rule so buckets cannot collide', () => {
    const scopes = Object.values(RATE_LIMITS).map(r => r.scope)
    expect(new Set(scopes).size).toBe(scopes.length)
  })
})
