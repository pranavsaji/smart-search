export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGet = jest.fn()
const mockSet = jest.fn()
const mockDel = jest.fn()
const mockIncr = jest.fn()
const mockExpire = jest.fn()
const mockTtl = jest.fn()

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    get: (...a: unknown[]) => mockGet(...a),
    set: (...a: unknown[]) => mockSet(...a),
    del: (...a: unknown[]) => mockDel(...a),
    incr: (...a: unknown[]) => mockIncr(...a),
    expire: (...a: unknown[]) => mockExpire(...a),
    ttl: (...a: unknown[]) => mockTtl(...a),
  },
  RedisKeys: {
    otpCode: (email: string) => `otp:code:${email}`,
    otpAttempts: (email: string) => `otp:attempts:${email}`,
  },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs'
import {
  generateOTP,
  storeOTP,
  verifyOTP,
  normalizeEmail,
  isLockedOut,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
} from '@/lib/auth/otp'

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue(null)
  mockIncr.mockResolvedValue(1)
})

// ─── generateOTP() ───────────────────────────────────────────────────────────

describe('generateOTP()', () => {
  it('always returns exactly 6 digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOTP()).toMatch(/^\d{6}$/)
    }
  })

  it('zero-pads small values rather than emitting a short code', () => {
    // A short code would silently shrink the keyspace.
    const codes = Array.from({ length: 500 }, generateOTP)
    expect(codes.every(c => c.length === OTP_LENGTH)).toBe(true)
  })

  it('does not return a constant', () => {
    const codes = new Set(Array.from({ length: 50 }, generateOTP))
    expect(codes.size).toBeGreaterThan(1)
  })
})

// ─── normalizeEmail() ────────────────────────────────────────────────────────

describe('normalizeEmail()', () => {
  it('lowercases and trims so one address maps to one bucket', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com')
  })
})

// ─── storeOTP() ──────────────────────────────────────────────────────────────

describe('storeOTP()', () => {
  it('stores a bcrypt hash, never the plaintext code', async () => {
    const code = await storeOTP('alice@example.com')

    const [, stored] = mockSet.mock.calls[0] as [string, string]
    expect(stored).not.toBe(code)
    expect(stored.startsWith('$2')).toBe(true)
    expect(await bcrypt.compare(code, stored)).toBe(true)
  })

  it('sets the documented TTL', async () => {
    await storeOTP('alice@example.com')
    const [, , opts] = mockSet.mock.calls[0] as [string, string, { ex: number }]
    expect(opts.ex).toBe(OTP_TTL_SECONDS)
  })

  it('normalises the email into the key', async () => {
    await storeOTP('  Alice@Example.COM ')
    const [key] = mockSet.mock.calls[0] as [string]
    expect(key).toBe('otp:code:alice@example.com')
  })

  it('clears the attempt counter so a new code is a clean slate', async () => {
    await storeOTP('alice@example.com')
    expect(mockDel).toHaveBeenCalledWith('otp:attempts:alice@example.com')
  })
})

// ─── verifyOTP() ─────────────────────────────────────────────────────────────

describe('verifyOTP()', () => {
  const withStoredCode = async (code: string, attempts = 0) => {
    const hash = await bcrypt.hash(code, 8)
    mockGet.mockImplementation(async (key: string) =>
      key.startsWith('otp:code:') ? hash : attempts
    )
  }

  it('accepts the correct code', async () => {
    await withStoredCode('123456')
    await expect(verifyOTP('alice@example.com', '123456')).resolves.toEqual({ ok: true })
  })

  it('is case/whitespace-insensitive on the email', async () => {
    await withStoredCode('123456')
    await expect(verifyOTP('  ALICE@example.com ', '123456')).resolves.toEqual({ ok: true })
  })

  it('consumes the code so it cannot be replayed', async () => {
    await withStoredCode('123456')
    await verifyOTP('alice@example.com', '123456')
    expect(mockDel).toHaveBeenCalledWith('otp:code:alice@example.com')
  })

  it('rejects a wrong code and reports the remaining budget', async () => {
    await withStoredCode('123456')
    mockIncr.mockResolvedValue(1)

    const r = await verifyOTP('alice@example.com', '000000')
    expect(r).toEqual({ ok: false, reason: 'invalid', attemptsLeft: OTP_MAX_ATTEMPTS - 1 })
  })

  it('reports no_code when nothing was issued or it expired', async () => {
    mockGet.mockResolvedValue(null)
    const r = await verifyOTP('alice@example.com', '123456')
    expect(r).toEqual({ ok: false, reason: 'no_code' })
  })

  it('locks the address once the attempt budget is spent', async () => {
    await withStoredCode('123456')
    mockIncr.mockResolvedValue(OTP_MAX_ATTEMPTS)

    const r = await verifyOTP('alice@example.com', '000000')
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ reason: 'locked', attemptsLeft: 0 })
  })

  it('discards the live code when the address locks', async () => {
    await withStoredCode('123456')
    mockIncr.mockResolvedValue(OTP_MAX_ATTEMPTS)

    await verifyOTP('alice@example.com', '000000')
    // At this point we assume the code is being guessed, so it must not survive.
    expect(mockDel).toHaveBeenCalledWith('otp:code:alice@example.com')
  })

  it('refuses even a correct code while locked out', async () => {
    const hash = await bcrypt.hash('123456', 8)
    mockGet.mockImplementation(async (key: string) =>
      key.startsWith('otp:code:') ? hash : OTP_MAX_ATTEMPTS
    )

    const r = await verifyOTP('alice@example.com', '123456')
    expect(r).toEqual({ ok: false, reason: 'locked' })
  })

  it('starts the lockout window on the first failure only', async () => {
    await withStoredCode('123456')
    mockIncr.mockResolvedValue(1)
    await verifyOTP('alice@example.com', '000000')
    expect(mockExpire).toHaveBeenCalled()

    jest.clearAllMocks()
    await withStoredCode('123456')
    mockIncr.mockResolvedValue(2)
    await verifyOTP('alice@example.com', '000000')
    // Re-arming the TTL each time would extend the lockout indefinitely.
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('counts a Redis outage as a failed attempt rather than skipping the lockout', async () => {
    await withStoredCode('123456')
    mockIncr.mockResolvedValue(null)

    const r = await verifyOTP('alice@example.com', '000000')
    expect(r).toMatchObject({ reason: 'invalid', attemptsLeft: OTP_MAX_ATTEMPTS - 1 })
  })
})

// ─── isLockedOut() ───────────────────────────────────────────────────────────

describe('isLockedOut()', () => {
  it('is false below the threshold and true at it', async () => {
    mockGet.mockResolvedValue(OTP_MAX_ATTEMPTS - 1)
    expect(await isLockedOut('alice@example.com')).toBe(false)

    mockGet.mockResolvedValue(OTP_MAX_ATTEMPTS)
    expect(await isLockedOut('alice@example.com')).toBe(true)
  })

  it('treats a missing counter as not locked', async () => {
    mockGet.mockResolvedValue(null)
    expect(await isLockedOut('alice@example.com')).toBe(false)
  })
})
