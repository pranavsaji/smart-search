import type { ServiceResult } from '@/lib/services/types'

// In-process cache of assembled stage results.
// Populated by assembleStage() so SSE connections can hydrate even when Redis is unavailable.
// TTL-evicted after 2h to match Redis TTL. Max 50 stages to bound memory usage.

interface CachedStage {
  results: Record<string, ServiceResult>
  assembledAt: number
}

const TTL_MS = 2 * 60 * 60 * 1000   // 2h
const MAX_ENTRIES = 50

const cache = new Map<string, CachedStage>()

export function setInProcessStageResults(
  stageId: string,
  results: Record<string, ServiceResult>
): void {
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].assembledAt - b[1].assembledAt)[0]
    if (oldest) cache.delete(oldest[0])
  }
  cache.set(stageId, { results, assembledAt: Date.now() })
}

export function getInProcessStageResults(stageId: string): CachedStage | null {
  const entry = cache.get(stageId)
  if (!entry) return null
  if (Date.now() - entry.assembledAt > TTL_MS) {
    cache.delete(stageId)
    return null
  }
  return entry
}
