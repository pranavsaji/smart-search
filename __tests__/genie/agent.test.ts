// Prevent real network calls in unit tests
jest.mock('@/lib/mail', () => ({ sendGenieConfirmation: jest.fn() }))
jest.mock('@/lib/sse/broadcast', () => ({ broadcastToStage: jest.fn() }))
jest.mock('@anthropic-ai/sdk', () => {
  const MockClient = jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } }))
  return { __esModule: true, default: MockClient }
})

import { buildCartItem, buildCheckAvailability, buildConfirmBooking } from '@/lib/genie/agent'
import type { ScoredCard } from '@/lib/ranking/types'
import type { IntentGraph, ActivityType } from '@/lib/intent/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeScoredCard(overrides: Partial<ScoredCard> = {}): ScoredCard {
  return {
    id: 'card-1',
    serviceType: 'appointments',
    vendorId: 'vendor-1',
    vendorType: 'calendly',
    displayName: 'Executive Coach — 60 min',
    description: '60-min coaching session via Calendly',
    price: { amount: 15000, currency: 'USD', displayText: '$150' },
    metadata: {
      type: 'coaching',
      platform: 'Calendly',
      duration: 60,
      availability: ['Today 9am', 'Today 2pm', 'Tomorrow 10am'],
    },
    bookingPayload: { eventTypeUri: 'https://api.calendly.com/event_types/abc123', platform: 'calendly' },
    isBookable: true,
    ctaLabel: 'Book Now',
    supportsGenie: true,
    scores: { intentFit: 0.9, userFit: 0.8, outcomeHistory: 0.5, bid: 0, final: 0.82 },
    passedGate: true,
    ...overrides,
  }
}

function makeIntentGraph(overrides: Partial<IntentGraph> = {}): IntentGraph {
  return {
    userId: 'user-1',
    destinations: [],
    spendingSignal: 'mid-range',
    activityPreferences: {} as Record<ActivityType, number>,
    travelStyle: 'solo',
    seasonalPatterns: [],
    outcomeHistory: [],
    updatedAt: new Date(),
    ...overrides,
  }
}

// ── buildCartItem ─────────────────────────────────────────────────────────────

describe('buildCartItem', () => {
  it('constructs a CartItem from a ScoredCard', () => {
    const card = makeScoredCard()
    const item = buildCartItem(card, 'user-1', 'Today 9am')

    expect(item.cardId).toBe('card-1')
    expect(item.vendorId).toBe('vendor-1')
    expect(item.activityType).toBe('appointments')
    expect(item.amount).toBe(15000)
    expect(item.currency).toBe('USD')
    expect(item.lockedBy).toBe('user-1')
    expect(item.isBookable).toBe(true)
  })

  it('merges userId and selectedSlot into bookingPayload', () => {
    const card = makeScoredCard()
    const item = buildCartItem(card, 'user-42', 'Tomorrow 10am')
    const payload = item.bookingPayload as Record<string, unknown>

    expect(payload.userId).toBe('user-42')
    expect(payload.selectedSlot).toBe('Tomorrow 10am')
    // original payload keys preserved
    expect(payload.eventTypeUri).toBe('https://api.calendly.com/event_types/abc123')
    expect(payload.platform).toBe('calendly')
  })

  it('defaults amount to 0 when card has no price', () => {
    const card = makeScoredCard({ price: undefined })
    const item = buildCartItem(card, 'user-1', 'flexible')

    expect(item.amount).toBe(0)
    expect(item.currency).toBe('USD')
  })

  it('sets offerExpiresAt ~15 minutes from now', () => {
    const before = Date.now()
    const item = buildCartItem(makeScoredCard(), 'user-1', 'Today 9am')
    const after = Date.now()
    const expiresMs = item.offerExpiresAt.getTime()

    expect(expiresMs).toBeGreaterThanOrEqual(before + 14 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 100)
  })
})

// ── buildCheckAvailability ────────────────────────────────────────────────────

describe('buildCheckAvailability', () => {
  it('returns first available slot when preference matches', () => {
    const card = makeScoredCard()
    const check = buildCheckAvailability(card)
    const result = check({ platform: 'Calendly', providerId: 'v1', preferredSlots: ['Today 9am', 'Today 2pm'] })

    expect(result.available).toBe(true)
    expect(result.confirmedSlot).toBe('Today 9am')
    expect(result.allSlots).toEqual(['Today 9am', 'Today 2pm', 'Tomorrow 10am'])
  })

  it('falls back to first available slot when preferred slot not in list', () => {
    const card = makeScoredCard()
    const check = buildCheckAvailability(card)
    const result = check({ platform: 'Calendly', providerId: 'v1', preferredSlots: ['Friday 3pm'] })

    expect(result.available).toBe(true)
    expect(result.confirmedSlot).toBe('Today 9am') // first in availability list
  })

  it('returns flexible slot when card has no availability list', () => {
    const card = makeScoredCard({
      metadata: { type: 'coaching', platform: 'Calendly', duration: 60, availability: [] },
    })
    const check = buildCheckAvailability(card)
    const result = check({ platform: 'Calendly', providerId: 'v1', preferredSlots: ['Monday 10am'] })

    expect(result.available).toBe(true)
    expect(result.confirmedSlot).toBe('Monday 10am')
    expect(result.allSlots).toEqual([])
  })

  it('does fuzzy slot matching (partial string match)', () => {
    const card = makeScoredCard()
    const check = buildCheckAvailability(card)
    // 'Today' matches 'Today 2pm'
    const result = check({ platform: 'Calendly', providerId: 'v1', preferredSlots: ['Today'] })

    expect(result.available).toBe(true)
    expect(result.confirmedSlot).toMatch(/Today/)
  })
})

