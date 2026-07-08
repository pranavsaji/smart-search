import { getServiceSchemas, formatSchemasForPrompt } from './schemaRegistry'
import type { PhaseAResult, ParsedIntent, ServiceIntent } from './types'
import { format, addDays } from 'date-fns'

export function getPhaseBPrompt(phaseA: PhaseAResult, previousIntent?: ParsedIntent | null): string {
  const schemas = getServiceSchemas(phaseA.services)
  const schemaBlock = schemas.length > 0 ? formatSchemasForPrompt(schemas) : '(no schemas — return empty services array)'

  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultStart = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const defaultEnd = format(addDays(new Date(), 10), 'yyyy-MM-dd')

  const updateContext = previousIntent
    ? `\nThis is an UPDATE to an existing request. Previous intent: ${JSON.stringify({ destination: previousIntent.destination, dates: previousIntent.dates, activityTypes: previousIntent.activityTypes })}\nOnly change what is explicitly modified in the new message.`
    : ''

  return `You are Phase B of Smart Search's intent pipeline. Phase A identified these services: ${phaseA.services.join(', ')}.

Today: ${today}. Default dates if unspecified: start=${defaultStart}, end=${defaultEnd}.
Phase A extracted (use for service/location hints only — DO NOT trust Phase A dates): ${JSON.stringify(phaseA.extracted)}
${updateContext}

CRITICAL — Date resolution: Always compute dates yourself from the raw user message using Today=${today}.
Phase A's date extraction is unreliable. Examples (assuming today is 2026-05-26):
- "next month 28th" → 2026-06-28
- "next Friday" → next occurrence of Friday after today
- "in 2 weeks" → today + 14 days
- "this weekend" → nearest upcoming Saturday
- "June 15" → 2026-06-15 (or 2027-06-15 if already past)

Your job: map the user's full message + Phase A data into the exact parameter schemas below.
Return ONLY valid JSON, no prose.

Service schemas to populate:
${schemaBlock}

Output JSON shape:
{
  "destination": "city or UNKNOWN",
  "origin": "city or null",
  "dates": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "groupSize": 1,
  "budgetSignal": "budget|mid-range|premium|unspecified",
  "constraints": [],
  "activityTypes": [...service ids...],
  "genieServices": [...genie-eligible service ids...],
  "confidence": 0.9,
  "summary": "...",
  "originCity": "...",
  "companions": [],
  "clarificationNeeded": false,
  "clarificationMessage": null,
  "services": [
    { "id": "flights", "isRequested": true, "params": { ... }, "missingParams": [] }
  ]
}

Rules:
- activityTypes: use the exact service IDs from Phase A
- If "cars" is in activityTypes and no end date is given, default end date to start + 3 days
- If user says "drive from X to Y", set origin=X, destination=Y, include "cars" in activityTypes — do NOT require flights
- genieServices: only health_services, appointments, home_services when explicitly requested
- companions: @handles of collaborators (not brands)
- For travel queries with named destination, always include weather and maps in activityTypes
- clarificationNeeded: Set true in these cases:
  * Travel query where destination cannot be inferred at all (e.g. "book flights" with zero location context)
  * Service query so vague no service type can be determined (e.g. "help me with something")
  * Travel query (has flights or stays) where BOTH origin AND destination are known but NO travel dates are mentioned → ask for travel dates and duration
  * DO NOT ask for clarification if: group size missing (default 1), budget missing (default mid-range)
  * DO NOT ask for clarification if destination is clear or strongly implied
  * When clarificationNeeded=true, clarificationMessage must ask for the ONE specific missing piece — not a list of questions
  * For missing travel dates: ask "When would you like to travel, and how many nights?" — ask this as a single combined question
  * Example good clarification: "Where would you like to travel to?", "When would you like to travel, and how many nights?", or "What type of appointment are you looking for?"
  * Example bad clarification: "Could you provide more details about your trip?" (too vague)`
}

// Normalize LLM-invented activity type names to canonical catalog IDs
const ACTIVITY_TYPE_ALIASES: Record<string, string> = {
  hotels: 'stays', hotel: 'stays', accommodation: 'stays', lodging: 'stays',
  flight: 'flights', airplane: 'flights', air: 'flights',
  car: 'cars', 'car rental': 'cars', rental: 'cars',
  experience: 'experiences', activity: 'experiences', activities: 'experiences', tour: 'experiences', tours: 'experiences',
  restaurant: 'restaurants', dining: 'restaurants', food: 'restaurants',
  shopping: 'products', shop: 'products', product: 'products',
  digital: 'digital_services', freelance: 'digital_services', domain: 'digital_services',
  home: 'home_services', 'home service': 'home_services',
  health: 'health_services', medical: 'health_services', doctor: 'health_services',
  appointment: 'appointments', booking: 'appointments', schedule: 'appointments',
}

