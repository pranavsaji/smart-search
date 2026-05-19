// Phase 12.1 — Intent Analytics for Vendors.
// Shared types for the (anonymised, aggregated) intent-signal product.

import type { ActivityType, BudgetSignal } from '@/lib/intent/types'

/** Demand for one activity category over a window. uniqueUsers is k-anonymised. */
export interface CategoryDemand {
  activityType: ActivityType
  searches: number
  uniqueUsers: number
}

/** Demand for one destination over a window. */
export interface DestinationDemand {
  destination: string
  searches: number
  uniqueUsers: number
}

/** Funnel from intent → cart → completed order for a category. */
export interface ConversionFunnel {
  activityType?: ActivityType
  stages: number          // intents expressed (top of funnel)
  carts: number           // stages that produced a cart
  orders: number          // completed orders
  stageToCartRate: number // 0–1
  cartToOrderRate: number // 0–1
  overallConversion: number // stages → orders, 0–1
}

/** Forward-looking projection from recent daily demand. */
export interface DemandForecast {
  activityType: ActivityType
  horizonDays: number
  dailyAverage: number
  projectedTotal: number
  trend: 'rising' | 'flat' | 'falling'
  historyDays: number
}

/** One anonymised entry in the real-time intent feed — never carries a userId. */
export interface AnonymisedIntent {
  destination: string
  activityTypes: ActivityType[]
  budgetSignal: BudgetSignal
  at: Date
}

/** A vendor-facing analytics bundle for the vendor's own category. */
export interface VendorAnalytics {
  vendorId: string
  category: ActivityType
  demand: CategoryDemand | null      // null when suppressed by k-anonymity
  conversion: ConversionFunnel
  forecast: DemandForecast | null
  topDestinations: DestinationDemand[]
  windowDays: number
  generatedAt: Date
}

/** A persisted daily rollup row (fast dashboard reads, no live aggregation). */
export interface AnalyticsRollup {
  rollupId: string
  date: string                       // YYYY-MM-DD (UTC)
  scope: string                      // 'global' or `category:<type>`
  searches: number
  uniqueUsers: number
  orders: number
  createdAt: Date
}

export interface AnalyticsWindow {
  since?: Date
  until?: Date
}
