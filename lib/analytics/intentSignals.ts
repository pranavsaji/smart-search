// Phase 12.1 — Intent Analytics for Vendors.
//
// Vendors get demand signals for their category — search volume, conversion,
// forecasts — derived from the `stages` collection. Two hard rules:
//
//   1. PRIVACY BY DEFAULT. Everything is aggregated and anonymised. A vendor
//      never sees a userId or an individual intent. Any aggregate covering
//      fewer than ANALYTICS.MIN_COHORT_SIZE distinct users is suppressed
//      (k-anonymity) so a small cohort can't be de-anonymised.
//   2. NORTH-STAR UNTOUCHED. Analytics is read-only over stages. It feeds
//      dashboards, never the ranking gate. Vendors cannot buy relevance with it.
//
// The pure projection helpers (projectDemand) are split out so forecasting is
// unit-testable without a database.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { logger } from '@/lib/logger'
import { ANALYTICS } from '@/lib/config/constants'
import { nanoid } from 'nanoid'
import type { ActivityType } from '@/lib/intent/types'
import type {
  CategoryDemand,
  DestinationDemand,
  ConversionFunnel,
  DemandForecast,
  AnonymisedIntent,
  VendorAnalytics,
  AnalyticsRollup,
  AnalyticsWindow,
} from './types'

// ─── Privacy ────────────────────────────────────────────────────────────────

/** k-anonymity: drop any row whose cohort is smaller than the threshold. */
export function applyKAnonymity<T extends { uniqueUsers: number }>(
  rows: T[],
  minCohort: number = ANALYTICS.MIN_COHORT_SIZE,
): T[] {
  return rows.filter(r => r.uniqueUsers >= minCohort)
}

