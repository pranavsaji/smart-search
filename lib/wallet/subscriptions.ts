import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { getStripe } from '@/lib/payments/stripe'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { logger } from '@/lib/logger'
import { env } from '@/lib/config/env'
import {
  VENDOR_TIER_FEE,
  type UserSubscription,
  type VendorSubscription,
  type VendorTier,
} from './types'

export type { UserSubscription, VendorSubscription }

const SUB_CACHE_TTL = 3600  // 1 hour

// ─── Smart Search Pro (User Subscriptions) ─────────────────────────────────────────────

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const cached = await redis.get(RedisKeys.userSubscription(userId))
  if (cached) return JSON.parse(cached as string) as UserSubscription

  const db = await getDb()
  const doc = await db
    .collection(COLLECTIONS.userSubscriptions)
    .findOne({ userId, status: { $in: ['active', 'trialing'] } })
  const sub = doc as unknown as UserSubscription | null

  if (sub) await redis.set(RedisKeys.userSubscription(userId), JSON.stringify(sub), { ex: SUB_CACHE_TTL })
  return sub
}

export async function isUserPro(userId: string): Promise<boolean> {
  const sub = await getUserSubscription(userId)
  return sub?.status === 'active' || sub?.status === 'trialing'
}

export interface CreateUserSubscriptionInput {
  userId: string
  stripeCustomerId: string
  paymentMethodId: string
}

export async function createProSubscription(
  input: CreateUserSubscriptionInput
): Promise<UserSubscription> {
  const priceId = env.SMARTSEARCH_PRO_PRICE_ID()
  if (!priceId) throw new Error('SMARTSEARCH_PRO_PRICE_ID not configured')

  const stripe = getStripe()
  await stripe.paymentMethods.attach(input.paymentMethodId, { customer: input.stripeCustomerId })
  await stripe.customers.update(input.stripeCustomerId, {
    invoice_settings: { default_payment_method: input.paymentMethodId },
  })

  const stripeSub = await stripe.subscriptions.create({
    customer: input.stripeCustomerId,
    items: [{ price: priceId }],
    metadata: { userId: input.userId, tier: 'pro' },
  })

  const now = new Date()
  const sub: UserSubscription = {
    subscriptionId: `USUB-${nanoid(10).toUpperCase()}`,
    userId: input.userId,
    tier: 'pro',
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId: input.stripeCustomerId,
    status: stripeSub.status as UserSubscription['status'],
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  }

  const db = await getDb()
  await db.collection(COLLECTIONS.userSubscriptions).insertOne({ _id: new ObjectId(), ...sub })
  await redis.del(RedisKeys.userSubscription(input.userId))

  logger.info('[subscriptions] Smart Search Pro created', { userId: input.userId, stripeSubId: stripeSub.id })
  return sub
}

