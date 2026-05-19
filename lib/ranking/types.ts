import type { ServiceCard } from '@/lib/services/types'
import type { MergedStageContext } from '@/lib/intent/types'

export interface RankingContext {
  stageContext: MergedStageContext
  card: ServiceCard
  bid?: number                  // 0-1, commercial signal
}

export interface ScoredCard extends ServiceCard {
  scores: {
    intentFit: number           // 0-1: semantic match to prompt
    userFit: number             // 0-1: match to user's intent graph
    outcomeHistory: number      // 0-1: similar past bookings
    bid: number                 // 0-1: commercial signal
    final: number               // weighted composite
  }
  passedGate: boolean
}

export interface GateConfig {
  intentFitThreshold: number    // default 0.6
  userFitThreshold: number      // default 0.3
}

export interface ScorerWeights {
  intentFit: number             // default 0.45
  userFit: number               // default 0.35
  outcomeHistory: number        // default 0.20
  maxBidShift: number           // default 0.10 — bid can move ±10% max
}
