// Fixed-window rate limiting for user-facing API routes.
//
// Closes GAP_ANALYSIS 1.5. Without this a single broken client looping on
// /api/intent drains the Anthropic/Groq budget: every call is a paid two-phase
// LLM round trip.
//
// Deliberately built on the Redis client already in the stack rather than
// @upstash/ratelimit — `redis` degrades to a no-op proxy when Upstash env vars
// are absent (dev, CI), and a fixed window needs only INCR + EXPIRE, which the
// proxy tolerates. See failOpen() for what happens when Redis is unreachable.

import { redis, RedisKeys } from '@/lib/cache/redis'
import { TooManyRequestsError } from '@/lib/api/response'

export interface RateLimitRule {
  /** Stable name — becomes part of the Redis key, so don't rename casually. */
  scope: string
  limit: number
  windowSeconds: number
}

// Tuned to sit well above real interactive use and well below abuse.
// LLM-backed routes are the tightest: each call costs money.
export const RATE_LIMITS = {
  intent:   { scope: 'intent',   limit: 10,  windowSeconds: 60 },
  genie:    { scope: 'genie',    limit: 20,  windowSeconds: 60 },
  voice:    { scope: 'voice',    limit: 20,  windowSeconds: 60 },
  resolve:  { scope: 'resolve',  limit: 60,  windowSeconds: 60 },
  checkout: { scope: 'checkout', limit: 10,  windowSeconds: 60 },
  register: { scope: 'register', limit: 5,   windowSeconds: 900 },
  // OTP request is limited on two axes: per-IP stops one host spraying many
  // addresses, per-email stops many hosts mailbombing one victim.
  otpRequest:         { scope: 'otp_request',   limit: 10, windowSeconds: 900 },
  otpRequestPerEmail: { scope: 'otp_email',     limit: 4,  windowSeconds: 900 },
  otpVerify:          { scope: 'otp_verify',    limit: 20, windowSeconds: 900 },
  capture:  { scope: 'capture',  limit: 60,  windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  /** Seconds until the current window rolls over. */
  retryAfter: number
}

/**
 * Records one hit against `identifier` and reports whether it is within `rule`.
 *
 * Fails OPEN: if Redis is unavailable the request is allowed. A rate limiter
 * that takes the whole product down when its cache blips is a worse outage
 * than the abuse it prevents.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % rule.windowSeconds)
  const retryAfter = windowStart + rule.windowSeconds - now
  const key = RedisKeys.apiRateLimit(rule.scope, identifier, windowStart)

  let used: number | null = null
  try {
    used = await redis.incr(key)
    // Only the request that opened the window sets its TTL. Re-setting on every
    // hit would slide the expiry forward and the window would never close.
    if (used === 1) await redis.expire(key, rule.windowSeconds)
  } catch {
    used = null
  }

  if (used === null || used === undefined) {
    return failOpen(rule, retryAfter)
  }

  return {
    allowed: used <= rule.limit,
    remaining: Math.max(0, rule.limit - used),
    limit: rule.limit,
    retryAfter,
  }
}

function failOpen(rule: RateLimitRule, retryAfter: number): RateLimitResult {
  return { allowed: true, remaining: rule.limit, limit: rule.limit, retryAfter }
}

/**
 * checkRateLimit, but throws TooManyRequestsError when over the limit so
 * withApiHandler renders the 429 (with Retry-After) for free.
 */
export async function enforceRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<void> {
  const result = await checkRateLimit(rule, identifier)
  if (!result.allowed) {
    throw new TooManyRequestsError(
      `Rate limit exceeded. Try again in ${result.retryAfter}s.`,
      result.retryAfter,
    )
  }
}

/**
 * Who to bill a request to: the signed-in user, else the client IP, else a
 * shared 'anonymous' bucket.
 *
 * The shared bucket is intentional — if we cannot identify the caller at all we
 * would rather throttle that traffic collectively than hand out an unlimited
 * quota to anyone who can strip a header.
 */
export function rateLimitIdentifier(
  userId: string | null | undefined,
  req: { headers: Headers },
): string {
  if (userId) return `u:${userId}`
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip')
  return ip ? `ip:${ip}` : 'anonymous'
}
