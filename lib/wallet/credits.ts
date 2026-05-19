import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { logger } from '@/lib/logger'
import {
  CASHBACK_RATE_PERCENT,
  REFERRAL_BONUS_CENTS,
  type CreditEntry,
  type CreditEntryType,
} from './types'

export type { CreditEntry }

const CREDIT_CACHE_TTL = 300   // 5 minutes
const REFERRAL_CODE_TTL = 604800  // 7 days

// ─── Balance Query ────────────────────────────────────────────────────────────

export async function getCreditBalance(userId: string): Promise<number> {
  const cached = await redis.get(RedisKeys.creditBalance(userId))
  if (cached !== null) return Number(cached)

  const db = await getDb()
  const pipeline = [
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]
  const [result] = await db.collection(COLLECTIONS.creditLedger).aggregate(pipeline).toArray()
  const balance = (result?.total as number) ?? 0

  await redis.set(RedisKeys.creditBalance(userId), balance, { ex: CREDIT_CACHE_TTL })
  return balance
}

export async function getCreditHistory(userId: string, limit = 50): Promise<CreditEntry[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.creditLedger)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs as unknown as CreditEntry[]
}

// ─── Earn Cashback ────────────────────────────────────────────────────────────

export async function earnCashback(
  userId: string,
  orderId: string,
  orderAmountCents: number
): Promise<CreditEntry> {
  const cashbackCents = Math.floor(orderAmountCents * CASHBACK_RATE_PERCENT / 100)
  if (cashbackCents <= 0) throw new Error('CASHBACK_TOO_SMALL')

  return appendCreditEntry({
    userId,
    type: 'cashback_earned',
    amountCents: cashbackCents,
    description: `${CASHBACK_RATE_PERCENT}% cashback on order ${orderId}`,
    referenceId: `cashback:${orderId}`,
  })
}

// ─── Redeem Credits ───────────────────────────────────────────────────────────

export interface RedeemResult {
  redeemedCents: number
  remainingBalanceCents: number
}

// Cap redemption at min(requestedCents, creditBalance) — credits can't exceed order total.
export async function redeemCredits(
  userId: string,
  requestedCents: number,
  orderId: string
): Promise<RedeemResult> {
  const balance = await getCreditBalance(userId)
  if (balance <= 0) throw new Error('NO_CREDITS')

  const redeemedCents = Math.min(requestedCents, balance)
  if (redeemedCents <= 0) throw new Error('REDEMPTION_TOO_SMALL')

  await appendCreditEntry({
    userId,
    type: 'cashback_redeemed',
    amountCents: -redeemedCents,
    description: `Credits redeemed on order ${orderId}`,
    referenceId: `redeem:${orderId}`,
  })

  const remainingBalanceCents = balance - redeemedCents
  logger.info('[credits] Credits redeemed', { userId, redeemedCents, remainingBalanceCents, orderId })
  return { redeemedCents, remainingBalanceCents }
}

// ─── Referral Program ─────────────────────────────────────────────────────────

export async function generateReferralCode(userId: string): Promise<string> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.referralCodes).findOne({ userId })
  if (existing) return existing.code as string

  const code = `IAM-${nanoid(8).toUpperCase()}`
  await db.collection(COLLECTIONS.referralCodes).insertOne({
    _id: new ObjectId(),
    code,
    userId,
    timesUsed: 0,
    createdAt: new Date(),
  })

  await redis.set(RedisKeys.referralCode(code), userId, { ex: REFERRAL_CODE_TTL })
  return code
}

export async function resolveReferralCode(code: string): Promise<string | null> {
  const cached = await redis.get(RedisKeys.referralCode(code))
  if (cached) return cached as string

  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.referralCodes).findOne({ code })
  if (!doc) return null

  // Re-populate cache on DB hit
  await redis.set(RedisKeys.referralCode(code), doc.userId as string, { ex: REFERRAL_CODE_TTL })
  return doc.userId as string
}

// Called when a new user completes their first booking via a referral code.
// Both referrer and referee receive REFERRAL_BONUS_CENTS. Idempotent per newUserId.
export async function processReferralBonus(
  referrerId: string,
  newUserId: string,
  code: string
): Promise<void> {
  const db = await getDb()

  const alreadyProcessed = await db.collection(COLLECTIONS.creditLedger).findOne({
    referenceId: `referral_given:${newUserId}`,
    type: 'referral_bonus_given',
  })
  if (alreadyProcessed) {
    logger.warn('[credits] Referral bonus already processed', { referrerId, newUserId })
    return
  }

  await Promise.all([
    appendCreditEntry({
      userId: referrerId,
      type: 'referral_bonus_given',
      amountCents: REFERRAL_BONUS_CENTS,
      description: 'Referral bonus — friend joined with your code',
      referenceId: `referral_given:${newUserId}`,
    }),
    appendCreditEntry({
      userId: newUserId,
      type: 'referral_bonus_received',
      amountCents: REFERRAL_BONUS_CENTS,
      description: `Welcome bonus — joined via referral code ${code}`,
      referenceId: `referral_received:${code}`,
    }),
  ])

  await db.collection(COLLECTIONS.referralCodes).updateOne(
    { code },
    { $inc: { timesUsed: 1 } }
  )

  logger.info('[credits] Referral bonuses issued', { referrerId, newUserId, code })
}

// ─── Vendor-Sponsored Credits ─────────────────────────────────────────────────

export async function applyVendorSponsoredCredits(
  userId: string,
  vendorId: string,
  amountCents: number,
  campaignId: string
): Promise<CreditEntry> {
  return appendCreditEntry({
    userId,
    type: 'vendor_sponsored',
    amountCents,
    description: 'Bonus credits from vendor promotion',
    referenceId: `campaign:${campaignId}`,
    metadata: { vendorId, campaignId },
  })
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface CreditInput {
  userId: string
  type: CreditEntryType
  amountCents: number
  description: string
  referenceId?: string
  metadata?: Record<string, unknown>
}

async function appendCreditEntry(input: CreditInput): Promise<CreditEntry> {
  const db = await getDb()

  // Idempotency: same referenceId + type combination must not be applied twice
  if (input.referenceId) {
    const dup = await db.collection(COLLECTIONS.creditLedger).findOne({
      referenceId: input.referenceId,
      type: input.type,
    })
    if (dup) throw new Error('CREDIT_ALREADY_APPLIED')
  }

  const balance = await getCreditBalance(input.userId)
  const balanceAfterCents = balance + input.amountCents

  const entry: CreditEntry = {
    entryId: `CRE-${nanoid(10).toUpperCase()}`,
    ...input,
    balanceAfterCents,
    createdAt: new Date(),
  }

  await db.collection(COLLECTIONS.creditLedger).insertOne({ _id: new ObjectId(), ...entry })
  await redis.del(RedisKeys.creditBalance(input.userId))
  return entry
}
