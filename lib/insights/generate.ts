// Phase 12.4 — Insight Cards generation.
//
// Aggregates a user's recent activity into InsightStats, turns it into a
// narrative (LLM or mock), and persists one idempotent InsightReport per user
// per period. Powers the weekly "Your iAM Insights" email + in-app panel.
//
// Stats are reduced in JS from fetched documents (rather than aggregation
// pipelines) so they stay trivially unit-testable and tolerant of the varied
// item shapes different adapters write.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { INSIGHTS } from '@/lib/config/constants'
import { notifyInsightReady } from '@/lib/sse/notify'
import { sendWeeklyInsights } from '@/lib/mail'
import { generateNarrative } from './narrative'
import type { ActivityType } from '@/lib/intent/types'
import type { InsightStats, InsightReport, CategorySpend } from './types'

export type { InsightStats, InsightReport } from './types'

const COMPLETED_STATUSES = ['confirmed', 'shipped', 'delivered']

function periodBounds(now: Date, days: number): { start: Date; end: Date } {
  const end = now
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return { start, end }
}

function toRecord(x: unknown): Record<string, unknown> {
  return (x ?? {}) as Record<string, unknown>
}

// ─── Stats (pure-ish: one set of DB reads, JS reduction) ───────────────────────

export async function buildUserInsightStats(
  userId: string,
  opts: { now?: Date; days?: number } = {},
): Promise<InsightStats> {
  const now = opts.now ?? new Date()
  const days = opts.days ?? INSIGHTS.WEEKLY_LOOKBACK_DAYS
  const { start, end } = periodBounds(now, days)
  const db = await getDb()

  const [orders, stages, genieInteractions] = await Promise.all([
    db
      .collection(COLLECTIONS.vendorOrders)
      .find({ userId, status: { $in: COMPLETED_STATUSES }, createdAt: { $gte: start, $lte: end } })
      .toArray(),
    db
      .collection(COLLECTIONS.stages)
      .find({ initiatorId: userId, createdAt: { $gte: start, $lte: end } })
      .toArray(),
    db
      .collection(COLLECTIONS.agentTasks)
      .countDocuments({ userId, createdAt: { $gte: start, $lte: end } }),
  ])

  let totalSpentCents = 0
  let savingsVsMarketCents = 0
  let currency = 'GBP'
  const catMap = new Map<string, CategorySpend>()

  for (const raw of orders) {
    const order = toRecord(raw)
    totalSpentCents += (order.totalAmount as number) ?? 0
    if (order.currency) currency = order.currency as string
    const items = (order.items as Array<Record<string, unknown>>) ?? []
    // One order can span categories; attribute orderCount to each distinct category once.
    const seenCats = new Set<string>()
    for (const it of items) {
      const cat = ((it.activityType as string) ?? (it.category as string) ?? 'products') as ActivityType
      const qty = (it.quantity as number) ?? 1
      const price = (it.price as number) ?? 0
      const market = (it.marketPriceCents as number) ?? (it.listPriceCents as number) ?? 0
      if (market > price) savingsVsMarketCents += (market - price) * qty

      const entry = catMap.get(cat) ?? { activityType: cat, orders: 0, spentCents: 0 }
      entry.spentCents += price * qty
      if (!seenCats.has(cat)) {
        entry.orders += 1
        seenCats.add(cat)
      }
      catMap.set(cat, entry)
    }
  }

  // Top destinations from this period's stages.
  const destCounts = new Map<string, number>()
  for (const raw of stages) {
    const dest = (toRecord(toRecord(raw).parsedIntent).destination as string) ?? ''
    if (dest && dest !== 'UNKNOWN') destCounts.set(dest, (destCounts.get(dest) ?? 0) + 1)
  }
  const topDestinations = [...destCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, INSIGHTS.MAX_TOP_DESTINATIONS)
    .map(([d]) => d)

  const byCategory = [...catMap.values()]
    .sort((a, b) => b.spentCents - a.spentCents)
    .slice(0, INSIGHTS.MAX_TOP_CATEGORIES)

  return {
    userId,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    currency,
    orderCount: orders.length,
    totalSpentCents,
    byCategory,
    topDestinations,
    savingsVsMarketCents,
    genieInteractions,
  }
}

// ─── Report generation + persistence ───────────────────────────────────────────

/**
 * Build stats, generate a narrative, and persist an idempotent report.
 * Returns null when there's nothing to report (no completed orders this period)
 * so the cron doesn't email an empty digest. Idempotent on (userId, periodStart).
 */
