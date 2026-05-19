import type { RankingContext, GateConfig } from './types'
import { GATE, PRICE, INTENT_FIT, LOCATION_AGNOSTIC_TYPES } from '@/lib/config/constants'

// THE critical invariant: payment cannot create relevance.
// Bid is not a parameter here — it is evaluated only in ranker.ts, post-gate.
// If intentFit=0, no bid can make this card appear. Architecture-level guarantee.

const DEFAULT_CONFIG: GateConfig = {
  intentFitThreshold: GATE.INTENT_FIT_THRESHOLD,
  userFitThreshold: GATE.USER_FIT_THRESHOLD,
}

export function passesGate(ctx: RankingContext, config: GateConfig = DEFAULT_CONFIG): boolean {
  const intentFit = computeIntentFit(ctx)
  const userFit = computeUserFit(ctx)

  // New users with no intent graph get neutral userFit (0.5) — gate passes on intentFit alone
  const effectiveUserFit = ctx.stageContext.mergedGraph.outcomeHistory.length === 0 ? 0.5 : userFit

  return intentFit >= config.intentFitThreshold && effectiveUserFit >= config.userFitThreshold
}

export function computeIntentFit(ctx: RankingContext): number {
  const { card, stageContext } = ctx
  const { sharedIntent } = stageContext

  const typeMatch = sharedIntent.activityTypes.includes(card.serviceType) ? 1.0 : 0.0
  if (typeMatch === 0) return 0

  if (!card.isBookable) return INTENT_FIT.NON_BOOKABLE_BASE

  let priceFit: number = INTENT_FIT.NEUTRAL_PRICE
  if (card.price) {
    const { amount } = card.price
    if (sharedIntent.budgetSignal === 'budget') {
      priceFit = amount < PRICE.BUDGET_MAX ? 1.0 : amount >= PRICE.BUDGET_GATE_MAX ? 0.1 : 0.5
    } else if (sharedIntent.budgetSignal === 'premium') {
      priceFit = amount >= PRICE.PREMIUM_MIN ? 1.0 : amount < PRICE.PREMIUM_GATE_MIN ? 0.2 : 0.5
    } else if (sharedIntent.budgetSignal === 'mid-range') {
      priceFit = amount >= PRICE.MID_RANGE_MIN && amount <= PRICE.MID_RANGE_MAX ? 0.9 : 0.5
    }
  }

  const unknownDest = sharedIntent.destination === 'UNKNOWN'
  if (unknownDest || LOCATION_AGNOSTIC_TYPES.has(card.serviceType)) {
    return priceFit * 0.6 + typeMatch * 0.4
  }

  const destLower = sharedIntent.destination.toLowerCase()
  // City aliases — common alternate spellings or known equivalents
  const CITY_ALIASES: Record<string, string[]> = {
    bangalore: ['bengaluru', 'blr'],
    bengaluru: ['bangalore', 'blr'],
    mumbai: ['bombay', 'bom'],
    delhi: ['new delhi', 'del'],
    kolkata: ['calcutta', 'ccu'],
    dubai: ['dxb'],
    london: ['lhr', 'lgw'],
    'new york': ['nyc', 'jfk', 'new york city'],
    tokyo: ['nrt', 'hnd'],
    paris: ['cdg'],
    rome: ['fco'],
    amsterdam: ['ams'],
  }
  const destAliases = new Set([destLower, ...(CITY_ALIASES[destLower] ?? [])])
  // Word-boundary match: tokenise on whitespace/punctuation so "Paris" doesn't
  // match "Paris Hilton" (a product card) via substring containment.
  const matchesField = (text: string): boolean => {
    const words = text.toLowerCase().split(/[\s,.\-/·→]+/)
    return words.some(w => destAliases.has(w))
  }
  const destMatch = matchesField(card.displayName) || matchesField(card.description)

  // When budget signal is explicit, price fit dominates — destination match cannot rescue a
  // card that is outside the user's stated budget/premium tier.
  if (sharedIntent.budgetSignal !== 'unspecified') {
    return priceFit * 0.8 + (destMatch ? 0.15 : 0) + typeMatch * 0.05
  }

  return (destMatch ? 0.4 : INTENT_FIT.NO_DESTINATION) + priceFit * 0.4 + typeMatch * 0.2
}

export function computeUserFit(ctx: RankingContext): number {
  const { card, stageContext } = ctx
  const { mergedGraph } = stageContext

  const activityPref = mergedGraph.activityPreferences[card.serviceType] ?? 0.5

  const destAffinity = mergedGraph.destinations.find(d => {
    const dv = d.value.toLowerCase()
    const tokenMatch = (text: string) =>
      text.toLowerCase().split(/[\s,.\-/]+/).some(w => w === dv || dv === w)
    return tokenMatch(card.displayName) || tokenMatch(card.description)
  })?.weight ?? 0.3

  let spendFit = 0.7
  if (card.price && mergedGraph.spendingSignal !== 'unspecified') {
    const { amount } = card.price
    spendFit =
      mergedGraph.spendingSignal === 'budget'      && amount < PRICE.BUDGET_MAX    ? 0.9
      : mergedGraph.spendingSignal === 'premium'   && amount >= PRICE.PREMIUM_MIN  ? 0.9
      : mergedGraph.spendingSignal === 'mid-range' && amount >= PRICE.MID_RANGE_MIN && amount <= PRICE.MID_RANGE_MAX ? 0.9
      : 0.5
  }

  return activityPref * 0.4 + destAffinity * 0.3 + spendFit * 0.3
}
