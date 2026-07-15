import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { getStripe } from '@/lib/payments/stripe'
import { logger } from '@/lib/logger'
import type { Wallet, WalletCurrency } from './types'

export type { Wallet }

export interface WalletTransaction {
  txId: string
  userId: string
  type: string
  amountCents: number
  balanceAfterCents: number
  description: string
  referenceId?: string
  createdAt: Date
}

const BALANCE_CACHE_TTL = 300  // 5 minutes
const TOPUP_INTENT_TTL = 86400 // 24h — window for Stripe to deliver webhook

// ─── Wallet Creation ──────────────────────────────────────────────────────────

export async function getOrCreateWallet(
  userId: string,
  currency: WalletCurrency = 'USD'
): Promise<Wallet> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.wallets).findOne({ userId })
  if (existing) return existing as unknown as Wallet

  const wallet: Wallet = {
    walletId: `WAL-${nanoid(10).toUpperCase()}`,
    userId,
    balanceCents: 0,
    currency,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await db.collection(COLLECTIONS.wallets).insertOne({ _id: new ObjectId(), ...wallet })
  return wallet
}

export async function getWallet(userId: string): Promise<Wallet | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.wallets).findOne({ userId })
  return doc as unknown as Wallet | null
}

// ─── Top-up Flow ──────────────────────────────────────────────────────────────

export interface TopUpResult {
  paymentIntentId: string
  clientSecret: string
  amountCents: number
  currency: string
}

export async function createTopUpIntent(
  userId: string,
  amountCents: number,
  currency: WalletCurrency = 'USD'
): Promise<TopUpResult> {
  if (amountCents < 100) throw new Error('TOPUP_MINIMUM_100')
  if (amountCents > 1_000_000) throw new Error('TOPUP_MAXIMUM_EXCEEDED')

  const stripe = getStripe()
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: currency.toLowerCase(),
    metadata: { userId, purpose: 'wallet_topup' },
    automatic_payment_methods: { enabled: true },
  })

  // Cache pending intent for idempotent webhook handling
  await redis.set(
    RedisKeys.walletTopup(intent.id),
    JSON.stringify({ userId, amountCents, currency }),
    { ex: TOPUP_INTENT_TTL }
  )

  logger.info('[wallet] Top-up intent created', { userId, amountCents, paymentIntentId: intent.id })

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret!,
    amountCents,
    currency,
  }
}

// Called from Stripe webhook on payment_intent.succeeded.
// Idempotent: Redis key must be present to proceed — prevents double-credit on replay.
export async function creditWalletFromPayment(
  paymentIntentId: string,
  userId: string,
  amountCents: number
): Promise<Wallet | null> {
  const cached = await redis.get(RedisKeys.walletTopup(paymentIntentId))
  if (!cached) {
    logger.warn('[wallet] Top-up webhook: no pending intent (already processed or unknown)', { paymentIntentId })
    return null
  }

  const db = await getDb()
  const result = await db.collection(COLLECTIONS.wallets).findOneAndUpdate(
    { userId },
    { $inc: { balanceCents: amountCents }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after', upsert: false }
  )

  if (!result) {
    logger.error('[wallet] Top-up: wallet not found', { userId, paymentIntentId })
    return null
  }

  await recordWalletTx(db, {
    userId,
    type: 'topup',
    amountCents,
    balanceAfterCents: (result as unknown as Wallet).balanceCents,
    description: 'Wallet top-up via card',
    referenceId: paymentIntentId,
  })

  await Promise.all([
    redis.del(RedisKeys.walletBalance(userId)),
    redis.del(RedisKeys.walletTopup(paymentIntentId)),  // consumed — prevent replay
  ])

  logger.info('[wallet] Wallet credited', { userId, amountCents, paymentIntentId })
  return result as unknown as Wallet
}

// ─── Balance Operations ───────────────────────────────────────────────────────

// Atomic debit with balance guard — same pattern as catalog stock decrement.
// Throws INSUFFICIENT_BALANCE if balance < amountCents.
export async function debitWallet(
  userId: string,
  amountCents: number,
  referenceId: string,
  description: string
): Promise<Wallet> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.wallets).findOneAndUpdate(
    { userId, balanceCents: { $gte: amountCents } },
    { $inc: { balanceCents: -amountCents }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result) throw new Error('INSUFFICIENT_BALANCE')

  await recordWalletTx(db, {
    userId,
    type: 'debit',
    amountCents: -amountCents,
    balanceAfterCents: (result as unknown as Wallet).balanceCents,
    description,
    referenceId,
  })

  await redis.del(RedisKeys.walletBalance(userId))
  return result as unknown as Wallet
}

export async function getWalletBalance(userId: string): Promise<number> {
  const cached = await redis.get(RedisKeys.walletBalance(userId))
  if (cached !== null) return Number(cached)

  const wallet = await getWallet(userId)
  const balance = wallet?.balanceCents ?? 0
  await redis.set(RedisKeys.walletBalance(userId), balance, { ex: BALANCE_CACHE_TTL })
  return balance
}

// ─── Transaction History ──────────────────────────────────────────────────────

export async function getWalletTransactions(userId: string, limit = 50): Promise<WalletTransaction[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.walletTransactions)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs as unknown as WalletTransaction[]
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface TxInput {
  userId: string
  type: string
  amountCents: number
  balanceAfterCents: number
  description: string
  referenceId?: string
}

async function recordWalletTx(
  db: Awaited<ReturnType<typeof getDb>>,
  input: TxInput
): Promise<void> {
  await db.collection(COLLECTIONS.walletTransactions).insertOne({
    _id: new ObjectId(),
    txId: `TXN-${nanoid(10).toUpperCase()}`,
    ...input,
    createdAt: new Date(),
  })
}