function normalizeActivityTypes(types: string[]): string[] {
  return types.map(t => ACTIVITY_TYPE_ALIASES[t.toLowerCase()] ?? t)
}

export function parsePhaseBResponse(raw: string, phaseA: PhaseAResult, initiatorHandle: string): ParsedIntent {
  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultStart = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const defaultEnd = format(addDays(new Date(), 10), 'yyyy-MM-dd')

  // Suppress unused variable warning
  void today

  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)

    // Clean destination — LLMs sometimes include trailing prepositions (e.g. "Paris from", "Bangalore to")
    if (typeof parsed.destination === 'string') {
      parsed.destination = parsed.destination
        .replace(/\s+(from|to|in|at|near|via|for|and)\s*$/i, '')
        .trim()
    }
    // Clean origin similarly
    if (typeof parsed.origin === 'string') {
      parsed.origin = parsed.origin
        .replace(/\s+(from|to|in|at|near|via|for|and)\s*$/i, '')
        .trim() || undefined
    }

    const rawActivityTypes = Array.isArray(parsed.activityTypes) && parsed.activityTypes.length > 0
      ? parsed.activityTypes
      : phaseA.services.length > 0 ? phaseA.services : ['products']
    const activityTypes = normalizeActivityTypes(rawActivityTypes)

    // Inject weather + maps for travel queries
    const TRAVEL_TYPES = ['flights', 'stays', 'cars', 'experiences']
    const isTravelQuery = activityTypes.some((t: string) => TRAVEL_TYPES.includes(t))
    const destination = parsed.destination ?? phaseA.extracted?.destination ?? 'UNKNOWN'
    let finalActivityTypes = [...activityTypes]
    if (isTravelQuery && destination !== 'UNKNOWN') {
      if (!finalActivityTypes.includes('weather')) finalActivityTypes.push('weather')
      if (!finalActivityTypes.includes('maps')) finalActivityTypes.push('maps')
    }

    const companions = (parsed.companions ?? []) as string[]
    const participants = [
      { handle: initiatorHandle, userId: null, intentGraph: null },
      ...companions.map((h: string) => ({ handle: h, userId: null, intentGraph: null })),
    ]

    const startDate = parsed.dates?.start ?? defaultStart
    // For car-only queries (road trips), default end to start+3 if not given
    const isCarsOnly = activityTypes.length > 0 && activityTypes.every((t: string) => ['cars','weather','maps'].includes(t))
    const endDate = parsed.dates?.end ?? (isCarsOnly ? format(addDays(new Date(startDate), 3), 'yyyy-MM-dd') : defaultEnd)

    return {
      destination,
      origin: parsed.origin ?? phaseA.extracted?.originCity ?? undefined,
      dates: {
        start: startDate,
        end: endDate,
      },
      participants,
      groupSize: parsed.groupSize ?? participants.length,
      activityTypes: finalActivityTypes as import('./types').ActivityType[],
      genieServices: parsed.genieServices ?? [],
      budgetSignal: parsed.budgetSignal ?? 'mid-range',
      constraints: parsed.constraints ?? [],
      rawPrompt: '',
      confidence: parsed.confidence ?? 0.8,
      summary: parsed.summary ?? phaseA.summary,
      originCity: parsed.originCity ?? phaseA.extracted?.originCity ?? null,
      companions,
      clarificationNeeded: parsed.clarificationNeeded ?? false,
      clarificationMessage: parsed.clarificationMessage ?? null,
      services: (parsed.services ?? []) as ServiceIntent[],
    }
  } catch {
    // Fallback from phase A data
    return {
      destination: phaseA.extracted?.destination ?? 'UNKNOWN',
      origin: phaseA.extracted?.originCity ?? undefined,
      dates: { start: defaultStart, end: defaultEnd },
      participants: [{ handle: initiatorHandle, userId: null, intentGraph: null }],
      groupSize: 1,
      activityTypes: (phaseA.services.length > 0 ? phaseA.services : ['products']) as import('./types').ActivityType[],
      genieServices: [],
      budgetSignal: 'mid-range',
      constraints: [],
      rawPrompt: '',
      confidence: 0.5,
      summary: phaseA.summary,
      clarificationNeeded: false,
      clarificationMessage: null,
      services: [],
    }
  }
}
