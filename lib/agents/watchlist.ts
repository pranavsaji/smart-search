// Phase 11.3 — Watchlist & Price Alerts.
//
// Users "watch" items (flights, products, experiences). A background poller
// re-prices each item on its own cadence and fires a single alert when the
// price drops to or below the target. The alert is re-armed only when the price
// rises back above the target — so a user gets one alert per drop, not one per
// poll.
//
// Price lookup is injected (PriceProvider) so the poller is fully testable and
// works mock-first without live API keys.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { notifyPriceAlert } from '@/lib/sse/notify'
import { sendPushToUser } from '@/lib/notifications/push'
import { defaultPriceProvider } from './priceProvider'
import type {
  WatchlistItem,
  CreateWatchlistInput,
  PriceCheckResult,
  PriceProvider,
  WatchItemType,
} from './types'

export type { WatchlistItem, PriceCheckResult }

// Sensible default poll cadences by item type (minutes).
const DEFAULT_POLL_MINUTES: Partial<Record<WatchItemType, number>> = {
  flights: 360,   // every 6h
  stays: 360,
  cars: 360,
  experiences: 720,
  products: 60,   // every 1h
  digital_services: 720,
  home_services: 1440,
  health_services: 1440,
  appointments: 1440,
}

function defaultPollMinutes(type: WatchItemType): number {
  return DEFAULT_POLL_MINUTES[type] ?? 360
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createWatch(input: CreateWatchlistInput): Promise<WatchlistItem> {
  if (input.targetPriceCents <= 0) throw new Error('targetPriceCents must be positive')
  const db = await getDb()
  const now = new Date()
  const item: WatchlistItem = {
    watchId: `watch_${nanoid(16)}`,
    userId: input.userId,
    target: input.target,
    targetPriceCents: input.targetPriceCents,
    pollIntervalMinutes: input.pollIntervalMinutes ?? defaultPollMinutes(input.target.itemType),
    active: true,
    alertSent: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COLLECTIONS.watchlist).insertOne({ ...item })
  return item
}

export async function getWatch(watchId: string): Promise<WatchlistItem | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.watchlist).findOne({ watchId })
  return doc as unknown as WatchlistItem | null
}

export async function getUserWatchlist(
  userId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<WatchlistItem[]> {
  const db = await getDb()
  const filter: Record<string, unknown> = { userId }
  if (opts.activeOnly) filter.active = true
  const docs = await db
    .collection(COLLECTIONS.watchlist)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()
  return docs as unknown as WatchlistItem[]
}

export async function deactivateWatch(watchId: string, userId: string): Promise<boolean> {
  const db = await getDb()
  const res = await db.collection(COLLECTIONS.watchlist).updateOne(
    { watchId, userId },
    { $set: { active: false, updatedAt: new Date() } },
  )
  return res.matchedCount > 0
}

export async function deleteWatch(watchId: string, userId: string): Promise<boolean> {
  const db = await getDb()
  const res = await db.collection(COLLECTIONS.watchlist).deleteOne({ watchId, userId })
  return res.deletedCount > 0
}

// ─── Poll one item ──────────────────────────────────────────────────────────

/**
 * Re-price a single watch item and fire an alert if it crossed the threshold.
 * Pure side-effect set: DB update + (on alert) push/SSE + price cache.
 */
export async function checkWatchItem(
  item: WatchlistItem,
  provider: PriceProvider = defaultPriceProvider,
): Promise<PriceCheckResult> {
  if (!item.active) {
    return { watchId: item.watchId, checked: false, alertFired: false, reason: 'inactive' }
  }

  const quote = await provider.lookup(item.target)
  if (!quote) {
    return { watchId: item.watchId, checked: false, alertFired: false, reason: 'no_quote' }
  }

  const now = new Date()
  const price = quote.priceCents
  const lowest = Math.min(item.lowestSeenCents ?? price, price)
  const hitTarget = price <= item.targetPriceCents

  // Fire exactly once per drop: only when target is hit AND not already alerted.
  const alertFired = hitTarget && !item.alertSent
  // Re-arm when price rises back above target.
  const newAlertSent = hitTarget ? true : false

  const update: Record<string, unknown> = {
    currentPriceCents: price,
    lowestSeenCents: lowest,
    lastCheckedAt: now,
    alertSent: newAlertSent,
    updatedAt: now,
  }
  if (alertFired) update.lastAlertAt = now

  const db = await getDb()
  await db.collection(COLLECTIONS.watchlist).updateOne({ watchId: item.watchId }, { $set: update })

  // Best-effort price cache (TTL ~ poll interval) — informational only.
  try {
    await redis.set(RedisKeys.watchPrice(item.watchId), price, {
      ex: item.pollIntervalMinutes * 60,
    })
  } catch {
    /* cache is best-effort */
  }

  if (alertFired) {
    await fireAlert(item, price, quote.currency)
  }

  return { watchId: item.watchId, checked: true, priceCents: price, alertFired }
}

async function fireAlert(item: WatchlistItem, priceCents: number, currency: string): Promise<void> {
  const payload = {
    watchId: item.watchId,
    label: item.target.label,
    priceCents,
    targetPriceCents: item.targetPriceCents,
    currency,
  }
  // Fire-and-forget; one failing channel must not block the others.
  await Promise.allSettled([
    notifyPriceAlert(item.userId, payload),
    sendPushToUser(item.userId, {
      title: 'Price drop 🔔',
      body: `${item.target.label} is now ${(priceCents / 100).toFixed(2)} ${currency} (target ${(item.targetPriceCents / 100).toFixed(2)}).`,
      data: { type: 'price_alert', watchId: item.watchId },
    }),
  ])
  logger.info('[watchlist] price alert fired', { watchId: item.watchId, priceCents })
}

// ─── Cron scan ──────────────────────────────────────────────────────────────

/** Find watch items whose poll cadence is due and check each one. */
export async function scanDueWatches(
  provider: PriceProvider = defaultPriceProvider,
  now: Date = new Date(),
): Promise<{ scanned: number; alerts: number }> {
  const db = await getDb()
  const candidates = (await db
    .collection(COLLECTIONS.watchlist)
    .find({ active: true })
    .toArray()) as unknown as WatchlistItem[]

  let scanned = 0
  let alerts = 0

  for (const item of candidates) {
    const due =
      !item.lastCheckedAt ||
      now.getTime() - new Date(item.lastCheckedAt).getTime() >=
        item.pollIntervalMinutes * 60 * 1000
    if (!due) continue

    try {
      const res = await checkWatchItem(item, provider)
      if (res.checked) scanned++
      if (res.alertFired) alerts++
    } catch (err) {
      logger.error('[watchlist] check failed', err, { watchId: item.watchId })
    }
  }

  logger.info('[watchlist] scan complete', { scanned, alerts })
  return { scanned, alerts }
}
