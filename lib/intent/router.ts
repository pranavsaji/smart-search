// Universal Intent Gateway — Phase 9.1
// Routes any free-form query to the right adapters.
// Falls back to web-search synthesis when no adapter matches.
// Provides "did you mean?" suggestions for ambiguous queries.

import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { redis, RedisKeys } from '@/lib/cache/redis'
import type { ParsedIntent, ActivityType } from '@/lib/intent/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RouteType = 'known_service' | 'open_ended' | 'web_search' | 'clarification'

export interface SynthesizedCard {
  id: string
  title: string
  snippet: string
  url: string
  sourceType: 'web_result'
  relevanceScore: number
}

export interface RouterResult {
  intent: ParsedIntent
  route: RouteType
  suggestions?: string[]         // "did you mean?" options, max 3
  webSearchQuery?: string        // populated when route === 'web_search'
  synthesizedCards?: SynthesizedCard[]
}

export interface WebSearchProvider {
  search(query: string): Promise<SynthesizedCard[]>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_ACTIVITY_TYPES = new Set<ActivityType>([
  'flights', 'stays', 'cars', 'experiences', 'restaurants',
  'weather', 'maps', 'products', 'digital_services',
  'home_services', 'health_services', 'appointments',
])

const CONFIDENCE_THRESHOLD = 0.4
const CACHE_TTL = 600 // 10 min

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function routeIntent(
  prompt: string,
  parsedIntent: ParsedIntent,
  options?: {
    skipWebSearch?: boolean
    webSearchProvider?: WebSearchProvider
  }
): Promise<RouterResult> {
  // Clarification already triggered by the intent pipeline → pass through
  if (parsedIntent.clarificationNeeded) {
    return { intent: parsedIntent, route: 'clarification' }
  }

  // High confidence with known services → no extra routing needed
  if (
    parsedIntent.confidence >= CONFIDENCE_THRESHOLD &&
    parsedIntent.activityTypes.length > 0 &&
    parsedIntent.activityTypes.every(t => KNOWN_ACTIVITY_TYPES.has(t))
  ) {
    return { intent: parsedIntent, route: 'known_service' }
  }

  // Low confidence or no matched types → open-ended LLM classification
  const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 16)
  const cacheKey = RedisKeys.routerResult(hash)

  try {
    const cached = await redis.get<RouterResult>(cacheKey)
    if (cached) return cached
  } catch { /* redis unavailable */ }

  const result = await classifyOpenEnded(prompt, parsedIntent, options)

  try {
    await redis.set(cacheKey, result, { ex: CACHE_TTL })
  } catch { /* ignore */ }

  return result
}

// ─── LLM Classification ───────────────────────────────────────────────────────

async function classifyOpenEnded(
  prompt: string,
  parsedIntent: ParsedIntent,
  options?: { skipWebSearch?: boolean; webSearchProvider?: WebSearchProvider }
): Promise<RouterResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Dev fallback: assume web_search when no API key
    return buildWebSearchResult(parsedIntent, prompt, options)
  }

  const anthropic = new Anthropic({ apiKey })

  const system = `You classify user queries for Smart Search — an intent operating system.

Known service categories: flights, stays, cars, experiences, restaurants, weather, maps, products, digital_services, home_services, health_services, appointments

Determine if the query:
1. Matches a known category (even loosely) → route "known_service", list matchedServices
2. Is open-ended and can be partially handled → route "open_ended"
3. Requires a web search fallback → route "web_search"

Respond ONLY with valid JSON. No prose. Schema:
{
  "route": "known_service" | "open_ended" | "web_search",
  "matchedServices": string[],
  "suggestions": string[],
  "webSearchQuery": string | null,
  "confidence": number
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const cls = JSON.parse(jsonMatch[0]) as {
      route: RouteType
      matchedServices: string[]
      suggestions: string[]
      webSearchQuery: string | null
      confidence: number
    }

    const knownMatches = cls.matchedServices.filter(s =>
      KNOWN_ACTIVITY_TYPES.has(s as ActivityType)
    ) as ActivityType[]

    const updatedIntent: ParsedIntent = {
      ...parsedIntent,
      activityTypes: knownMatches.length > 0 ? knownMatches : parsedIntent.activityTypes,
      confidence: cls.confidence,
    }

    // Always honour a web_search classification — buildWebSearchResult respects skipWebSearch
    if (cls.route === 'web_search') {
      return buildWebSearchResult(
        updatedIntent,
        cls.webSearchQuery ?? prompt,
        options,
        cls.suggestions
      )
    }

    const finalRoute: RouteType =
      cls.route === 'known_service' && knownMatches.length > 0
        ? 'known_service'
        : 'open_ended'

    return {
      intent: updatedIntent,
      route: finalRoute,
      suggestions: cls.suggestions?.slice(0, 3),
      webSearchQuery: cls.webSearchQuery ?? undefined,
    }
  } catch {
    return buildWebSearchResult(parsedIntent, prompt, options)
  }
}

async function buildWebSearchResult(
  intent: ParsedIntent,
  query: string,
  options?: { skipWebSearch?: boolean; webSearchProvider?: WebSearchProvider },
  suggestions?: string[]
): Promise<RouterResult> {
  const synthesizedCards = options?.webSearchProvider && !options.skipWebSearch
    ? await options.webSearchProvider.search(query).catch(() => [])
    : []

  return {
    intent,
    route: 'web_search',
    webSearchQuery: query,
    synthesizedCards,
    suggestions: suggestions?.slice(0, 3),
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function buildWebSearchCardId(url: string): string {
  return `ws_${createHash('sha256').update(url).digest('hex').slice(0, 12)}`
}

export function isKnownActivityType(s: string): s is ActivityType {
  return KNOWN_ACTIVITY_TYPES.has(s as ActivityType)
}
