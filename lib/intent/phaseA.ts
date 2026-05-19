import { formatCatalogForPrompt } from './schemaRegistry'
import type { PhaseAResult } from './types'

export function getPhaseAPrompt(): string {
  const catalog = formatCatalogForPrompt()
  return `You are Phase A of a two-phase intent parsing pipeline for iAM — an intent operating system.

Your job: given a user's message, identify WHICH services are needed and extract top-level entities.
Return ONLY valid JSON, no prose.

Available services:
${catalog}

Rules:
- services: array of service IDs from the catalog that are relevant to this request
- summary: short human label for this request (e.g. "Flight to Tokyo + hotel")
- extracted.destination: city/region for travel, null for digital/shopping
- extracted.originCity: departure city for flights, null otherwise
- extracted.departureDate: departure date in YYYY-MM-DD if mentioned, null otherwise
- extracted.destination_stage: @handle if used as a destination alone (e.g. "@dubai")
- extracted.brand: brand handle if @handle qualifies a product (e.g. @nike + shoes → "nike")
- extracted.collaborator: @handle if it's a person to travel/collaborate with

Output JSON shape:
{
  "summary": "...",
  "services": ["flights", "stays"],
  "extracted": {
    "destination": "...",
    "originCity": "...",
    "departureDate": "...",
    "destination_stage": null,
    "brand": null,
    "collaborator": null
  }
}`
}

export function getPhaseAUpdatePrompt(activeServiceIds: string[]): string {
  const catalog = formatCatalogForPrompt()
  return `You are Phase A of a two-phase intent parsing pipeline for iAM.

The user is refining an existing request. Currently active services: ${activeServiceIds.join(', ')}

Your job: identify what CHANGED or was ADDED in this message. Return only what is new or modified.
Return ONLY valid JSON, no prose.

Available services:
${catalog}

Output JSON shape (same as initial — include ALL services for the updated intent, not just new ones):
{
  "summary": "...",
  "services": [...],
  "extracted": {
    "destination": "...",
    "originCity": "...",
    "departureDate": "...",
    "destination_stage": null,
    "brand": null,
    "collaborator": null
  }
}`
}

export function parsePhaseAResponse(raw: string): PhaseAResult {
  try {
    const parsed = JSON.parse(raw) as PhaseAResult
    return {
      summary: parsed.summary ?? 'New request',
      services: Array.isArray(parsed.services) ? parsed.services : [],
      extracted: {
        destination: parsed.extracted?.destination ?? null,
        originCity: parsed.extracted?.originCity ?? null,
        departureDate: parsed.extracted?.departureDate ?? null,
        destination_stage: parsed.extracted?.destination_stage ?? null,
        brand: parsed.extracted?.brand ?? null,
        collaborator: parsed.extracted?.collaborator ?? null,
      },
    }
  } catch {
    // Fallback: empty result
    return {
      summary: 'New request',
      services: [],
      extracted: { destination: null, originCity: null, departureDate: null, destination_stage: null, brand: null, collaborator: null },
    }
  }
}