function defaultSince(days = ANALYTICS.ROLLUP_WINDOW_DAYS, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function windowMatch(win: AnalyticsWindow): Record<string, unknown> {
  const createdAt: Record<string, Date> = {}
  createdAt.$gte = win.since ?? defaultSince()
  if (win.until) createdAt.$lte = win.until
  return { createdAt }
}

// ─── Pure forecasting ────────────────────────────────────────────────────────

/**
 * Project demand from a series of daily counts. Uses the window mean for the
 * level and compares the recent half to the older half to label the trend.
 * Pure + deterministic → unit-testable with no DB.
 */
export function projectDemand(
  dailyCounts: number[],
  horizonDays: number,
): { dailyAverage: number; projectedTotal: number; trend: 'rising' | 'flat' | 'falling' } {
  if (dailyCounts.length === 0) {
    return { dailyAverage: 0, projectedTotal: 0, trend: 'flat' }
  }
  const sum = dailyCounts.reduce((a, b) => a + b, 0)
  const dailyAverage = sum / dailyCounts.length
  const projectedTotal = Math.round(dailyAverage * horizonDays)

  const mid = Math.floor(dailyCounts.length / 2)
  const older = dailyCounts.slice(0, mid)
  const recent = dailyCounts.slice(mid)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const olderAvg = avg(older)
  const recentAvg = avg(recent)
  let trend: 'rising' | 'flat' | 'falling' = 'flat'
  // 15% band around the older average — anything inside is "flat".
  if (recentAvg > olderAvg * 1.15) trend = 'rising'
  else if (recentAvg < olderAvg * 0.85) trend = 'falling'

  return { dailyAverage: Number(dailyAverage.toFixed(2)), projectedTotal, trend }
}

// ─── Aggregations over `stages` ───────────────────────────────────────────────

/** Search volume per activity category, k-anonymised. */
export async function categoryDemand(win: AnalyticsWindow = {}): Promise<CategoryDemand[]> {
  const db = await getDb()
  const rows = (await db
    .collection(COLLECTIONS.stages)
    .aggregate([
      { $match: windowMatch(win) },
      { $unwind: '$parsedIntent.activityTypes' },
      {
        $group: {
          _id: '$parsedIntent.activityTypes',
          searches: { $sum: 1 },
          users: { $addToSet: '$initiatorId' },
        },
      },
      { $project: { _id: 0, activityType: '$_id', searches: 1, uniqueUsers: { $size: '$users' } } },
      { $sort: { searches: -1 } },
    ])
    .toArray()) as unknown as CategoryDemand[]
  return applyKAnonymity(rows)
}

/** Search volume per destination, k-anonymised. */
export async function destinationDemand(
  win: AnalyticsWindow = {},
  limit: number = ANALYTICS.FEED_RECENT_LIMIT,
): Promise<DestinationDemand[]> {
  const db = await getDb()
  const rows = (await db
    .collection(COLLECTIONS.stages)
    .aggregate([
      { $match: { ...windowMatch(win), 'parsedIntent.destination': { $nin: [null, '', 'UNKNOWN'] } } },
      {
        $group: {
          _id: '$parsedIntent.destination',
          searches: { $sum: 1 },
          users: { $addToSet: '$initiatorId' },
        },
      },
      { $project: { _id: 0, destination: '$_id', searches: 1, uniqueUsers: { $size: '$users' } } },
      { $sort: { searches: -1 } },
      { $limit: limit },
    ])
    .toArray()) as unknown as DestinationDemand[]
  return applyKAnonymity(rows)
}

/** Funnel: intents → carts → completed orders for an optional category. */
export async function conversionFunnel(
  activityType: ActivityType | undefined,
  win: AnalyticsWindow = {},
): Promise<ConversionFunnel> {
  const db = await getDb()
  const match: Record<string, unknown> = windowMatch(win)
  if (activityType) match['parsedIntent.activityTypes'] = activityType

  const stageMatch = { ...match }
  const [stages, carts, orders] = await Promise.all([
    db.collection(COLLECTIONS.stages).countDocuments(stageMatch),
    db.collection(COLLECTIONS.stages).countDocuments({ ...stageMatch, status: { $in: ['cart', 'checkout', 'confirmed', 'completed'] } }),
    db.collection(COLLECTIONS.vendorOrders).countDocuments(
      activityType
        ? { ...windowMatch(win), 'items.activityType': activityType }
        : windowMatch(win),
    ),
  ])

  const rate = (num: number, den: number) => (den > 0 ? Number((num / den).toFixed(4)) : 0)
  return {
    activityType,
    stages,
    carts,
    orders,
    stageToCartRate: rate(carts, stages),
    cartToOrderRate: rate(orders, carts),
    overallConversion: rate(orders, stages),
  }
}

/** Forecast demand for a category from its recent daily search counts. */
export async function forecastDemand(
  activityType: ActivityType,
  win: AnalyticsWindow = {},
): Promise<DemandForecast | null> {
  const db = await getDb()
  const since = win.since ?? defaultSince()
  const rows = (await db
    .collection(COLLECTIONS.stages)
    .aggregate([
      { $match: { createdAt: { $gte: since }, 'parsedIntent.activityTypes': activityType } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()) as unknown as Array<{ _id: string; count: number }>

  if (rows.length < ANALYTICS.FORECAST_MIN_HISTORY_DAYS) return null

  const counts = rows.map(r => r.count)
  const { dailyAverage, projectedTotal, trend } = projectDemand(counts, ANALYTICS.FORECAST_HORIZON_DAYS)
  return {
    activityType,
    horizonDays: ANALYTICS.FORECAST_HORIZON_DAYS,
    dailyAverage,
    projectedTotal,
    trend,
    historyDays: rows.length,
  }
}

/** Recent anonymised intents — the "real-time intent feed". userId is stripped. */
export async function realtimeIntentFeed(
  opts: { limit?: number; activityType?: ActivityType } = {},
): Promise<AnonymisedIntent[]> {
  const db = await getDb()
  const limit = Math.min(opts.limit ?? ANALYTICS.FEED_RECENT_LIMIT, 200)
  const match: Record<string, unknown> = {}
  if (opts.activityType) match['parsedIntent.activityTypes'] = opts.activityType

  const docs = (await db
    .collection(COLLECTIONS.stages)
    .find(match, {
      // Project away everything identifying — only aggregate-safe fields leave.
      projection: {
        _id: 0,
        'parsedIntent.destination': 1,
        'parsedIntent.activityTypes': 1,
        'parsedIntent.budgetSignal': 1,
        createdAt: 1,
      },
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()) as unknown as Array<{ parsedIntent?: Record<string, unknown>; createdAt: Date }>

  return docs.map(d => ({
    destination: (d.parsedIntent?.destination as string) ?? 'UNKNOWN',
    activityTypes: (d.parsedIntent?.activityTypes as ActivityType[]) ?? [],
    budgetSignal: (d.parsedIntent?.budgetSignal as AnonymisedIntent['budgetSignal']) ?? 'unspecified',
    at: d.createdAt,
  }))
}

// ─── Vendor-facing bundle ─────────────────────────────────────────────────────

async function vendorCategory(vendorId: string): Promise<ActivityType | null> {
  const db = await getDb()
  const vendor = (await db.collection(COLLECTIONS.vendors).findOne({ vendorId })) as
    | { category?: ActivityType }
    | null
  return vendor?.category ?? null
}

/**
 * Build the vendor-facing analytics bundle for the vendor's own category.
 * Returns null when the vendor (or its category) can't be resolved.
 */
export async function vendorAnalytics(
  vendorId: string,
  win: AnalyticsWindow = {},
): Promise<VendorAnalytics | null> {
  const category = await vendorCategory(vendorId)
  if (!category) {
    logger.warn('[analytics] vendor has no category', { vendorId })
    return null
  }

  const [allDemand, conversion, forecast, dests] = await Promise.all([
    categoryDemand(win),
    conversionFunnel(category, win),
    forecastDemand(category, win),
    destinationDemand(win, 5),
  ])

  const demand = allDemand.find(d => d.activityType === category) ?? null
  return {
    vendorId,
    category,
    demand,
    conversion,
    forecast,
    topDestinations: dests,
    windowDays: ANALYTICS.ROLLUP_WINDOW_DAYS,
    generatedAt: new Date(),
  }
}

// ─── Daily rollup (cron) ───────────────────────────────────────────────────────

/**
 * Roll up one UTC day's stage activity into `analytics_rollups` for fast
 * dashboard reads. Idempotent: upserts on (date, scope), so a re-run for the
 * same day overwrites rather than duplicating.
 */
export async function computeDailyRollup(day: Date): Promise<{ scopes: number }> {
  const db = await getDb()
  const dateStr = day.toISOString().slice(0, 10)
  const start = new Date(`${dateStr}T00:00:00.000Z`)
  const end = new Date(`${dateStr}T23:59:59.999Z`)

  const perCategory = (await db
    .collection(COLLECTIONS.stages)
    .aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $unwind: '$parsedIntent.activityTypes' },
      {
        $group: {
          _id: '$parsedIntent.activityTypes',
          searches: { $sum: 1 },
          users: { $addToSet: '$initiatorId' },
        },
      },
      { $project: { _id: 0, scope: { $concat: ['category:', '$_id'] }, searches: 1, uniqueUsers: { $size: '$users' } } },
    ])
    .toArray()) as unknown as Array<{ scope: string; searches: number; uniqueUsers: number }>

  const globalAgg = (await db
    .collection(COLLECTIONS.stages)
    .aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, searches: { $sum: 1 }, users: { $addToSet: '$initiatorId' } } },
      { $project: { _id: 0, scope: 'global', searches: 1, uniqueUsers: { $size: '$users' } } },
    ])
    .toArray()) as unknown as Array<{ scope: string; searches: number; uniqueUsers: number }>

  const orders = await db
    .collection(COLLECTIONS.vendorOrders)
    .countDocuments({ createdAt: { $gte: start, $lte: end } })

  const rows = [...globalAgg, ...perCategory]
  await Promise.all(
    rows.map(r => {
      const rollup: AnalyticsRollup = {
        rollupId: `rollup_${nanoid(12)}`,
        date: dateStr,
        scope: r.scope,
        searches: r.searches,
        uniqueUsers: r.uniqueUsers,
        orders: r.scope === 'global' ? orders : 0,
        createdAt: new Date(),
      }
      return db.collection(COLLECTIONS.analyticsRollups).updateOne(
        { date: dateStr, scope: r.scope },
        { $set: { searches: rollup.searches, uniqueUsers: rollup.uniqueUsers, orders: rollup.orders, createdAt: rollup.createdAt }, $setOnInsert: { rollupId: rollup.rollupId, date: dateStr, scope: r.scope } },
        { upsert: true },
      )
    }),
  )

  logger.info('[analytics] daily rollup complete', { date: dateStr, scopes: rows.length })
  return { scopes: rows.length }
}
