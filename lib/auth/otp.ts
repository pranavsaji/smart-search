// Email one-time-passcode login. Closes GAP_ANALYSIS 1.1.
//
// Passwords were the only way in, which means a forgotten password is a churned
// user. This issues a short-lived 6-digit code over email instead.
//
// Storage is Redis, so codes expire on their own and never touch Mongo. The code
// is stored as a bcrypt hash — a Redis dump should not hand over live codes.

import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { redis, RedisKeys } from '@/lib/cache/redis'

export const OTP_LENGTH = 6
export const OTP_TTL_SECONDS = 10 * 60      // code lifetime
export const OTP_MAX_ATTEMPTS = 5           // wrong guesses before lockout
export const OTP_LOCKOUT_SECONDS = 15 * 60

// bcrypt cost. Deliberately below the 12 used for passwords: a 6-digit code
// lives for 10 minutes behind an attempt counter, and login latency matters.
const OTP_BCRYPT_ROUNDS = 8

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no_code' | 'expired' | 'invalid' | 'locked'; attemptsLeft?: number }

/** Emails are the lookup key everywhere — normalise once, here. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Cryptographically random 6-digit code, zero-padded.
 *
 * randomInt is rejection-sampled and therefore uniform; Math.random() is neither
 * uniform enough nor unpredictable, and this is an authentication credential.
 */
export function generateOTP(): string {
  const max = 10 ** OTP_LENGTH
  return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, '0')
}

/**
 * Issues a code for `email` and returns the plaintext for delivery.
 *
 * Any previous code and attempt counter are dropped: requesting a new code is
 * the documented way out of a bad attempt streak, short of a lockout.
 */
export async function storeOTP(email: string): Promise<string> {
  const normalized = normalizeEmail(email)
  const code = generateOTP()
  const hash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS)

  await redis.set(RedisKeys.otpCode(normalized), hash, { ex: OTP_TTL_SECONDS })
  await redis.del(RedisKeys.otpAttempts(normalized))

  return code
}

/**
 * Checks `code` against the stored hash for `email`.
 *
 * Single-use: a correct code is deleted immediately, so a leaked code cannot be
 * replayed within its remaining TTL. A wrong code burns one attempt, and the
 * address locks for OTP_LOCKOUT_SECONDS once the budget is gone.
 */
export async function verifyOTP(email: string, code: string): Promise<OtpVerifyResult> {
  const normalized = normalizeEmail(email)

  if (await isLockedOut(normalized)) return { ok: false, reason: 'locked' }

  const hash = await redis.get<string>(RedisKeys.otpCode(normalized))
  if (!hash) return { ok: false, reason: 'no_code' }

  const valid = await bcrypt.compare(code, hash)
  if (valid) {
    await redis.del(RedisKeys.otpCode(normalized))
    await redis.del(RedisKeys.otpAttempts(normalized))
    return { ok: true }
  }

  const attempts = await recordFailedAttempt(normalized)
  const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - attempts)

  if (attemptsLeft === 0) {
    // Drop the code as well: at this point we assume it is being guessed.
    await redis.del(RedisKeys.otpCode(normalized))
    return { ok: false, reason: 'locked', attemptsLeft: 0 }
  }

  return { ok: false, reason: 'invalid', attemptsLeft }
}

async function recordFailedAttempt(normalizedEmail: string): Promise<number> {
  const key = RedisKeys.otpAttempts(normalizedEmail)
  const attempts = await redis.incr(key)
  // Null means Redis is unavailable — treated as a single failed attempt so a
  // cache outage cannot silently disable the lockout.
  if (attempts === null || attempts === undefined) return 1
  if (attempts === 1) await redis.expire(key, OTP_LOCKOUT_SECONDS)
  return attempts
}

export async function isLockedOut(email: string): Promise<boolean> {
  const attempts = await redis.get<number>(RedisKeys.otpAttempts(normalizeEmail(email)))
  return (attempts ?? 0) >= OTP_MAX_ATTEMPTS
}

/** Seconds until the address unlocks; 0 when it is not locked. */
export async function lockoutTtl(email: string): Promise<number> {
  const ttl = await redis.ttl(RedisKeys.otpAttempts(normalizeEmail(email)))
  return typeof ttl === 'number' && ttl > 0 ? ttl : 0
}
