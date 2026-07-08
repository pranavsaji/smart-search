// Phase 12.4 — Insight narrative generation.
//
// Turns a numeric InsightStats into a short, friendly headline + narrative.
// Mock-first: with ANTHROPIC_API_KEY set it uses Claude Haiku; otherwise it
// falls back to a deterministic template so the feature is always demo-ready
// and unit-testable without network or keys.

import { logger } from '@/lib/logger'
import type { InsightStats } from './types'

export interface Narrative {
  headline: string
  narrative: string
}

function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100)
}

/** Deterministic fallback narrative — no LLM, no network. */
export function mockNarrative(stats: InsightStats): Narrative {
  const spent = formatMoney(stats.totalSpentCents, stats.currency)
  const topCat = [...stats.byCategory].sort((a, b) => b.spentCents - a.spentCents)[0]
  const catBit = topCat ? ` Most of it went to ${labelFor(topCat.activityType)}.` : ''
  const destBit = stats.topDestinations.length
    ? ` You explored ${stats.topDestinations.slice(0, 3).join(', ')}.`
    : ''
  const saveBit = stats.savingsVsMarketCents > 0
    ? ` Smart Search saved you ${formatMoney(stats.savingsVsMarketCents, stats.currency)} vs market rates.`
    : ''
  const genieBit = stats.genieInteractions > 0
    ? ` Genie handled ${stats.genieInteractions} task${stats.genieInteractions === 1 ? '' : 's'} for you.`
    : ''

  const headline =
    stats.orderCount === 0
      ? 'A quiet week on Smart Search'
      : `You made ${stats.orderCount} booking${stats.orderCount === 1 ? '' : 's'} this period`

  const narrative =
    stats.orderCount === 0
      ? "No bookings this period — when you're ready, just tell Smart Search what you need."
      : `You spent ${spent} across ${stats.orderCount} order${stats.orderCount === 1 ? '' : 's'}.${catBit}${destBit}${saveBit}${genieBit}`.trim()

  return { headline, narrative }
}

const ACTIVITY_LABELS: Record<string, string> = {
  flights: 'flights', stays: 'stays', cars: 'car hire', experiences: 'experiences',
  restaurants: 'dining', products: 'shopping', digital_services: 'digital services',
  home_services: 'home services', health_services: 'health', appointments: 'appointments',
  weather: 'weather', maps: 'maps',
}
function labelFor(t: string): string {
  return ACTIVITY_LABELS[t] ?? t
}

/**
 * Generate a narrative. Uses Claude when a key is configured; otherwise returns
 * the deterministic mock. Any LLM failure degrades gracefully to the mock.
 */
export async function generateNarrative(stats: InsightStats): Promise<Narrative> {
  if (!process.env.ANTHROPIC_API_KEY) return mockNarrative(stats)

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:
        'You write a short, warm weekly insights blurb for a commerce app user. ' +
        'Return STRICT JSON: {"headline": string (max 8 words), "narrative": string (max 3 sentences)}. ' +
        'Be specific with the numbers provided. No markdown, no preamble.',
      messages: [{ role: 'user', content: JSON.stringify(stats) }],
    })
    const block = res.content.find(b => b.type === 'text')
    const text = block?.type === 'text' ? block.text : ''
    const parsed = JSON.parse(text) as Partial<Narrative>
    if (parsed.headline && parsed.narrative) {
      return { headline: parsed.headline, narrative: parsed.narrative }
    }
    return mockNarrative(stats)
  } catch (err) {
    logger.warn('[insights] narrative LLM failed, using mock', { err: String(err) })
    return mockNarrative(stats)
  }
}
