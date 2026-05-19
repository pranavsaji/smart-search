export {}

import {
  cosineSimilarity,
  dot,
  magnitude,
  userFeatureVector,
  cardFeatureVector,
  ACTIVITY_AXES,
  FEATURE_DIMS,
} from '@/lib/ranking/features'
import type { IntentGraph } from '@/lib/intent/types'
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

function card(overrides: Partial<ServiceCard> = {}): ServiceCard {
  return {
    id: 'c1',
    serviceType: 'flights',
    vendorId: 'v1',
    vendorType: 'duffel',
    displayName: 'Flight',
    description: '',
    metadata: {} as ServiceCard['metadata'],
    bookingPayload: {},
    isBookable: true,
    ctaLabel: 'Book',
    ...overrides,
  }
}

describe('vector math', () => {
  it('dot and magnitude', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32)
    expect(magnitude([3, 4])).toBe(5)
  })

  it('cosine of identical direction is 1', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
  })

  it('cosine of orthogonal vectors is 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it('cosine with a zero vector is 0 (no signal)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it('throws on dimension mismatch', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow(/dimension/)
  })

  it('result is always within [0,1] for non-negative vectors', () => {
    const c = cosineSimilarity([0.2, 0.8, 0.1], [1, 0, 0])
    expect(c).toBeGreaterThanOrEqual(0)
    expect(c).toBeLessThanOrEqual(1)
  })
})

describe('feature vectors', () => {
  it('have the documented dimensionality', () => {
    expect(FEATURE_DIMS).toBe(ACTIVITY_AXES.length + 3)
    expect(userFeatureVector(graph())).toHaveLength(FEATURE_DIMS)
    expect(cardFeatureVector(card())).toHaveLength(FEATURE_DIMS)
  })

  it('user vector encodes activity preferences', () => {
    const g = graph({ activityPreferences: { flights: 0.9 } as IntentGraph['activityPreferences'] })
    const v = userFeatureVector(g)
    expect(v[ACTIVITY_AXES.indexOf('flights')]).toBe(0.9)
  })

  it('card vector one-hots the service type', () => {
    const v = cardFeatureVector(card({ serviceType: 'stays' }))
    expect(v[ACTIVITY_AXES.indexOf('stays')]).toBe(1)
    expect(v[ACTIVITY_AXES.indexOf('flights')]).toBe(0)
  })

  it('a flight-loving user matches a flight card more than a hotel card', () => {
    const g = graph({
      activityPreferences: { flights: 1, stays: 0 } as IntentGraph['activityPreferences'],
      spendingSignal: 'premium',
    })
    const flightCard = card({ serviceType: 'flights', price: { amount: 50000, currency: 'GBP', displayText: '£500' } })
    const hotelCard = card({ serviceType: 'stays', price: { amount: 50000, currency: 'GBP', displayText: '£500' } })
    const uv = userFeatureVector(g)
    expect(cosineSimilarity(uv, cardFeatureVector(flightCard)))
      .toBeGreaterThan(cosineSimilarity(uv, cardFeatureVector(hotelCard)))
  })

  it('clamps out-of-range preference values', () => {
    const g = graph({ activityPreferences: { flights: 5, stays: -2 } as IntentGraph['activityPreferences'] })
    const v = userFeatureVector(g)
    expect(v[ACTIVITY_AXES.indexOf('flights')]).toBe(1)
    expect(v[ACTIVITY_AXES.indexOf('stays')]).toBe(0)
  })
})
