import type { ServiceCard } from '@/lib/services/types'
import type { ActivityType, MergedStageContext } from '@/lib/intent/types'

export function makeCard(overrides: Partial<ServiceCard> = {}): ServiceCard {
  return {
    id: 'test-card',
    serviceType: 'flights',
    vendorId: 'v1',
    vendorType: 'duffel_flight',
    displayName: 'LHR → CDG',
    description: 'Air France · Paris',
    price: { amount: 25000, currency: 'GBP', displayText: '£250' },
    metadata: { departing_at: '2025-06-01T10:00:00Z', arriving_at: '2025-06-01T12:15:00Z', carrier: 'AF' },
    bookingPayload: { offerId: 'offer-1' },
    isBookable: true,
    ctaLabel: 'Book Flight',
    ...overrides,
  }
}

export function makeContext(overrides: Partial<MergedStageContext['sharedIntent']> = {}): MergedStageContext {
  return {
    sharedIntent: {
      rawPrompt: 'flights to Paris',
      destination: 'Paris',
      origin: 'London',
      dates: { start: '2025-06-01', end: '2025-06-07' },
      groupSize: 2,
      confidence: 0.9,
      budgetSignal: 'unspecified',
      activityTypes: ['flights'],
      genieServices: [],
      participants: [],
      ...overrides,
    },
    mergedGraph: {
      userId: 'test-user',
      destinations: [],
      activityPreferences: {} as Record<ActivityType, number>,
      spendingSignal: 'unspecified',
      travelStyle: 'unspecified',
      seasonalPatterns: [],
      outcomeHistory: [],
      updatedAt: new Date('2025-01-01'),
    },
    stageId: 'test-stage',
    participants: [],
  }
}
