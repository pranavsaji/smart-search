import {
  getPhaseAPrompt,
  getPhaseAUpdatePrompt,
  parsePhaseAResponse,
} from '@/lib/intent/phaseA'

describe('phaseA', () => {
  describe('getPhaseAPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = getPhaseAPrompt()
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    })

    it('contains the catalog with all 12 service IDs', () => {
      const prompt = getPhaseAPrompt()
      const expectedIds = [
        'flights', 'stays', 'cars', 'restaurants', 'experiences',
        'products', 'weather', 'maps', 'appointments',
        'home_services', 'health_services', 'digital_services',
      ]
      for (const id of expectedIds) {
        expect(prompt).toContain(id)
      }
    })

    it('mentions JSON output instructions', () => {
      const prompt = getPhaseAPrompt()
      expect(prompt).toContain('JSON')
    })

    it('describes expected output fields', () => {
      const prompt = getPhaseAPrompt()
      expect(prompt).toContain('summary')
      expect(prompt).toContain('services')
      expect(prompt).toContain('extracted')
    })
  })

  describe('getPhaseAUpdatePrompt', () => {
    it('mentions the active service in the prompt', () => {
      const prompt = getPhaseAUpdatePrompt(['flights'])
      expect(prompt).toContain('flights')
    })

    it('mentions multiple active services', () => {
      const prompt = getPhaseAUpdatePrompt(['flights', 'stays', 'weather'])
      expect(prompt).toContain('flights')
      expect(prompt).toContain('stays')
      expect(prompt).toContain('weather')
    })

    it('still contains the catalog', () => {
      const prompt = getPhaseAUpdatePrompt(['flights'])
      // should contain catalog entries
      expect(prompt).toContain('stays')
      expect(prompt).toContain('cars')
    })

    it('references refining an existing request', () => {
      const prompt = getPhaseAUpdatePrompt(['flights'])
      expect(prompt.toLowerCase()).toMatch(/refin|existing|update/i)
    })

    it('works with empty services array', () => {
      const prompt = getPhaseAUpdatePrompt([])
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    })
  })

  describe('parsePhaseAResponse', () => {
    it('parses valid JSON with all fields correctly', () => {
      const raw = JSON.stringify({
        summary: 'test',
        services: ['flights'],
        extracted: { destination: 'Tokyo', originCity: 'London', departureDate: '2025-06-01' },
      })
      const result = parsePhaseAResponse(raw)
      expect(result.summary).toBe('test')
      expect(result.services).toEqual(['flights'])
      expect(result.extracted.destination).toBe('Tokyo')
      expect(result.extracted.originCity).toBe('London')
      expect(result.extracted.departureDate).toBe('2025-06-01')
    })

    it('returns fallback with empty services on invalid JSON', () => {
      const result = parsePhaseAResponse('invalid json {{{')
      expect(result.services).toEqual([])
      expect(result.summary).toBe('New request')
    })

    it('does not throw on invalid JSON', () => {
      expect(() => parsePhaseAResponse('invalid json {{{')).not.toThrow()
    })

    it('returns default summary "New request" when summary is missing', () => {
      const result = parsePhaseAResponse('{}')
      expect(result.summary).toBe('New request')
    })

    it('returns empty services array when services is missing', () => {
      const result = parsePhaseAResponse('{}')
      expect(result.services).toEqual([])
    })

    it('returns null extracted fields on empty object', () => {
      const result = parsePhaseAResponse('{}')
      expect(result.extracted.destination).toBeNull()
      expect(result.extracted.originCity).toBeNull()
      expect(result.extracted.departureDate).toBeNull()
      expect(result.extracted.destination_stage).toBeNull()
      expect(result.extracted.brand).toBeNull()
      expect(result.extracted.collaborator).toBeNull()
    })

    it('handles missing extracted block gracefully', () => {
      const raw = JSON.stringify({ summary: 'test', services: ['stays'] })
      const result = parsePhaseAResponse(raw)
      expect(result.extracted.destination).toBeNull()
      expect(result.services).toEqual(['stays'])
    })

    it('preserves brand and collaborator from extracted', () => {
      const raw = JSON.stringify({
        summary: 'buy nike',
        services: ['products'],
        extracted: { brand: 'nike', collaborator: null, destination: null },
      })
      const result = parsePhaseAResponse(raw)
      expect(result.extracted.brand).toBe('nike')
      expect(result.extracted.collaborator).toBeNull()
    })

    it('handles non-array services by returning empty array', () => {
      const raw = JSON.stringify({ summary: 'test', services: 'flights' })
      const result = parsePhaseAResponse(raw)
      expect(result.services).toEqual([])
    })
  })
})
