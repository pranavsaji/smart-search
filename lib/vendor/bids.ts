import { redis, RedisKeys } from '@/lib/cache/redis'
import { BID } from '@/lib/config/constants'

export interface BidRecord {
  vendorType: string
  normalized: number    // 0–1, injected into scorer
  validUntil: Date
}

/** Normalize bid amount to 0–1 range, clamped to MAX_AMOUNT_CENTS. */
export function normalizeBid(amountCents: number): number {
  return Math.min(amountCents / BID.MAX_AMOUNT_CENTS, 1.0)
}

/** Persist a bid in Redis with TTL matching validUntil. */
export async function storeBid(
  vendorType: string,
  normalized: number,
  validUntil: Date
): Promise<void> {
  const ttlSeconds = Math.floor((validUntil.getTime() - Date.now()) / 1000)
  if (ttlSeconds < BID.MIN_VALID_SECS) return

  await redis.set(
    RedisKeys.vendorBid(vendorType),
    String(normalized),
    { ex: ttlSeconds }
  )
}

/**
 * Fetch active bids for a set of vendor types.
 * Returns a map of vendorType → normalizedBid (0–1).
 * Missing or expired bids return 0.
 */
export async function getActiveBids(
  vendorTypes: string[]
): Promise<Record<string, number>> {
  if (vendorTypes.length === 0) return {}

  const unique = [...new Set(vendorTypes)]
  const keys = unique.map(RedisKeys.vendorBid)
  // mget returns values in the same order as keys; null when Redis is unconfigured
  const raw = await redis.mget<(string | null)[]>(...keys)
  const values: (string | null)[] = raw ?? new Array(unique.length).fill(null)

  return Object.fromEntries(
    unique.map((vt, i) => [vt, values[i] != null ? parseFloat(values[i] as string) : 0])
  )
}

/**
 * Build the bids-by-card-id map expected by rankCards().
 * Applies vendor-type bids to every card from that vendor.
 */
export async function buildCardBids(
  cards: { id: string; vendorType: string }[]
): Promise<Record<string, number>> {
  const vendorTypes = cards.map(c => c.vendorType)
  const vendorBids = await getActiveBids(vendorTypes)
  return Object.fromEntries(
    cards.map(c => [c.id, vendorBids[c.vendorType] ?? 0])
  )
}
