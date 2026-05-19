import { scoreCard } from '@/lib/ranking/scorer'
import { rankCards } from '@/lib/ranking/ranker'
import { SCORER } from '@/lib/config/constants'
import { makeCard, makeContext } from './fixtures'

describe('scoreCard', () => {
  it('returns scores between 0 and 1', () => {
    const ctx = { card: makeCard(), stageContext: makeContext() }
    const scored = scoreCard(ctx)
    expect(scored.scores.intentFit).toBeGreaterThanOrEqual(0)
    expect(scored.scores.intentFit).toBeLessThanOrEqual(1)
    expect(scored.scores.userFit).toBeGreaterThanOrEqual(0)
    expect(scored.scores.final).toBeLessThanOrEqual(1)
  })

  it('bid shifts final score but stays within [0,1]', () => {
    const ctx = { card: makeCard(), stageContext: makeContext(), bid: 1.0 }
    const noBidCtx = { card: makeCard(), stageContext: makeContext(), bid: 0 }
    const withBid = scoreCard(ctx)
    const noBid = scoreCard(noBidCtx)
    expect(withBid.scores.final).toBeGreaterThanOrEqual(noBid.scores.final)
    expect(withBid.scores.final).toBeLessThanOrEqual(1)
    // Bid shift is capped at maxBidShift
    expect(withBid.scores.final - noBid.scores.final).toBeLessThanOrEqual(SCORER.MAX_BID_SHIFT + 0.001)
  })

  it('new user (empty outcomeHistory) gets neutral outcome score 0.5', () => {
    const stageContext = makeContext()
    stageContext.mergedGraph.outcomeHistory = []
    const scored = scoreCard({ card: makeCard(), stageContext })
    expect(scored.scores.outcomeHistory).toBe(0.5)
  })

  it('passedGate defaults to false — set by ranker', () => {
    const scored = scoreCard({ card: makeCard(), stageContext: makeContext() })
    expect(scored.passedGate).toBe(false)
  })
})

describe('rankCards', () => {
  it('returns only cards that pass the gate', () => {
    const cards = [
      makeCard({ id: 'flight-1', serviceType: 'flights' }),
      makeCard({ id: 'stay-1', serviceType: 'stays' }),   // not in activityTypes
    ]
    const stageContext = makeContext({ activityTypes: ['flights'] })
    const ranked = rankCards(cards, stageContext)
    expect(ranked.map(c => c.id)).toEqual(['flight-1'])
  })

  it('sorts by final score descending', () => {
    const stageContext = makeContext({ budgetSignal: 'budget' })
    const cheap = makeCard({ id: 'cheap', price: { amount: 5000, currency: 'GBP', displayText: '' } })
    const expensive = makeCard({ id: 'expensive', price: { amount: 80000, currency: 'GBP', displayText: '' } })
    const ranked = rankCards([expensive, cheap], stageContext)
    // cheap card should rank higher for budget signal
    expect(ranked[0].id).toBe('cheap')
  })

  it('all returned cards have passedGate=true', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })]
    const ranked = rankCards(cards, makeContext())
    ranked.forEach(c => expect(c.passedGate).toBe(true))
  })

  it('returns empty array when no cards pass gate', () => {
    const card = makeCard({ serviceType: 'stays' })
    const stageContext = makeContext({ activityTypes: ['flights'] })
    expect(rankCards([card], stageContext)).toHaveLength(0)
  })
})

describe('scorer weights sum', () => {
  it('default weights sum to 1.0 (before bid shift)', () => {
    const sum = SCORER.INTENT_FIT_WEIGHT + SCORER.USER_FIT_WEIGHT + SCORER.OUTCOME_HISTORY_WEIGHT
    expect(sum).toBeCloseTo(1.0, 5)
  })
})
