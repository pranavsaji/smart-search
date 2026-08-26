// GAP_ANALYSIS 1.1 — request an email sign-in code.
//
// Deliberately does NOT reveal whether the address has an account: the response
// is identical either way. A differing response here turns this endpoint into a
// free account-enumeration oracle.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ok, withApiHandler } from '@/lib/api/response'
import { storeOTP, normalizeEmail, isLockedOut, OTP_TTL_SECONDS } from '@/lib/auth/otp'
import { sendOtpEmail } from '@/lib/mail'
import { enforceRateLimit, rateLimitIdentifier, RATE_LIMITS } from '@/lib/ratelimit'

const schema = z.object({
  email: z.string().email(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  // Two limits, both needed: per-IP stops one host spraying many addresses,
  // per-email stops an attacker mailbombing one victim from many hosts.
  await enforceRateLimit(RATE_LIMITS.otpRequest, rateLimitIdentifier(null, req))

  const { email } = schema.parse(await req.json())
  const normalized = normalizeEmail(email)

  await enforceRateLimit(RATE_LIMITS.otpRequestPerEmail, `e:${normalized}`)

  const db = await getDb()
  const user = await db.collection(COLLECTIONS.users).findOne({ email: normalized })

  // Send only to real accounts, but always answer the same.
  if (user && !(await isLockedOut(normalized))) {
    const code = await storeOTP(normalized)
    try {
      await sendOtpEmail({
        to: normalized,
        code,
        expiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
      })
    } catch (err) {
      // Never surface delivery failure — it would leak that the account exists.
      console.error('[POST /api/auth/otp] delivery failed', err)
    }
  }

  return ok({
    sent: true,
    expiresInSeconds: OTP_TTL_SECONDS,
    message: 'If an account exists for that address, a sign-in code is on its way.',
  })
}, 'POST /api/auth/otp')
