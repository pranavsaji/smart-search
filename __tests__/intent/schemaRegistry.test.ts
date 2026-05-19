import {
  getServiceCatalog,
  getServiceSchemas,
  formatSchemasForPrompt,
  formatCatalogForPrompt,
} from '@/lib/intent/schemaRegistry'

describe('schemaRegistry', () => {
  describe('getServiceCatalog', () => {
    it('returns 12 services', () => {
      const catalog = getServiceCatalog()
      expect(catalog).toHaveLength(12)
    })

    it('each entry has id, description, and triggers', () => {
      const catalog = getServiceCatalog()
      for (const entry of catalog) {
        expect(entry).toHaveProperty('id')
        expect(entry).toHaveProperty('description')
        expect(entry).toHaveProperty('triggers')
        expect(Array.isArray(entry.triggers)).toBe(true)
      }
    })

    it('contains all expected service IDs', () => {
      const catalog = getServiceCatalog()
      const ids = catalog.map(s => s.id)
      expect(ids).toContain('flights')
      expect(ids).toContain('stays')
      expect(ids).toContain('cars')
      expect(ids).toContain('restaurants')
      expect(ids).toContain('experiences')
      expect(ids).toContain('products')
      expect(ids).toContain('weather')
      expect(ids).toContain('maps')
      expect(ids).toContain('appointments')
      expect(ids).toContain('home_services')
      expect(ids).toContain('health_services')
      expect(ids).toContain('digital_services')
    })
  })

  describe('getServiceSchemas', () => {
    it('loads flights.json and returns correct shape', () => {
      const schemas = getServiceSchemas(['flights'])
      expect(schemas).toHaveLength(1)
      expect(schemas[0].id).toBe('flights')
      expect(schemas[0]).toHaveProperty('description')
      expect(schemas[0]).toHaveProperty('params')
      expect(typeof schemas[0].params).toBe('object')
    })

    it('flights schema has expected params', () => {
      const schemas = getServiceSchemas(['flights'])
      const params = schemas[0].params
      expect(params).toHaveProperty('origin')
      expect(params).toHaveProperty('destination')
      expect(params).toHaveProperty('departureDate')
      expect(params.origin.required).toBe(true)
      expect(params.destination.required).toBe(true)
    })

    it('returns two schemas for flights and stays', () => {
      const schemas = getServiceSchemas(['flights', 'stays'])
      expect(schemas).toHaveLength(2)
      const ids = schemas.map(s => s.id)
      expect(ids).toContain('flights')
      expect(ids).toContain('stays')
    })

    it('returns empty array for unknown service (graceful)', () => {
      const schemas = getServiceSchemas(['unknown_service'])
      expect(schemas).toEqual([])
    })

    it('skips unknown and returns known schemas', () => {
      const schemas = getServiceSchemas(['flights', 'nonexistent'])
      expect(schemas).toHaveLength(1)
      expect(schemas[0].id).toBe('flights')
    })

    it('returns empty array for empty input', () => {
      const schemas = getServiceSchemas([])
      expect(schemas).toEqual([])
    })
  })

  describe('formatSchemasForPrompt', () => {
    it('returns empty string for empty schemas array', () => {
      const result = formatSchemasForPrompt([])
      expect(result).toBe('')
    })

    it('contains service ID and param names for flights schema', () => {
      const schemas = getServiceSchemas(['flights'])
      const result = formatSchemasForPrompt(schemas)
      expect(result).toContain('flights:')
      expect(result).toContain('origin')
      expect(result).toContain('destination')
      expect(result).toContain('departureDate')
    })

    it('indicates REQUIRED vs optional params', () => {
      const schemas = getServiceSchemas(['flights'])
      const result = formatSchemasForPrompt(schemas)
      expect(result).toContain('REQUIRED')
      expect(result).toContain('optional')
    })

    it('includes requiresAtLeastOne block when present', () => {
      const schemas = getServiceSchemas(['flights'])
      // flights.json has requiresAtLeastOne
      if (schemas[0].requiresAtLeastOne) {
        const result = formatSchemasForPrompt(schemas)
        expect(result).toContain('requiresAtLeastOne')
      }
    })

    it('formats multiple schemas separated by newlines', () => {
      const schemas = getServiceSchemas(['flights', 'stays'])
      const result = formatSchemasForPrompt(schemas)
      expect(result).toContain('flights:')
      expect(result).toContain('stays:')
    })
  })

  describe('formatCatalogForPrompt', () => {
    it('contains all 12 service IDs', () => {
      const result = formatCatalogForPrompt()
      const expectedIds = [
        'flights', 'stays', 'cars', 'restaurants', 'experiences',
        'products', 'weather', 'maps', 'appointments',
        'home_services', 'health_services', 'digital_services',
      ]
      for (const id of expectedIds) {
        expect(result).toContain(id)
      }
    })

    it('returns a non-empty string', () => {
      const result = formatCatalogForPrompt()
      expect(result.length).toBeGreaterThan(0)
    })

    it('includes triggers for each service', () => {
      const result = formatCatalogForPrompt()
      expect(result).toContain('triggers:')
    })
  })
})
