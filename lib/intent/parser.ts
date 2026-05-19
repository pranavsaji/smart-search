import { createHash } from 'crypto'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { env } from '@/lib/config/env'
import { getPhaseAPrompt, getPhaseAUpdatePrompt, parsePhaseAResponse } from './phaseA'
import { getPhaseBPrompt, parsePhaseBResponse } from './phaseB'
import { groqPhaseA, groqPhaseB } from './providers/groq'
import { claudePhaseA, claudePhaseB } from './providers/claude'
import type { ParsedIntent, PhaseAResult, ActivityType, BudgetSignal } from './types'
import { classifyDestination, formatAirportHint } from '@/lib/geo/destinations'
import { format, addDays } from 'date-fns'

const CACHE_TTL = 600 // 10 minutes

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function parseIntentFromMessages(
  messages: ChatMessage[],
  initiatorHandle: string,
  previousIntent?: ParsedIntent | null,
  resolverContext?: string | null
): Promise<ParsedIntent & { _phaseA?: PhaseAResult }> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultStart = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const defaultEnd = format(addDays(new Date(), 10), 'yyyy-MM-dd')

  // Cache key from message content + previousIntent
  const hash = createHash('sha256')
    .update(messages.map(m => `${m.role}:${m.content}`).join('|') + JSON.stringify(previousIntent ?? ''))
    .digest('hex').slice(0, 16)

  const cacheKey = RedisKeys.intentParse(hash)

  try {
    const cached = await redis.get<ParsedIntent>(cacheKey)
    if (cached) return applyTravelDateGate(cached, messages, previousIntent)
  } catch { /* redis unavailable, continue */ }

  // Build LLM messages: inject resolver context if present
  const llmMessages: ChatMessage[] = [
    ...(resolverContext ? [{ role: 'system' as const, content: resolverContext }] : []),
    ...messages.filter(m => m.role !== 'system'),
  ]
  // Add today date context to the last user message
  const lastUserIdx = [...llmMessages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === 'user').at(-1)?.i
  if (lastUserIdx !== undefined) {
    llmMessages[lastUserIdx] = {
      ...llmMessages[lastUserIdx],
      content: `Today is ${today}. Default dates if unspecified: start=${defaultStart}, end=${defaultEnd}.\n\n${llmMessages[lastUserIdx].content}`,
    }
  }

  try {
    // Phase A — service identification (cheap/fast)
    const phaseAPrompt = previousIntent
      ? getPhaseAUpdatePrompt(previousIntent.services?.map(s => s.id) ?? previousIntent.activityTypes ?? [])
      : getPhaseAPrompt()

    let phaseARaw: string
    try {
      phaseARaw = env.AI_PROVIDER() === 'claude'
        ? await claudePhaseA(phaseAPrompt, llmMessages)
        : await groqPhaseA(phaseAPrompt, llmMessages)
    } catch {
      // Provider unavailable — fall back to Claude
      phaseARaw = await claudePhaseA(phaseAPrompt, llmMessages)
    }

    const phaseA = parsePhaseAResponse(phaseARaw)

    // Phase B — schema mapping (quality)
    const phaseBPrompt = getPhaseBPrompt(phaseA, previousIntent)
    const phaseBMessages: ChatMessage[] = [
      {
        role: 'user',
        content: `Full user request context: ${llmMessages.filter(m => m.role === 'user').map(m => m.content).join('\n')}\n\nPhase A output: ${JSON.stringify(phaseA)}`,
      },
    ]

    let phaseBRaw: string
    try {
      phaseBRaw = env.AI_PROVIDER() === 'claude'
        ? await claudePhaseB(phaseBPrompt, phaseBMessages)
        : await groqPhaseB(phaseBPrompt, phaseBMessages)
    } catch {
      phaseBRaw = await claudePhaseB(phaseBPrompt, phaseBMessages)
    }

    const result: ParsedIntent & { _phaseA?: PhaseAResult } = {
      ...parsePhaseBResponse(phaseBRaw, phaseA, initiatorHandle),
      rawPrompt: messages.filter(m => m.role === 'user').map(m => m.content).join('\n'),
      _phaseA: phaseA,
    }

    applyTravelDateGate(result, messages, previousIntent)

    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL })
    } catch { /* ignore */ }

    return result
  } catch {
    // Both phases failed — fallback to regex heuristics
    const prompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n')
    return { ...fallbackParse(prompt, initiatorHandle, defaultStart, defaultEnd) }
  }
}

