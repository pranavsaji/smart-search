import catalog from './schemas/_catalog.json'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface ServiceCatalogEntry {
  id: string
  description: string
  triggers: string[]
}

export interface ServiceSchema {
  id: string
  description: string
  params: Record<string, { type: string; required: boolean; description: string }>
  requiresAtLeastOne?: string[]
}

export function getServiceCatalog(): ServiceCatalogEntry[] {
  return catalog.services as ServiceCatalogEntry[]
}

const schemaCache = new Map<string, ServiceSchema>()

export function getServiceSchemas(serviceIds: string[]): ServiceSchema[] {
  return serviceIds.flatMap(id => {
    if (schemaCache.has(id)) return [schemaCache.get(id)!]
    try {
      const raw = readFileSync(join(process.cwd(), 'lib', 'intent', 'schemas', `${id}.json`), 'utf-8')
      const schema = JSON.parse(raw) as ServiceSchema
      schemaCache.set(id, schema)
      return [schema]
    } catch {
      return []
    }
  })
}

export function formatSchemasForPrompt(schemas: ServiceSchema[]): string {
  return schemas.map(s => {
    const lines = Object.entries(s.params).map(([k, d]) =>
      `    ${k}: ${d.type} (${d.required ? 'REQUIRED' : 'optional'}) — ${d.description}`
    )
    let block = `  ${s.id}:\n${lines.join('\n')}`
    if (s.requiresAtLeastOne) block += `\n    (requiresAtLeastOne: ${s.requiresAtLeastOne.join(', ')})`
    return block
  }).join('\n\n')
}

export function formatCatalogForPrompt(): string {
  return catalog.services.map((s: ServiceCatalogEntry) =>
    `  ${s.id}: ${s.description} [triggers: ${s.triggers.join(', ')}]`
  ).join('\n')
}