export async function cancelProSubscription(userId: string): Promise<UserSubscription> {
  const db = await getDb()
  const existing = await db
    .collection(COLLECTIONS.userSubscriptions)
    .findOne({ userId }) as UserSubscription | null
  if (!existing?.stripeSubscriptionId) throw new Error('NO_ACTIVE_SUBSCRIPTION')

  const stripe = getStripe()
  await stripe.subscriptions.update(existing.stripeSubscriptionId, { cancel_at_period_end: true })

  const result = await db.collection(COLLECTIONS.userSubscriptions).findOneAndUpdate(
    { userId },
    { $set: { cancelAtPeriodEnd: true, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )

  await redis.del(RedisKeys.userSubscription(userId))
  return result as unknown as UserSubscription
}

// ─── Vendor Subscriptions ──────────────────────────────────────────────────────

export async function getVendorSubscription(vendorId: string): Promise<VendorSubscription | null> {
  const cached = await redis.get(RedisKeys.vendorSubscription(vendorId))
  if (cached) return JSON.parse(cached as string) as VendorSubscription

  const db = await getDb()
  const doc = await db
    .collection(COLLECTIONS.vendorSubscriptions)
    .findOne({ vendorId, status: { $in: ['active', 'past_due'] } })
  const sub = doc as unknown as VendorSubscription | null

  if (sub) await redis.set(RedisKeys.vendorSubscription(vendorId), JSON.stringify(sub), { ex: SUB_CACHE_TTL })
  return sub
}

// Returns the effective platform fee % for a vendor.
// Subscribed vendors get lower fees. Falls back to basic=10% if no active subscription.
export async function getVendorPlatformFeePercent(vendorId: string): Promise<number> {
  const sub = await getVendorSubscription(vendorId)
  if (!sub || sub.status !== 'active') return VENDOR_TIER_FEE.basic
  return sub.platformFeePercent
}

export interface UpgradeVendorInput {
  vendorId: string
  tier: Exclude<VendorTier, 'basic'>  // basic is free, no Stripe needed
  stripeCustomerId: string
  paymentMethodId: string
}

export async function upgradeVendorSubscription(
  input: UpgradeVendorInput
): Promise<VendorSubscription> {
  const priceId = input.tier === 'growth'
    ? env.VENDOR_GROWTH_PRICE_ID()
    : env.VENDOR_ENTERPRISE_PRICE_ID()
  if (!priceId) throw new Error(`${input.tier.toUpperCase()}_PRICE_ID not configured`)

  const stripe = getStripe()
  await stripe.paymentMethods.attach(input.paymentMethodId, { customer: input.stripeCustomerId })
  await stripe.customers.update(input.stripeCustomerId, {
    invoice_settings: { default_payment_method: input.paymentMethodId },
  })

  const stripeSub = await stripe.subscriptions.create({
    customer: input.stripeCustomerId,
    items: [{ price: priceId }],
    metadata: { vendorId: input.vendorId, tier: input.tier },
  })

  const now = new Date()
  const sub: VendorSubscription = {
    subscriptionId: `VSUB-${nanoid(10).toUpperCase()}`,
    vendorId: input.vendorId,
    tier: input.tier,
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId: input.stripeCustomerId,
    status: 'active',
    platformFeePercent: VENDOR_TIER_FEE[input.tier],
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  }

  const db = await getDb()
  // Upsert — vendor may already have a record from a prior tier
  await db.collection(COLLECTIONS.vendorSubscriptions).updateOne(
    { vendorId: input.vendorId },
    { $set: sub },
    { upsert: true }
  )
  await redis.del(RedisKeys.vendorSubscription(input.vendorId))

  logger.info('[subscriptions] Vendor upgraded', { vendorId: input.vendorId, tier: input.tier })
  return sub
}

// ─── Stripe Webhook Handlers ───────────────────────────────────────────────────

// Called from /api/webhooks/stripe for customer.subscription.updated events
export async function handleSubscriptionUpdated(
  stripeSubId: string,
  status: string,
  currentPeriodEnd: number,
  cancelAtPeriodEnd: boolean,
  metadata: Record<string, string>
): Promise<void> {
  const db = await getDb()

  if (metadata.userId) {
    await db.collection(COLLECTIONS.userSubscriptions).updateOne(
      { stripeSubscriptionId: stripeSubId },
      {
        $set: {
          status: status as UserSubscription['status'],
          currentPeriodEnd: new Date(currentPeriodEnd * 1000),
          cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      }
    )
    await redis.del(RedisKeys.userSubscription(metadata.userId))
    logger.info('[subscriptions] User subscription updated via webhook', { stripeSubId, status })
  }

  if (metadata.vendorId) {
    await db.collection(COLLECTIONS.vendorSubscriptions).updateOne(
      { stripeSubscriptionId: stripeSubId },
      {
        $set: {
          status: status as VendorSubscription['status'],
          currentPeriodEnd: new Date(currentPeriodEnd * 1000),
          cancelAtPeriodEnd,
          updatedAt: new Date(),
        },
      }
    )
    await redis.del(RedisKeys.vendorSubscription(metadata.vendorId))
    logger.info('[subscriptions] Vendor subscription updated via webhook', { stripeSubId, status })
  }
}

// Called on customer.subscription.deleted
export async function handleSubscriptionDeleted(stripeSubId: string): Promise<void> {
  const db = await getDb()

  const userSub = await db.collection(COLLECTIONS.userSubscriptions).findOneAndUpdate(
    { stripeSubscriptionId: stripeSubId },
    { $set: { status: 'cancelled', updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (userSub) {
    await redis.del(RedisKeys.userSubscription(userSub.userId as string))
    return
  }

  const vendorSub = await db.collection(COLLECTIONS.vendorSubscriptions).findOneAndUpdate(
    { stripeSubscriptionId: stripeSubId },
    { $set: { status: 'cancelled', updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (vendorSub) {
    await redis.del(RedisKeys.vendorSubscription(vendorSub.vendorId as string))
  }
}