// Backward-compatible single-prompt API (used by existing /api/intent route)
export async function parseIntent(
  prompt: string,
  initiatorHandle: string
): Promise<ParsedIntent> {
  return parseIntentFromMessages(
    [{ role: 'user', content: prompt }],
    initiatorHandle
  )
}

// Deterministic clarification gate for travel queries. Two checks, in order:
//   1. Country destination ("India") — not a bookable flight destination; ask
//      which city and name the major airports. Fires regardless of dates.
//   2. Missing travel dates — the LLM ignores the Phase B prompt rule because
//      default dates are injected into context, so we enforce it here.
// Applied after both cache reads and live Phase B results. Mutates result in place.
function applyTravelDateGate<T extends ParsedIntent>(result: T, messages: ChatMessage[], previousIntent?: ParsedIntent | null): T {
  if (result.clarificationNeeded || previousIntent) return result

  const isTravel = result.activityTypes.some(t => ['flights', 'stays'].includes(t as string))
  if (!isTravel) return result

  // 1. Ambiguous (country-level) destination → ask for the exact city + airport.
  const destClass = classifyDestination(result.destination)
  if (destClass.kind === 'country' && destClass.airports) {
    result.clarificationNeeded = true
    result.clarificationMessage =
      `${destClass.country} has several major airports — which city are you flying into? ` +
      `For example: ${formatAirportHint(destClass.airports)}.`
    return result
  }

  // 2. Travel query missing dates.
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  const hasDateInQuery = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|today|tomorrow|next\s+\w+|this\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|\d+\s*days?|\d+\s*nights?|\d+\s*weeks?)/i.test(userText)
  const hasOrigin = !!result.origin
  const hasDestination = result.destination && result.destination !== 'UNKNOWN'

  if (hasOrigin && hasDestination && !hasDateInQuery) {
    result.clarificationNeeded = true
    result.clarificationMessage = 'When would you like to travel, and how many nights are you staying?'
  }
  return result
}

function fallbackParse(
  prompt: string,
  initiatorHandle: string,
  defaultStart: string,
  defaultEnd: string
): ParsedIntent {
  const lower = prompt.toLowerCase()

  const budgetSignal: BudgetSignal =
    /cheap|budget|affordable|inexpensive/.test(lower) ? 'budget'
    : /luxury|premium|5.star|fancy|high.end/.test(lower) ? 'premium'
    : 'mid-range'

  const activityTypes: ActivityType[] = []
  const genieServices: ActivityType[] = []

  const isTravel = /trip|travel|fly|flight|hotel|stay|holiday|vacation|visit|going to/.test(lower)
  if (isTravel) {
    activityTypes.push('flights', 'stays', 'weather', 'maps')
    if (/car|drive|rent/.test(lower)) activityTypes.push('cars')
    if (/restaurant|eat|dine|food/.test(lower)) activityTypes.push('restaurants')
    if (/tour|experience|activity|museum/.test(lower)) activityTypes.push('experiences')
  }
  if (/buy|purchase|shop|order|product|laptop|phone|camera|shoe|jacket|sofa|desk/.test(lower)) activityTypes.push('products')
  if (/developer|designer|freelance|domain|logo|copywriter|website|build app|build site/.test(lower)) activityTypes.push('digital_services')
  if (/plumb|electric|clean|handyman|repair|fix|boiler|leak|assemble/.test(lower)) { activityTypes.push('home_services'); genieServices.push('home_services') }
  if (/doctor|gp|dentist|therapist|physio|mental health|prescri/.test(lower)) { activityTypes.push('health_services'); genieServices.push('health_services') }
  if (/book a meeting|schedule|calendly|advisor|consultant|coach|solicitor|accountant/.test(lower)) { activityTypes.push('appointments'); genieServices.push('appointments') }
  if (activityTypes.length === 0) activityTypes.push('products')

  const handles = (prompt.match(/@\w+/g) ?? []).filter(h => h !== `@${initiatorHandle}`)

  return {
    destination: extractDestination(prompt) ?? 'UNKNOWN',
    dates: { start: defaultStart, end: defaultEnd },
    participants: [
      { handle: initiatorHandle, userId: null, intentGraph: null },
      ...handles.map(h => ({ handle: h, userId: null, intentGraph: null })),
    ],
    groupSize: handles.length + 1,
    activityTypes,
    genieServices,
    budgetSignal,
    constraints: [],
    rawPrompt: prompt,
    confidence: 0.5,
    summary: 'New request',
    clarificationNeeded: false,
    clarificationMessage: null,
    services: [],
  }
}

function extractDestination(prompt: string): string | undefined {
  const match = prompt.match(/\b(?:to|in|visit|visiting|trip to|going to|travel to|fly to|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
  return match?.[1]
}
