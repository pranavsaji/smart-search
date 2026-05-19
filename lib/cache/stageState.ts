import { redis, RedisKeys } from './redis'
import type { ServiceResult } from '@/lib/services/types'

export interface StageState {
  stageId: string
  results: Record<string, ServiceResult>   // keyed by ActivityType
  assembledAt: Date
  status: 'assembling' | 'ready' | 'error'
}

// Results are stored per-field in a Redis hash to avoid read-modify-write races
// when multiple adapters write concurrently. Hash field = serviceType, value = JSON.
const resultsHashKey = RedisKeys.stageResults
const META_KEY_TTL = 7200

export async function getStageState(stageId: string): Promise<StageState | null> {
  const meta = await redis.get<Omit<StageState, 'results'>>(RedisKeys.stageState(stageId))
  if (!meta) return null
  // Collect per-service results from the hash
  const raw = await redis.hgetall(resultsHashKey(stageId)) as Record<string, unknown> | null
  const results: Record<string, ServiceResult> = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'string') results[k] = JSON.parse(v) as ServiceResult
    else if (v && typeof v === 'object') results[k] = v as ServiceResult
  }
  return { ...meta, results }
}

export async function setStageState(state: StageState): Promise<void> {
  const { results, ...meta } = state
  await redis.setex(RedisKeys.stageState(state.stageId), META_KEY_TTL, JSON.stringify(meta))
  const hashKey = resultsHashKey(state.stageId)
  for (const [k, v] of Object.entries(results)) {
    await redis.hset(hashKey, { [k]: JSON.stringify(v) })
  }
  await redis.expire(hashKey, META_KEY_TTL)
}

export async function updateStageResult(
  stageId: string,
  serviceType: string,
  result: ServiceResult
): Promise<void> {
  // Atomic per-field write — no read-modify-write race when adapters run in parallel
  const hashKey = resultsHashKey(stageId)
  await redis.hset(hashKey, { [serviceType]: JSON.stringify(result) })
  await redis.expire(hashKey, META_KEY_TTL)

  // Ensure the meta record exists (idempotent — first writer wins on assembledAt)
  const existing = await redis.get(RedisKeys.stageState(stageId))
  if (!existing) {
    await redis.setex(RedisKeys.stageState(stageId), META_KEY_TTL, JSON.stringify({
      stageId,
      assembledAt: new Date(),
      status: 'assembling',
    }))
  }
}
