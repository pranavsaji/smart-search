// Phase 12.4 — Insight Cards types.

import type { ActivityType } from '@/lib/intent/types'

export interface CategorySpend {
  activityType: ActivityType
  orders: number
  spentCents: number
}

/** Pure, numeric summary of a user's activity over a period. */
export interface InsightStats {
  userId: string
  periodStart: string   // ISO date
  periodEnd: string     // ISO date
  currency: string
  orderCount: number
  totalSpentCents: number
  byCategory: CategorySpend[]
  topDestinations: string[]
  savingsVsMarketCents: number
  genieInteractions: number
}

/** A generated, persisted insight report (one per user per period). */
export interface InsightReport {
  reportId: string
  userId: string
  periodStart: string
  periodEnd: string
  headline: string
  narrative: string
  stats: InsightStats
  createdAt: Date
}
