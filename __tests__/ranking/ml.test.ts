export {}

import {
  mlScore,
  rerankForUser,
  assertRerankPreservesGateSet,
  NoCollaborative,
  type RerankedCard,
} from '@/lib/ranking/ml'
import { ML_RANKING } from '@/lib/config/constants'
import type { IntentGraph } from '@/lib/intent/types'
import type { ScoredCard } from '@/lib/ranking/types'
import type { ServiceCard } from '@/lib/services/types'

function graph(overrides: Partial<IntentGraph> = {}): IntentGraph {
  return {
    userId: 'u1',
    destinations: [],
    spendingSignal: 'unspecified',
    activityPreferences: {} as IntentGraph['activityPreferences'],
    travelStyle: 'unspecified',
    seasonalPatterns: [],
    outcomeHistory: [],
    updatedAt: new Date(),
    ...overrides,
  }
}

function scored(overrides: Partial<ScoredCard> = {}): ScoredCard {
  const base: ServiceCard = {
    id: overrides.id ?? 'c1',
    serviceType: overrides.serviceType ?? 'flights',
    vendorId: 'v1',
    vendorType: 'duffel',
    displayName: 'Card',
    description: '',
    metadata: {} as ServiceCard['metadata'],
    bookingPayload: {},
    isBookable: true,
    ctaLabel: 'Book',
  }
  return {
    ...base,
    ...overrides,
    scores: { intentFit: 0.7, userFit: 0.5, outcomeHistory: 0.5, bid: 0, final: 0.6, ...(overrides.scores ?? {}) },
    passedGate: overrides.passedGate ?? true,
  }
}

describe('mlScore', () => {
  it('scores a preferred-type card highly', () => {
    const g = graph({ activityPreferences: { flights: 1 } as IntentGraph['activityPreferences'], spendingSignal: 'premium' })
    const s = mlScore(g, scored({ serviceType: 'flights', price: { amount: 40000, currency: 'GBP', displayText: '' } }))
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(1)
  })
})

describe('rerankForUser — north-star invariant', () => {
  it('throws if handed an un-gated card', () => {
    const cards = [scored({ id: 'a' }), scored({ id: 'b', passedGate: false })]
    expect(() => rerankForUser(cards, graph())).toThrow(/INVARIANT VIOLATION/)
  })

  it('never changes the surviving result set — only the order', () => {
    const g = graph({ activityPreferences: { stays: 1 } as IntentGraph['activityPreferences'] })
    const cards = [
      scored({ id: 'flight', serviceType: 'flights' }),
      scored({ id: 'hotel', serviceType: 'stays' }),
    ]
    const out = rerankForUser(cards, g)
    expect(new Set(out.map(c => c.id))).toEqual(new Set(['flight', 'hotel']))
    expect(() => assertRerankPreservesGateSet(cards, g)).not.toThrow()
  })

  it('reorders qualified cards toward personal fit', () => {
    const g = graph({ activityPreferences: { stays: 1, flights: 0 } as IntentGraph['activityPreferences'] })
    // Both start at equal final; personalisation should lift the hotel.
    const cards = [
      scored({ id: 'flight', serviceType: 'flights', scores: { intentFit: 0.7, userFit: 0.5, outcomeHistory: 0.5, bid: 0, final: 0.6 } }),
      scored({ id: 'hotel', serviceType: 'stays', scores: { intentFit: 0.7, userFit: 0.5, outcomeHistory: 0.5, bid: 0, final: 0.6 } }),
    ]
    const out = rerankForUser(cards, g)
    expect(out[0].id).toBe('hotel')
  })

  it('attaches ml + collab signals to scores', () => {
    const out = rerankForUser([scored()], graph())
    const c = out[0] as RerankedCard
    expect(c.scores).toHaveProperty('ml')
    expect(c.scores).toHaveProperty('collab')
  })
})

describe('rerankForUser — weight bounds', () => {
  it('clamps weight to RERANK_WEIGHT ceiling', () => {
    const g = graph({ activityPreferences: { stays: 1 } as IntentGraph['activityPreferences'] })
    const card = scored({ id: 'hotel', serviceType: 'stays', scores: { intentFit: 1, userFit: 1, outcomeHistory: 1, bid: 0, final: 0.5 } })
    const huge = rerankForUser([card], g, { weight: 99 })[0]
    const capped = rerankForUser([card], g, { weight: ML_RANKING.RERANK_WEIGHT })[0]
    expect(huge.scores.final).toBeCloseTo(capped.scores.final)
  })

  it('weight 0 leaves the composite score unchanged (minus collab=0)', () => {
    const card = scored({ scores: { intentFit: 0.7, userFit: 0.5, outcomeHistory: 0.5, bid: 0, final: 0.6 } })
    const out = rerankForUser([card], graph(), { weight: 0, collaborative: NoCollaborative })[0]
    expect(out.scores.final).toBeCloseTo(0.6)
  })
})

describe('rerankForUser — collaborative boost', () => {
  it('applies an injected collaborative affinity, capped', () => {
    const card = scored({ id: 'x', scores: { intentFit: 0, userFit: 0, outcomeHistory: 0, bid: 0, final: 0 } })
    const out = rerankForUser([card], graph(), {
      weight: 0,
      collaborative: { affinity: () => 1 }, // max affinity
    })[0]
    expect(out.scores.collab).toBeCloseTo(ML_RANKING.COLLAB_BOOST_MAX)
  })
})
