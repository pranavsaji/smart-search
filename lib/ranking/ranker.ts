import type { ServiceCard } from '@/lib/services/types'
import type { MergedStageContext } from '@/lib/intent/types'
import type { ScoredCard } from './types'
import { passesGate } from './gate'
import { scoreCard } from './scorer'

export interface RankedResult {
  serviceType: string
  cards: ScoredCard[]
}

export function rankCards(
  cards: ServiceCard[],
  stageContext: MergedStageContext,
  bids: Record<string, number> = {}
): ScoredCard[] {
  return cards
    .map(card => {
      const ctx = { card, stageContext, bid: bids[card.id] ?? 0 }
      const gatePass = passesGate(ctx)
      if (!gatePass) return { ...scoreCard(ctx), passedGate: false }
      return { ...scoreCard(ctx), passedGate: true }
    })
    .filter(c => c.passedGate)
    .sort((a, b) => b.scores.final - a.scores.final)
}

// Unit-testable gate invariant helpers
export function assertBidCannotCreateRelevance(
  card: ServiceCard,
  stageContext: MergedStageContext
): void {
  const withMaxBid = passesGate({ card, stageContext, bid: 1.0 })
  const withNoBid = passesGate({ card, stageContext, bid: 0 })
  if (withMaxBid !== withNoBid) {
    throw new Error(`INVARIANT VIOLATION: bid changed gate result for card ${card.id}`)
  }
}
