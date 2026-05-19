// Phase 12.2 — Feature vectors for personalised (ML) ranking.
//
// A user and a card are projected into the SAME feature space so cosine
// similarity is meaningful. The space is deliberately small and interpretable:
//
//   [ 12 activity-type dims ] + [ 3 budget-tier dims ]  =  15 dims
//
//   • User: activity dims = the user's activityPreferences (0–1 each);
//           budget dims    = one-hot-ish from their spendingSignal.
//   • Card: activity dims = one-hot of the card's serviceType;
//           budget dims    = tier derived from the card's price.
//
// All components are non-negative, so cosine ∈ [0, 1] and can be used directly
// as a personal-fit score. Pure + dependency-free → trivially unit-testable.

import type { ActivityType, BudgetSignal, IntentGraph } from '@/lib/intent/types'
import type { ServiceCard } from '@/lib/services/types'
import { ML_RANKING } from '@/lib/config/constants'

/** Canonical, stable ordering of activity types — the feature axis order. */
export const ACTIVITY_AXES: readonly ActivityType[] = [
  'flights', 'stays', 'cars', 'experiences', 'restaurants', 'weather', 'maps',
  'products', 'digital_services', 'home_services', 'health_services', 'appointments',
] as const

export const FEATURE_DIMS = ACTIVITY_AXES.length + 3 // + 3 budget tiers

// ─── Math ─────────────────────────────────────────────────────────────────────

export function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function magnitude(a: number[]): number {
  return Math.sqrt(dot(a, a))
}

/** Cosine similarity. Returns 0 when either vector is all-zero (no signal). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('cosineSimilarity: dimension mismatch')
  const ma = magnitude(a)
  const mb = magnitude(b)
  if (ma === 0 || mb === 0) return 0
  const cos = dot(a, b) / (ma * mb)
  // Guard against tiny FP overshoot beyond [0,1].
  return Math.max(0, Math.min(1, cos))
}

// ─── Budget tier encoding ──────────────────────────────────────────────────────

/** [budget, mid, premium] one-hot from a discrete signal; neutral when unknown. */
function budgetTierFromSignal(signal: BudgetSignal): [number, number, number] {
  switch (signal) {
    case 'budget':    return [1, 0, 0]
    case 'mid-range': return [0, 1, 0]
    case 'premium':   return [0, 0, 1]
    default:          return [1 / 3, 1 / 3, 1 / 3] // unspecified → neutral
  }
}

/** [budget, mid, premium] from a card's price in minor units. */
function budgetTierFromPrice(amountMinor?: number): [number, number, number] {
  if (amountMinor === undefined) return [1 / 3, 1 / 3, 1 / 3]
  if (amountMinor <= ML_RANKING.PRICE_TIER_BUDGET_MAX) return [1, 0, 0]
  if (amountMinor >= ML_RANKING.PRICE_TIER_PREMIUM_MIN) return [0, 0, 1]
  return [0, 1, 0]
}

// ─── Vectors ────────────────────────────────────────────────────────────────────

export function userFeatureVector(graph: IntentGraph): number[] {
  const prefs = graph.activityPreferences ?? ({} as Record<ActivityType, number>)
  const activity = ACTIVITY_AXES.map(t => clamp01(prefs[t] ?? 0))
  const budget = budgetTierFromSignal(graph.spendingSignal ?? 'unspecified')
  return [...activity, ...budget]
}

export function cardFeatureVector(card: ServiceCard): number[] {
  const activity = ACTIVITY_AXES.map(t => (t === card.serviceType ? 1 : 0))
  const budget = budgetTierFromPrice(card.price?.amount)
  return [...activity, ...budget]
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  return Math.max(0, Math.min(1, x))
}
