// Phase 12.2 — Personalisation Engine V2 (ML re-ranking).
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ NORTH-STAR INVARIANT                                                       │
// │ This reranker operates ONLY on cards that have already passed gate.ts.     │
// │ It reorders qualified results by personal fit; it can never resurrect a    │
// │ gated-out card, and it takes no bid/payment input. Relevance is decided    │
// │ by the gate; personalisation only re-sorts what already qualified — bounded│
// │ by RERANK_WEIGHT, exactly as the scorer bounds commerce by MAX_BID_SHIFT.  │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Two signals, both derived from the user's OWN graph (never from payment):
//   • ml:     cosine similarity between the user feature vector and the card.
//   • collab: "users like you also booked X" — an injected collaborative boost,
//             capped at COLLAB_BOOST_MAX. Defaults to none (mock-first).

import type { ScoredCard } from './types'
import type { IntentGraph } from '@/lib/intent/types'
import type { ServiceCard } from '@/lib/services/types'
import { ML_RANKING } from '@/lib/config/constants'
import { userFeatureVector, cardFeatureVector, cosineSimilarity } from './features'

/** A card after personalised re-ranking — carries the extra signals for debug. */
export interface RerankedCard extends ScoredCard {
  scores: ScoredCard['scores'] & { ml: number; collab: number }
}

/**
 * Collaborative signal: "users like you also engaged with this kind of item".
 * Injected so it can be backed by the knowledge graph in prod and a fake in
 * tests. Returns a 0–1 affinity for a card; the reranker scales it by
 * COLLAB_BOOST_MAX. Default provider returns 0 (no boost) — mock-first.
 */
export interface CollaborativeProvider {
  affinity(card: ServiceCard): number
}

export const NoCollaborative: CollaborativeProvider = { affinity: () => 0 }

export interface RerankOptions {
  /** Personal-fit blend, 0–RERANK_WEIGHT. Comes from the A/B variant; default RERANK_WEIGHT. */
  weight?: number
  collaborative?: CollaborativeProvider
}

/**
 * Compute the personal-fit (ML) score for a single card against a user graph.
 * Pure — exported for analytics/debugging and unit tests.
 */
export function mlScore(graph: IntentGraph, card: ServiceCard): number {
  return cosineSimilarity(userFeatureVector(graph), cardFeatureVector(card))
}

/**
 * Re-rank already-gated cards by personal fit. Throws if handed a card that did
 * not pass the gate — that would violate the north-star invariant.
 */
export function rerankForUser(
  cards: ScoredCard[],
  graph: IntentGraph,
  opts: RerankOptions = {},
): RerankedCard[] {
  // Defensive guard: the reranker NEVER sees pre-gate cards.
  const leaked = cards.find(c => !c.passedGate)
  if (leaked) {
    throw new Error(`INVARIANT VIOLATION: rerankForUser received un-gated card ${leaked.id}`)
  }

  const weight = clamp(opts.weight ?? ML_RANKING.RERANK_WEIGHT, 0, ML_RANKING.RERANK_WEIGHT)
  const collab = opts.collaborative ?? NoCollaborative

  const reranked = cards.map<RerankedCard>(card => {
    const ml = mlScore(graph, card)
    const collabBoost = clamp(collab.affinity(card), 0, 1) * ML_RANKING.COLLAB_BOOST_MAX
    // Blend personal fit into the existing composite, then add the capped collab boost.
    const blended = (1 - weight) * card.scores.final + weight * ml + collabBoost
    return {
      ...card,
      scores: { ...card.scores, ml: round(ml), collab: round(collabBoost), final: round(Math.min(1, blended)) },
    }
  })

  return reranked.sort((a, b) => b.scores.final - a.scores.final)
}

/**
 * Invariant probe for tests/CI: personalisation must not change WHICH cards
 * survive — only their order. Returns the set of surviving ids before/after.
 */
export function assertRerankPreservesGateSet(
  cards: ScoredCard[],
  graph: IntentGraph,
  opts: RerankOptions = {},
): void {
  const before = new Set(cards.map(c => c.id))
  const after = new Set(rerankForUser(cards, graph, opts).map(c => c.id))
  if (before.size !== after.size || [...before].some(id => !after.has(id))) {
    throw new Error('INVARIANT VIOLATION: reranking changed the gated result set')
  }
}

function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo
  return Math.max(lo, Math.min(hi, x))
}
function round(x: number): number {
  return Number(x.toFixed(4))
}
