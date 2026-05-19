import { parsePhaseBResponse } from '@/lib/intent/phaseB'
import type { PhaseAResult } from '@/lib/intent/types'
import { format, addDays } from 'date-fns'

function makePhaseA(overrides: Partial<PhaseAResult> = {}): PhaseAResult {
  return {
    summary: 'Test request',
    services: ['flights', 'stays'],
    extracted: {
      destination: 'Tokyo',
      originCity: 'London',
      departureDate: '2025-06-01',
      destination_stage: null,
      brand: null,
      collaborator: null,
    },
    ...overrides,
  }
}

describe('parsePhaseBResponse', () => {
  const defaultStart = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const defaultEnd = format(addDays(new Date(), 10), 'yyyy-MM-dd')

  describe('valid JSON parsing', () => {
    it('maps all fields from JSON correctly', () => {
      const raw = JSON.stringify({
        destination: 'Tokyo',
        origin: 'London',
        dates: { start: '2025-06-01', end: '2025-06-07' },
        groupSize: 2,
        budgetSignal: 'premium',
        constraints: ['vegetarian'],
        activityTypes: ['flights', 'stays'],
        genieServices: [],
        confidence: 0.95,
        summary: 'Tokyo flight + hotel',
        companions: ['@alex'],
        clarificationNeeded: false,
        clarificationMessage: null,
        services: [{ id: 'flights', isRequested: true, params: {}, missingParams: [] }],
      })
      const phaseA = makePhaseA()
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      expect(result.destination).toBe('Tokyo')
      expect(result.origin).toBe('London')
      expect(result.dates.start).toBe('2025-06-01')
      expect(result.dates.end).toBe('2025-06-07')
      expect(result.groupSize).toBe(2)
      expect(result.budgetSignal).toBe('premium')
      expect(result.constraints).toEqual(['vegetarian'])
      expect(result.confidence).toBe(0.95)
      expect(result.summary).toBe('Tokyo flight + hotel')
      expect(result.clarificationNeeded).toBe(false)
    })

    it('uses default dates when dates are missing from response', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        activityTypes: ['stays'],
      })
      const phaseA = makePhaseA({ services: ['stays'] })
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      expect(result.dates.start).toBe(defaultStart)
      expect(result.dates.end).toBe(defaultEnd)
    })

    it('uses default start date when only end is provided', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        dates: { end: '2025-07-01' },
        activityTypes: ['stays'],
      })
      const phaseA = makePhaseA()
      const result = parsePhaseBResponse(raw, phaseA, 'alice')
      expect(result.dates.start).toBe(defaultStart)
      expect(result.dates.end).toBe('2025-07-01')
    })
  })

  describe('travel intent -- weather and maps injection', () => {
    it('injects weather and maps for travel with named destination', () => {
      const raw = JSON.stringify({
        destination: 'Tokyo',
        activityTypes: ['flights', 'stays'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const phaseA = makePhaseA({ services: ['flights', 'stays'] })
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      expect(result.activityTypes).toContain('weather')
      expect(result.activityTypes).toContain('maps')
    })

    it('does not duplicate weather/maps if already present', () => {
      const raw = JSON.stringify({
        destination: 'Tokyo',
        activityTypes: ['flights', 'stays', 'weather', 'maps'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const phaseA = makePhaseA()
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      const weatherCount = result.activityTypes.filter(t => t === 'weather').length
      const mapsCount = result.activityTypes.filter(t => t === 'maps').length
      expect(weatherCount).toBe(1)
      expect(mapsCount).toBe(1)
    })

    it('does NOT inject weather/maps for non-travel intent (products)', () => {
      const raw = JSON.stringify({
        destination: 'UNKNOWN',
        activityTypes: ['products'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const phaseA = makePhaseA({ services: ['products'], extracted: { destination: null } })
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      expect(result.activityTypes).not.toContain('weather')
      expect(result.activityTypes).not.toContain('maps')
    })

    it('does NOT inject weather/maps when destination is UNKNOWN', () => {
      const raw = JSON.stringify({
        destination: 'UNKNOWN',
        activityTypes: ['flights'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const phaseA = makePhaseA({ extracted: { destination: null } })
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      expect(result.activityTypes).not.toContain('weather')
      expect(result.activityTypes).not.toContain('maps')
    })
  })

  describe('participants and companions', () => {
    it('always includes initiator as first participant', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        activityTypes: ['flights'],
        companions: [],
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.participants[0].handle).toBe('alice')
    })

    it('companions become additional participants', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        activityTypes: ['flights'],
        companions: ['alex', 'sarah'],
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.participants).toHaveLength(3)
      expect(result.participants[1].handle).toBe('alex')
      expect(result.participants[2].handle).toBe('sarah')
    })

    it('companions are preserved in companions field', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        activityTypes: ['flights'],
        companions: ['alex'],
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.companions).toEqual(['alex'])
    })
  })

  describe('invalid JSON fallback', () => {
    it('falls back to phaseA data on invalid JSON', () => {
      const phaseA = makePhaseA({
        summary: 'Fallback summary',
        services: ['flights'],
        extracted: { destination: 'Fallback Destination', originCity: null },
      })
      const result = parsePhaseBResponse('invalid json {{{', phaseA, 'alice')

      expect(result.destination).toBe('Fallback Destination')
      expect(result.summary).toBe('Fallback summary')
      expect(result.confidence).toBe(0.5)
    })

    it('does not throw on invalid JSON', () => {
      expect(() => parsePhaseBResponse('not json at all', makePhaseA(), 'alice')).not.toThrow()
    })

    it('returns participants with initiator on fallback', () => {
      const result = parsePhaseBResponse('{{{invalid', makePhaseA(), 'bob')
      expect(result.participants).toHaveLength(1)
      expect(result.participants[0].handle).toBe('bob')
    })

    it('uses phaseA services as activityTypes on fallback', () => {
      const phaseA = makePhaseA({ services: ['stays', 'restaurants'] })
      const result = parsePhaseBResponse('broken', phaseA, 'alice')
      expect(result.activityTypes).toContain('stays')
      expect(result.activityTypes).toContain('restaurants')
    })

    it('falls back to products when phaseA services is empty', () => {
      const phaseA = makePhaseA({ services: [] })
      const result = parsePhaseBResponse('{{{', phaseA, 'alice')
      expect(result.activityTypes).toContain('products')
    })
  })

  describe('clarificationNeeded', () => {
    it('preserves clarificationNeeded: true', () => {
      const raw = JSON.stringify({
        destination: 'UNKNOWN',
        activityTypes: ['flights'],
        clarificationNeeded: true,
        clarificationMessage: 'Where are you flying to?',
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.clarificationNeeded).toBe(true)
      expect(result.clarificationMessage).toBe('Where are you flying to?')
    })

    it('defaults clarificationNeeded to false when not present', () => {
      const raw = JSON.stringify({
        destination: 'Tokyo',
        activityTypes: ['flights'],
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.clarificationNeeded).toBe(false)
    })
  })

  describe('budgetSignal', () => {
    it('preserves budgetSignal from JSON', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        activityTypes: ['stays'],
        budgetSignal: 'budget',
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.budgetSignal).toBe('budget')
    })

    it('defaults budgetSignal to mid-range when not present', () => {
      const raw = JSON.stringify({
        destination: 'Paris',
        activityTypes: ['stays'],
      })
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.budgetSignal).toBe('mid-range')
    })
  })

  describe('activityTypes from Phase B', () => {
    it('uses activityTypes from Phase B response, not Phase A services', () => {
      const raw = JSON.stringify({
        destination: 'Tokyo',
        activityTypes: ['experiences', 'restaurants'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const phaseA = makePhaseA({ services: ['flights', 'stays'] })
      const result = parsePhaseBResponse(raw, phaseA, 'alice')

      expect(result.activityTypes).toContain('experiences')
      expect(result.activityTypes).toContain('restaurants')
    })

    it('falls back to phaseA services when activityTypes is empty in response', () => {
      const raw = JSON.stringify({
        destination: 'Tokyo',
        activityTypes: [],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const phaseA = makePhaseA({ services: ['flights', 'stays'] })
      const result = parsePhaseBResponse(raw, phaseA, 'alice')
      expect(result.activityTypes).toContain('flights')
      expect(result.activityTypes).toContain('stays')
    })
  })

  describe('markdown stripping', () => {
    it('strips markdown code fences from JSON', () => {
      const inner = JSON.stringify({
        destination: 'Berlin',
        activityTypes: ['stays'],
        dates: { start: '2025-06-01', end: '2025-06-07' },
      })
      const raw = '```json\n' + inner + '\n```'
      const result = parsePhaseBResponse(raw, makePhaseA(), 'alice')
      expect(result.destination).toBe('Berlin')
    })
  })
})
