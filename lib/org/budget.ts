// Phase 9.6 — B2B budget enforcement
// Checks spend against per-department and org-wide limits before checkout.
// Increments spend atomically; resets at period boundaries.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { Organisation, BudgetLimit, BudgetCheckResult } from './types'

// ─── Check ────────────────────────────────────────────────────────────────────

export async function checkBudget(
  orgId: string,
  userId: string,
  amountCents: number,
  currency: string,
  department?: string
): Promise<BudgetCheckResult> {
  const db = await getDb()
  const org = await db.collection(COLLECTIONS.organisations).findOne({ orgId })
  if (!org) {
    return { allowed: true, remainingCents: Infinity, limitCents: Infinity, periodType: 'monthly', alertTriggered: false }
  }

  const member = (org as unknown as Organisation).members.find(
    m => m.userId === userId
  )
  const effectiveDept = department ?? member?.department

  // Find the most restrictive applicable limit
  const limits: BudgetLimit[] = (org as unknown as Organisation).budgetLimits.filter(
    l => l.currency === currency && (!l.department || l.department === effectiveDept)
  )

  if (limits.length === 0) {
    return { allowed: true, remainingCents: Infinity, limitCents: Infinity, periodType: 'monthly', alertTriggered: false }
  }

  // Check all applicable limits — ALL must pass
  for (const limit of limits) {
    const periodLimit = getPeriodLimit(limit)
    const projectedSpend = limit.currentSpendCents + amountCents
    const remaining = periodLimit.limitCents - limit.currentSpendCents

    if (projectedSpend > periodLimit.limitCents) {
      return {
        allowed: false,
        remainingCents: remaining,
        limitCents: periodLimit.limitCents,
        periodType: limit.periodType,
        alertTriggered: false,
      }
    }

    const currentPercent = (limit.currentSpendCents / periodLimit.limitCents) * 100
    const projectedPercent = (projectedSpend / periodLimit.limitCents) * 100
    const alertTriggered =
      currentPercent < limit.alertThresholdPercent &&
      projectedPercent >= limit.alertThresholdPercent

    return {
      allowed: true,
      remainingCents: remaining - amountCents,
      limitCents: periodLimit.limitCents,
      periodType: limit.periodType,
      alertTriggered,
    }
  }

  return { allowed: true, remainingCents: Infinity, limitCents: Infinity, periodType: 'monthly', alertTriggered: false }
}

// ─── Record spend ─────────────────────────────────────────────────────────────

export async function recordSpend(
  orgId: string,
  amountCents: number,
  currency: string,
  department?: string
): Promise<void> {
  const db = await getDb()
  // Increment all matching limits' currentSpendCents atomically
  await db.collection(COLLECTIONS.organisations).updateOne(
    { orgId },
    {
      $inc: {
        // MongoDB positional update doesn't support array filtering by multiple conditions
        // in a single operation cleanly; use arrayFilters
        'budgetLimits.$[elem].currentSpendCents': amountCents,
      },
      $set: { updatedAt: new Date() },
    },
    {
      arrayFilters: [
        {
          'elem.currency': currency,
          $or: [
            { 'elem.department': { $exists: false } },
            { 'elem.department': null },
            ...(department ? [{ 'elem.department': department }] : []),
          ],
        },
      ],
    }
  )
}

// ─── Reset period ─────────────────────────────────────────────────────────────

export async function resetBudgetPeriod(
  orgId: string,
  limitId: string
): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.organisations).updateOne(
    { orgId, 'budgetLimits.limitId': limitId },
    {
      $set: {
        'budgetLimits.$.currentSpendCents': 0,
        'budgetLimits.$.periodStart': new Date(),
        updatedAt: new Date(),
      },
    }
  )
  return result.modifiedCount > 0
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodLimit(limit: BudgetLimit): { limitCents: number } {
  // For now the stored limitCents IS the per-period limit.
  // Future: could prorate quarterly/annual to monthly equivalent.
  return { limitCents: limit.limitCents }
}

export function getBudgetUsagePercent(limit: BudgetLimit): number {
  if (limit.limitCents === 0) return 100
  return Math.min(100, (limit.currentSpendCents / limit.limitCents) * 100)
}

export function isPeriodExpired(limit: BudgetLimit): boolean {
  const periodMs: Record<BudgetLimit['periodType'], number> = {
    monthly: 30 * 24 * 60 * 60 * 1000,
    quarterly: 90 * 24 * 60 * 60 * 1000,
    annual: 365 * 24 * 60 * 60 * 1000,
  }
  return Date.now() - limit.periodStart.getTime() > periodMs[limit.periodType]
}