export async function generateInsightReport(
  userId: string,
  opts: { now?: Date; days?: number; force?: boolean } = {},
): Promise<InsightReport | null> {
  const stats = await buildUserInsightStats(userId, opts)
  if (stats.orderCount === 0 && !opts.force) return null

  const { headline, narrative } = await generateNarrative(stats)
  const db = await getDb()
  const now = opts.now ?? new Date()
  const report: InsightReport = {
    reportId: `insight_${nanoid(16)}`,
    userId,
    periodStart: stats.periodStart,
    periodEnd: stats.periodEnd,
    headline,
    narrative,
    stats,
    createdAt: now,
  }

  // Idempotent: only the first generation for a (userId, periodStart) inserts;
  // re-runs refresh the narrative/stats without duplicating.
  await db.collection(COLLECTIONS.insightReports).updateOne(
    { userId, periodStart: stats.periodStart },
    {
      $set: { headline, narrative, stats, periodEnd: stats.periodEnd, createdAt: now },
      $setOnInsert: { reportId: report.reportId, userId, periodStart: stats.periodStart },
    },
    { upsert: true },
  )

  try {
    await redis.set(RedisKeys.insightLatest(userId), JSON.stringify(report), { ex: 3600 })
  } catch {
    /* cache best-effort */
  }

  return report
}

export async function getUserInsights(userId: string, limit = 12): Promise<InsightReport[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.insightReports)
    .find({ userId })
    .sort({ periodStart: -1 })
    .limit(limit)
    .toArray()
  return docs as unknown as InsightReport[]
}

// ─── Delivery ───────────────────────────────────────────────────────────────────

interface UserContact {
  email?: string
  name?: string
  handle?: string
}

async function getUserContact(userId: string): Promise<UserContact | null> {
  const db = await getDb()
  const user = (await db.collection(COLLECTIONS.users).findOne({ _id: userId as never })) as
    | Record<string, unknown>
    | null
  if (!user) return null
  return { email: user.email as string, name: user.name as string, handle: user.handle as string }
}

function statRows(stats: InsightStats): Array<{ label: string; value: string }> {
  const money = (m: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: stats.currency.toUpperCase() }).format(m / 100)
  const rows = [
    { label: 'Orders', value: String(stats.orderCount) },
    { label: 'Total spent', value: money(stats.totalSpentCents) },
  ]
  if (stats.savingsVsMarketCents > 0) rows.push({ label: 'Saved vs market', value: money(stats.savingsVsMarketCents) })
  if (stats.genieInteractions > 0) rows.push({ label: 'Genie tasks', value: String(stats.genieInteractions) })
  if (stats.topDestinations.length) rows.push({ label: 'Top destinations', value: stats.topDestinations.join(', ') })
  return rows
}

/**
 * Generate this period's report for a user and deliver it (email + SSE).
 * Returns whether a report was produced and emailed.
 */
export async function sendWeeklyInsightsForUser(
  userId: string,
  opts: { now?: Date } = {},
): Promise<{ sent: boolean; reportId?: string }> {
  const report = await generateInsightReport(userId, opts)
  if (!report) return { sent: false }

  const contact = await getUserContact(userId)
  const periodLabel = `${report.periodStart} → ${report.periodEnd}`

  await Promise.allSettled([
    notifyInsightReady(userId, {
      reportId: report.reportId,
      periodStart: report.periodStart,
      headline: report.headline,
    }),
    contact?.email
      ? sendWeeklyInsights({
          to: contact.email,
          recipientName: contact.name ?? contact.handle ?? 'there',
          headline: report.headline,
          narrative: report.narrative,
          stats: statRows(report.stats),
          periodLabel,
        })
      : Promise.resolve(),
  ])

  logger.info('[insights] weekly report sent', { userId, reportId: report.reportId })
  return { sent: true, reportId: report.reportId }
}

/** Cron entry: generate + send for every user with completed orders this period. */
export async function scanAllWeeklyInsights(opts: { now?: Date } = {}): Promise<{ users: number; sent: number }> {
  const now = opts.now ?? new Date()
  const { start } = periodBounds(now, INSIGHTS.WEEKLY_LOOKBACK_DAYS)
  const db = await getDb()

  const userIds = (await db
    .collection(COLLECTIONS.vendorOrders)
    .distinct('userId', { status: { $in: COMPLETED_STATUSES }, createdAt: { $gte: start } })) as string[]

  let sent = 0
  for (const userId of userIds) {
    try {
      const res = await sendWeeklyInsightsForUser(userId, { now })
      if (res.sent) sent++
    } catch (err) {
      logger.error('[insights] user weekly send failed', err, { userId })
    }
  }
  logger.info('[insights] weekly scan complete', { users: userIds.length, sent })
  return { users: userIds.length, sent }
}
