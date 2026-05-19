import { passesGate, computeIntentFit } from '@/lib/ranking/gate'
import { assertBidCannotCreateRelevance } from '@/lib/ranking/ranker'
import { GATE, PRICE } from '@/lib/config/constants'
import { makeCard, makeContext } from './fixtures'

describe('passesGate', () => {
  it('passes when type matches and default budget', () => {
    const ctx = { card: makeCard(), stageContext: makeContext() }
    expect(passesGate(ctx)).toBe(true)
  })

  it('fails when card serviceType not in activityTypes', () => {
    const card = makeCard({ serviceType: 'stays' })
    const ctx = { card, stageContext: makeContext({ activityTypes: ['flights'] }) }
    expect(passesGate(ctx)).toBe(false)
  })

  it('passes non-bookable cards (weather/maps) without price check', () => {
    const card = makeCard({ serviceType: 'weather', isBookable: false, price: undefined })
    const ctx = { card, stageContext: makeContext({ activityTypes: ['weather'] }) }
    expect(passesGate(ctx)).toBe(true)
  })

  it('new user with empty outcomeHistory gets neutral userFit — gate relies on intentFit alone', () => {
    const card = makeCard()
    const stageContext = makeContext()
    stageContext.mergedGraph.outcomeHistory = []
    expect(passesGate({ card, stageContext })).toBe(true)
  })
})

describe('computeIntentFit — budget signal', () => {
  it('budget card scores high intentFit when signal is budget', () => {
    const card = makeCard({ price: { amount: PRICE.BUDGET_MAX - 1, currency: 'GBP', displayText: '' } })
    const ctx = { card, stageContext: makeContext({ budgetSignal: 'budget' }) }
    expect(computeIntentFit(ctx)).toBeGreaterThan(0.7)
  })

  it('expensive card scores low intentFit when signal is budget', () => {
    const card = makeCard({ price: { amount: PRICE.BUDGET_GATE_MAX + 1, currency: 'GBP', displayText: '' } })
    const ctx = { card, stageContext: makeContext({ budgetSignal: 'budget' }) }
    expect(computeIntentFit(ctx)).toBeLessThan(0.4)
  })

  it('premium card scores high intentFit when signal is premium', () => {
    const card = makeCard({ price: { amount: PRICE.PREMIUM_MIN + 1, currency: 'GBP', displayText: '' } })
    const ctx = { card, stageContext: makeContext({ budgetSignal: 'premium' }) }
    expect(computeIntentFit(ctx)).toBeGreaterThan(0.7)
  })

  it('cheap card scores low intentFit when signal is premium', () => {
    const card = makeCard({ price: { amount: PRICE.PREMIUM_GATE_MIN - 1, currency: 'GBP', displayText: '' } })
    const ctx = { card, stageContext: makeContext({ budgetSignal: 'premium' }) }
    expect(computeIntentFit(ctx)).toBeLessThan(0.4)
  })
})

describe('NORTH STAR INVARIANT — bid cannot create relevance', () => {
  it('bid does not change gate result for a relevant card', () => {
    const card = makeCard()
    const stageContext = makeContext()
    expect(() => assertBidCannotCreateRelevance(card, stageContext)).not.toThrow()
  })

  it('bid does not change gate result for an irrelevant card', () => {
    const card = makeCard({ serviceType: 'stays' })
    const stageContext = makeContext({ activityTypes: ['flights'] })
    expect(() => assertBidCannotCreateRelevance(card, stageContext)).not.toThrow()
  })

  it('gate result with max bid equals gate result with zero bid', () => {
    const card = makeCard()
    const stageContext = makeContext()
    const withMaxBid = passesGate({ card, stageContext, bid: 1.0 })
    const withNoBid = passesGate({ card, stageContext, bid: 0 })
    expect(withMaxBid).toBe(withNoBid)
  })

  it('location-agnostic types (products, digital_services) pass without destination', () => {
    const card = makeCard({ serviceType: 'products', displayName: 'Sony Headphones', description: 'Electronics' })
    const ctx = { card, stageContext: makeContext({ activityTypes: ['products'], destination: 'UNKNOWN' }) }
    expect(passesGate(ctx)).toBe(true)
  })
})

describe('gate config overrides', () => {
  it('accepts custom intentFit threshold', () => {
    const card = makeCard()
    const ctx = { card, stageContext: makeContext() }
    // With very high threshold, card should fail
    expect(passesGate(ctx, { intentFitThreshold: 0.99, userFitThreshold: 0 })).toBe(false)
    // With zero threshold, card should pass
    expect(passesGate(ctx, { intentFitThreshold: 0, userFitThreshold: 0 })).toBe(true)
  })
})