// ── buildConfirmBooking ───────────────────────────────────────────────────────

describe('buildConfirmBooking', () => {
  it('returns failure when adapter is not genieCapable', async () => {
    // Mock serviceRegistry to return non-capable adapter
    jest.resetModules()
    jest.mock('@/lib/services/registry', () => ({
      serviceRegistry: {
        getEnabledByType: () => ({ genieCapable: false }),
      },
    }))

    const { buildConfirmBooking: build } = await import('@/lib/genie/agent')
    const card = makeScoredCard({ serviceType: 'products' })
    const confirmBooking = await build(card, 'user-1')
    const result = await confirmBooking({
      platform: 'Amazon', providerId: 'asin-1', selectedSlot: 'N/A',
      userId: 'user-1', serviceDetails: 'Buy headphones',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/genieCapable/)
    jest.resetModules()
  })

  it('returns failure when adapter is absent', async () => {
    jest.resetModules()
    jest.mock('@/lib/services/registry', () => ({
      serviceRegistry: { getEnabledByType: () => undefined },
    }))

    const { buildConfirmBooking: build } = await import('@/lib/genie/agent')
    const card = makeScoredCard({ serviceType: 'products' })
    const confirmBooking = await build(card, 'user-1')
    const result = await confirmBooking({
      platform: 'Amazon', providerId: 'asin-1', selectedSlot: 'N/A',
      userId: 'user-1', serviceDetails: 'Buy headphones',
    })

    expect(result.success).toBe(false)
    jest.resetModules()
  })
})

// ── HomeServicesAdapter.createOrder ──────────────────────────────────────────

describe('HomeServicesAdapter.createOrder', () => {
  it('returns confirmed with deepLinkUrl when schedulingUrl is present', async () => {
    const { HomeServicesAdapter } = await import('@/lib/services/home-services/adapter')
    const adapter = new HomeServicesAdapter()
    const item = buildCartItem(
      makeScoredCard({
        serviceType: 'home_services',
        vendorType: 'home_service',
        bookingPayload: { providerId: 'prov-1', schedulingUrl: 'https://calendly.com/plumber/callout' },
      }),
      'user-1',
      'Today 2pm'
    )

    const result = await adapter.createOrder(item)

    expect(result.status).toBe('confirmed')
    expect(result.deepLinkUrl).toBe('https://calendly.com/plumber/callout')
    expect(result.vendorOrderId).toBe('prov-1')
  })

  it('returns failed when no schedulingUrl', async () => {
    const { HomeServicesAdapter } = await import('@/lib/services/home-services/adapter')
    const adapter = new HomeServicesAdapter()
    const item = buildCartItem(
      makeScoredCard({
        serviceType: 'home_services',
        vendorType: 'home_service',
        bookingPayload: { providerId: 'prov-1' }, // no schedulingUrl
      }),
      'user-1',
      'Today 2pm'
    )

    const result = await adapter.createOrder(item)

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/scheduling URL/)
  })
})

// ── HealthServicesAdapter.createOrder ────────────────────────────────────────

describe('HealthServicesAdapter.createOrder', () => {
  it('returns confirmed with deepLinkUrl when schedulingUrl is present', async () => {
    const { HealthServicesAdapter } = await import('@/lib/services/health/adapter')
    const adapter = new HealthServicesAdapter()
    const item = buildCartItem(
      makeScoredCard({
        serviceType: 'health_services',
        vendorType: 'health_provider',
        bookingPayload: { providerId: 'prov-gp', schedulingUrl: 'https://calendly.com/dr-chen/gp' },
      }),
      'user-1',
      'Tomorrow 11am'
    )

    const result = await adapter.createOrder(item)

    expect(result.status).toBe('confirmed')
    expect(result.deepLinkUrl).toBe('https://calendly.com/dr-chen/gp')
  })

  it('returns failed when no schedulingUrl', async () => {
    const { HealthServicesAdapter } = await import('@/lib/services/health/adapter')
    const adapter = new HealthServicesAdapter()
    const item = buildCartItem(
      makeScoredCard({
        serviceType: 'health_services',
        vendorType: 'health_provider',
        bookingPayload: { providerId: 'prov-gp' },
      }),
      'user-1',
      'Tomorrow 11am'
    )

    const result = await adapter.createOrder(item)

    expect(result.status).toBe('failed')
  })
})

// ── genieCapable flags ────────────────────────────────────────────────────────

describe('genieCapable flags', () => {
  it('HomeServicesAdapter is genieCapable', async () => {
    const { HomeServicesAdapter } = await import('@/lib/services/home-services/adapter')
    expect(new HomeServicesAdapter().genieCapable).toBe(true)
  })

  it('HealthServicesAdapter is genieCapable', async () => {
    const { HealthServicesAdapter } = await import('@/lib/services/health/adapter')
    expect(new HealthServicesAdapter().genieCapable).toBe(true)
  })

  it('ShoppingAdapter is NOT genieCapable', async () => {
    const { ShoppingAdapter } = await import('@/lib/services/shopping/adapter')
    expect(new ShoppingAdapter().genieCapable).toBe(false)
  })

  it('DigitalServicesAdapter is NOT genieCapable', async () => {
    const { DigitalServicesAdapter } = await import('@/lib/services/digital-services/adapter')
    expect(new DigitalServicesAdapter().genieCapable).toBe(false)
  })
})
