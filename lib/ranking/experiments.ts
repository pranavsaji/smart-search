// Phase 12.2 — A/B testing framework for ranking experiments.
//
// Assignment is DETERMINISTIC: a stable hash of (userId : experimentKey) maps to
// a point in [0,1) and falls into a variant by cumulative allocation. The same
// user always gets the same variant for a given experiment — no per-request
// randomness, no assignment table to keep in sync, reproducible in tests.
//
// Experiments are stored in `ab_experiments`; per-variant exposure/conversion
// counters live in `ab_exposures` (one row per variant, incremented atomically).
// Mock-first: with no DB the pure assignment helpers still work.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { logger } from '@/lib/logger'

export interface ExperimentVariant {
  name: string
  allocation: number    // 0–1; allocations across an experiment must sum to ~1
  /** Optional numeric payload a variant carries, e.g. the ML rerank weight. */
  weight?: number
}

export interface Experiment {
  key: string
  name: string
  description?: string
  variants: ExperimentVariant[]
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateExperimentInput {
  key: string
  name: string
  description?: string
  variants: ExperimentVariant[]
}

export interface VariantResult {
  variant: string
  exposures: number
  conversions: number
  conversionRate: number
}

const ALLOCATION_EPSILON = 0.001

// ─── Pure deterministic assignment ─────────────────────────────────────────────

/** FNV-1a → unit interval [0,1). Deterministic and dependency-free. */
export function hashToUnit(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // 32-bit FNV prime multiply via shifts to stay in integer range.
    h = Math.imul(h, 0x01000193)
  }
  // Map the unsigned 32-bit hash into [0,1).
  return (h >>> 0) / 0x100000000
}

/** Validate that variant allocations form a probability distribution. */
export function validateVariants(variants: ExperimentVariant[]): void {
  if (variants.length < 2) throw new Error('experiment needs at least 2 variants')
  const sum = variants.reduce((s, v) => s + v.allocation, 0)
  if (Math.abs(sum - 1) > ALLOCATION_EPSILON) {
    throw new Error(`variant allocations must sum to 1 (got ${sum.toFixed(3)})`)
  }
  if (variants.some(v => v.allocation < 0)) throw new Error('allocations must be non-negative')
  const names = new Set(variants.map(v => v.name))
  if (names.size !== variants.length) throw new Error('variant names must be unique')
}

/**
 * Deterministically assign a user to a variant by cumulative allocation.
 * Same (userId, experiment.key) → same variant, always.
 */
export function assignVariant(experiment: Experiment, userId: string): ExperimentVariant {
  const u = hashToUnit(`${userId}:${experiment.key}`)
  let cumulative = 0
  for (const variant of experiment.variants) {
    cumulative += variant.allocation
    if (u < cumulative) return variant
  }
  // FP tail — fall back to the last variant.
  return experiment.variants[experiment.variants.length - 1]
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export async function createExperiment(input: CreateExperimentInput): Promise<Experiment> {
  validateVariants(input.variants)
  const db = await getDb()
  const now = new Date()
  const experiment: Experiment = {
    key: input.key,
    name: input.name,
    description: input.description,
    variants: input.variants,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COLLECTIONS.abExperiments).insertOne({ ...experiment })
  return experiment
}

export async function getExperiment(key: string): Promise<Experiment | null> {
  const db = await getDb()
  return (await db.collection(COLLECTIONS.abExperiments).findOne({ key })) as unknown as Experiment | null
}

export async function listExperiments(opts: { activeOnly?: boolean } = {}): Promise<Experiment[]> {
  const db = await getDb()
  const filter = opts.activeOnly ? { active: true } : {}
  const docs = await db.collection(COLLECTIONS.abExperiments).find(filter).sort({ createdAt: -1 }).toArray()
  return docs as unknown as Experiment[]
}

export async function setExperimentActive(key: string, active: boolean): Promise<boolean> {
  const db = await getDb()
  const res = await db
    .collection(COLLECTIONS.abExperiments)
    .updateOne({ key }, { $set: { active, updatedAt: new Date() } })
  return res.matchedCount > 0
}

// ─── Exposure / conversion metering ───────────────────────────────────────────

async function bumpCounter(experimentKey: string, variant: string, field: 'exposures' | 'conversions'): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.abExposures).updateOne(
    { experimentKey, variant },
    { $inc: { [field]: 1 }, $setOnInsert: { experimentKey, variant } },
    { upsert: true },
  )
}

export async function recordExposure(experimentKey: string, variant: string): Promise<void> {
  await bumpCounter(experimentKey, variant, 'exposures')
}

export async function recordConversion(experimentKey: string, variant: string): Promise<void> {
  await bumpCounter(experimentKey, variant, 'conversions')
}

/**
 * Resolve the active experiment, assign the user, record an exposure, and return
 * the chosen variant. Returns null when the experiment is missing or inactive —
 * callers then use their default behaviour.
 */
export async function assignAndExpose(
  experimentKey: string,
  userId: string,
): Promise<ExperimentVariant | null> {
  const experiment = await getExperiment(experimentKey)
  if (!experiment || !experiment.active) return null
  const variant = assignVariant(experiment, userId)
  try {
    await recordExposure(experimentKey, variant.name)
  } catch (err) {
    logger.warn('[experiments] exposure record failed', { experimentKey, err: String(err) })
  }
  return variant
}

/** Per-variant results with conversion rates. */
export async function experimentResults(experimentKey: string): Promise<VariantResult[]> {
  const db = await getDb()
  const rows = (await db
    .collection(COLLECTIONS.abExposures)
    .find({ experimentKey })
    .toArray()) as unknown as Array<{ variant: string; exposures?: number; conversions?: number }>
  return rows.map(r => {
    const exposures = r.exposures ?? 0
    const conversions = r.conversions ?? 0
    return {
      variant: r.variant,
      exposures,
      conversions,
      conversionRate: exposures > 0 ? Number((conversions / exposures).toFixed(4)) : 0,
    }
  })
}
