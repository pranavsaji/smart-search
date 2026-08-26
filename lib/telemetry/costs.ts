// LLM and vendor API spend tracking. Closes GAP_ANALYSIS 1.5 (cost monitoring).
//
// Before this, API costs were invisible: a prompt-size regression or a retry
// loop showed up as a surprise invoice rather than a metric.
//
// Rows land in the `api_costs` collection and are read back as a daily rollup
// by /api/admin/costs. Writes are fire-and-forget — billing telemetry must
// never fail the request that generated it.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'

export type LLMProvider = 'anthropic' | 'groq' | 'openai'

export interface LLMCostRecord {
  kind: 'llm'
  provider: LLMProvider
  model: string
  inputTokens: number
  outputTokens: number
  costCents: number
  userId?: string
  createdAt: Date
  day: string          // YYYY-MM-DD (UTC) — the rollup group key
}

export interface ApiCallRecord {
  kind: 'api'
  service: string
  endpoint: string
  durationMs: number
  ok: boolean
  createdAt: Date
  day: string
}

// USD per million tokens, as published by each provider.
// Keep in sync deliberately — a stale entry silently under-reports spend.
const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-opus-4':                  { inputPerMTok: 15,   outputPerMTok: 75 },
  'claude-sonnet-4':                { inputPerMTok: 3,    outputPerMTok: 15 },
  'claude-3-5-haiku-20241022':      { inputPerMTok: 0.80, outputPerMTok: 4 },
  'claude-3-5-sonnet-20241022':     { inputPerMTok: 3,    outputPerMTok: 15 },
  'llama-3.1-8b-instant':           { inputPerMTok: 0.05, outputPerMTok: 0.08 },
  'llama-3.3-70b-versatile':        { inputPerMTok: 0.59, outputPerMTok: 0.79 },
  'whisper-1':                      { inputPerMTok: 0,    outputPerMTok: 0 },
}

// Used when a model is absent from PRICING. Deliberately not zero: an unknown
// model reading as free is how spend goes unnoticed.
const FALLBACK_PRICING = { inputPerMTok: 1, outputPerMTok: 5 }

export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[model] ?? FALLBACK_PRICING
  const dollars =
    (inputTokens / 1_000_000) * price.inputPerMTok +
    (outputTokens / 1_000_000) * price.outputPerMTok
  // Sub-cent calls are the norm; rounding here would report most traffic as free.
  return Math.round(dollars * 100 * 10_000) / 10_000
}

export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export async function trackLLMCost(opts: {
  provider: LLMProvider
  model: string
  inputTokens: number
  outputTokens: number
  userId?: string
}): Promise<void> {
  try {
    const now = new Date()
    const record: LLMCostRecord = {
      kind: 'llm',
      provider: opts.provider,
      model: opts.model,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      costCents: estimateCostCents(opts.model, opts.inputTokens, opts.outputTokens),
      ...(opts.userId ? { userId: opts.userId } : {}),
      createdAt: now,
      day: utcDay(now),
    }
    const db = await getDb()
    await db.collection(COLLECTIONS.apiCosts).insertOne(record)
  } catch (err) {
    console.error('[costs] trackLLMCost failed', err)
  }
}

export async function trackAPICall(opts: {
  service: string
  endpoint: string
  durationMs: number
  ok?: boolean
}): Promise<void> {
  try {
    const now = new Date()
    const record: ApiCallRecord = {
      kind: 'api',
      service: opts.service,
      endpoint: opts.endpoint,
      durationMs: opts.durationMs,
      ok: opts.ok ?? true,
      createdAt: now,
      day: utcDay(now),
    }
    const db = await getDb()
    await db.collection(COLLECTIONS.apiCosts).insertOne(record)
  } catch (err) {
    console.error('[costs] trackAPICall failed', err)
  }
}

export interface DailyCostSummary {
  day: string
  totalCostCents: number
  byProvider: Record<string, number>
  llmCalls: number
  apiCalls: number
}

/** Daily spend for the last `days` days, newest first. */
export async function getDailyCosts(days = 30): Promise<DailyCostSummary[]> {
  const db = await getDb()
  const since = new Date(Date.now() - days * 24 * 3600 * 1000)

  const rows = await db.collection(COLLECTIONS.apiCosts).aggregate<{
    _id: string
    totalCostCents: number
    byProvider: { provider: string; cost: number }[]
    llmCalls: number
    apiCalls: number
  }>([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$day',
        totalCostCents: { $sum: { $ifNull: ['$costCents', 0] } },
        byProvider: {
          $push: {
            provider: { $ifNull: ['$provider', '$service'] },
            cost: { $ifNull: ['$costCents', 0] },
          },
        },
        llmCalls: { $sum: { $cond: [{ $eq: ['$kind', 'llm'] }, 1, 0] } },
        apiCalls: { $sum: { $cond: [{ $eq: ['$kind', 'api'] }, 1, 0] } },
      },
    },
    { $sort: { _id: -1 } },
  ]).toArray()

  return rows.map(r => ({
    day: r._id,
    totalCostCents: Math.round(r.totalCostCents * 10_000) / 10_000,
    byProvider: r.byProvider.reduce<Record<string, number>>((acc, { provider, cost }) => {
      if (!provider) return acc
      acc[provider] = Math.round(((acc[provider] ?? 0) + cost) * 10_000) / 10_000
      return acc
    }, {}),
    llmCalls: r.llmCalls,
    apiCalls: r.apiCalls,
  }))
}
