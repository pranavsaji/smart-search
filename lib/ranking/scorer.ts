import type { RankingContext, ScoredCard, ScorerWeights } from './types'
import { computeIntentFit, computeUserFit } from './gate'
import { SCORER } from '@/lib/config/constants'

const DEFAULT_WEIGHTS: ScorerWeights = {
  intentFit: SCORER.INTENT_FIT_WEIGHT,
  userFit: SCORER.USER_FIT_WEIGHT,
  outcomeHistory: SCORER.OUTCOME_HISTORY_WEIGHT,
  maxBidShift: SCORER.MAX_BID_SHIFT,
}

export function scoreCard(ctx: RankingContext, weights: ScorerWeights = DEFAULT_WEIGHTS): ScoredCard {
  const intentFit = computeIntentFit(ctx)
  const userFit = computeUserFit(ctx)
  const outcomeHistory = computeOutcomeHistory(ctx)
  const bid = ctx.bid ?? 0

  const bidShift = (bid / 1.0) * weights.maxBidShift

  const base =
    intentFit * weights.intentFit +
    userFit * weights.userFit +
    outcomeHistory * weights.outcomeHistory +
    bidShift

  // Style profile boost for product cards (≤10% weight, optional signal)
  let styleBoost = 0
  const mergedGraph = ctx.stageContext.mergedGraph as unknown as Record<string, unknown>
  const styleProfile = mergedGraph?.styleProfile as { budget?: string } | undefined
  if (styleProfile && ctx.card.serviceType === 'products' && ctx.card.price) {
    const styleBudget = styleProfile.budget
    const cardPrice = ctx.card.price.amount / 100 // minor units → major units (pence → pounds)
    if (styleBudget === 'Under £50' && cardPrice < 50) styleBoost = 0.05
    else if (styleBudget === '£50–200' && cardPrice >= 50 && cardPrice <= 200) styleBoost = 0.05
    else if (styleBudget === '£200–500' && cardPrice >= 200 && cardPrice <= 500) styleBoost = 0.05
    else if (styleBudget === '£500+' && cardPrice >= 500) styleBoost = 0.05
  }

  const final = base + styleBoost * 0.1

  return {
    ...ctx.card,
    scores: { intentFit, userFit, outcomeHistory, bid, final: Math.min(1, final) },
    passedGate: false, // set by ranker after gate check
  }
}

function computeOutcomeHistory(ctx: RankingContext): number {
  const { card, stageContext } = ctx
  const { outcomeHistory } = stageContext.mergedGraph

  if (outcomeHistory.length === 0) return 0.5

  const similar = outcomeHistory.filter(
    e =>
      e.activityType === card.serviceType &&
      (card.displayName.toLowerCase().includes(e.destination.toLowerCase()) ||
       e.destination.toLowerCase().includes(card.displayName.toLowerCase().split(' ')[0]))
  )

  if (similar.length === 0) return 0.4

  const now = Date.now()
  const decayedScore = similar.reduce((sum, e) => {
    const ageDays = (now - new Date(e.completedAt).getTime()) / (1000 * 60 * 60 * 24)
    const recency = Math.exp(-ageDays / SCORER.OUTCOME_DECAY_HALF_LIFE_DAYS)
    return sum + e.weight * recency
  }, 0)

  return Math.min(1, decayedScore / 2)
}
