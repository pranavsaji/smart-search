import { redis, RedisKeys } from '@/lib/cache/redis'
import { emitStageEvent } from './emitter'

export type SSEEventType =
  | 'row_update'
  | 'lock_update'
  | 'participant_joined'
  | 'participant_left'
  | 'stage_ready'
  | 'checkout_update'
  | 'confirmation'
  | 'gift_notification'
  | 'offer_expired'
  | 'genie_update'
  | 'order_update'    // Phase 7 — vendor order status change
  | 'wallet_credited' // Phase 10 — wallet balance changed
  | 'split_request'   // Phase 10 — split payment requested
  | 'split_settled'   // Phase 10 — split payment settled
  | 'agent_task_update' // Phase 11 — long-running task progress/terminal state
  | 'price_alert'     // Phase 11 — watchlist price drop hit target
  | 'life_event'      // Phase 11 — life event detected
  | 'insight_ready'   // Phase 12 — weekly insight report generated
  | 'error'

export interface SSEEvent {
  id: string
  type: SSEEventType
  data: unknown
  timestamp: number
}

export async function broadcastToStage(
  stageId: string,
  type: SSEEventType,
  data: unknown
): Promise<void> {
  const event: SSEEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    data,
    timestamp: Date.now(),
  }

  // In-process fan-out — zero latency, no Redis needed.
  // Delivers to all SSE connections on this Node.js process instance.
  emitStageEvent(stageId, event)

  // Redis persistence for Last-Event-ID replay on reconnect.
  // Silently dropped on quota exhaustion or network failure — live delivery above still works.
  try {
    const eventsKey = RedisKeys.stageEvents(stageId)
    await redis.zadd(eventsKey, { score: event.timestamp, member: JSON.stringify(event) })
    await redis.expire(eventsKey, 3600)
    await redis.zremrangebyrank(eventsKey, 0, -101)
  } catch { /* Redis unavailable/quota exceeded — replay degraded, live delivery unaffected */ }
}

export async function getEventsSince(stageId: string, since: number): Promise<SSEEvent[]> {
  try {
    const raw = await redis.zrange<unknown[]>(
      RedisKeys.stageEvents(stageId),
      since + 1,
      '+inf',
      { byScore: true }
    )
    return (raw ?? []).map((r: unknown) => {
      if (typeof r === 'object' && r !== null) return r as SSEEvent
      if (typeof r === 'string') return JSON.parse(r) as SSEEvent
      return null
    }).filter((e): e is SSEEvent => e !== null)
  } catch {
    // Redis unavailable or quota exceeded — return empty, live delivery via emitter is unaffected
    return []
  }
}

export function formatSSE(event: SSEEvent): string {
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event.data)}`,
    '',
    '',
  ].join('\n')
}
