import { type NextRequest } from 'next/server'
import { getEventsSince, formatSSE, type SSEEvent } from '@/lib/sse/broadcast'
import { onStageEvent } from '@/lib/sse/emitter'
import { getStageState } from '@/lib/cache/stageState'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { assembleStage } from '@/lib/stage/assembler'
import { buildMergedContext } from '@/lib/stage/merge'
import { logger } from '@/lib/logger'
import { getInProcessStageResults } from '@/lib/stage/resultsCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Per-process deduplication — prevents concurrent SSE connects from double-assembling.
const reassemblyInFlight = new Set<string>()

export async function GET(req: NextRequest) {
  const stageId = req.nextUrl.searchParams.get('stageId')
  const lastEventId = req.headers.get('Last-Event-ID')

  if (!stageId) {
    return new Response('Missing stageId', { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: SSEEvent) => {
        try { controller.enqueue(encoder.encode(formatSSE(event))) } catch { /* client disconnected */ }
      }

      const sendComment = (text: string) => {
        try { controller.enqueue(encoder.encode(`: ${text}\n\n`)) } catch { /* client disconnected */ }
      }

      // Send an immediate comment so the HTTP connection is established before any async work.
      // This prevents ERR_EMPTY_RESPONSE when early async calls are slow or fail.
      sendComment('connected')

      // 1. Subscribe to in-process emitter FIRST — before replaying history — so we
      //    don't miss events that fire between the replay read and the subscription.
      const unsubscribe = onStageEvent(stageId, enqueue)

      // 2. Replay historical events from Redis (best-effort — quota errors return [])
      const replaySince = lastEventId ? parseInt(lastEventId.split('-')[0], 10) : 0
      let hadHistory = false
      try {
        const historicalEvents = await getEventsSince(stageId, replaySince)
        for (const e of historicalEvents) enqueue(e)
        hadHistory = historicalEvents.length > 0
      } catch { /* already handled inside getEventsSince, but belt-and-suspenders */ }

      // 3. If no Redis history, try in-process results cache (populated by assembleStage)
      if (!hadHistory) {
        const cached = getInProcessStageResults(stageId)
        if (cached) {
          enqueue({
            id: `${Date.now()}-hydrate`,
            type: 'stage_ready',
            data: cached,
            timestamp: Date.now(),
          })
          hadHistory = true
        }
      }

      // 4. If still no history, try Redis stage state (cached after assembly completes)
      if (!hadHistory) {
        try {
          const currentState = await getStageState(stageId)
          if (currentState) {
            enqueue({
              id: `${Date.now()}-hydrate`,
              type: 'stage_ready',
              data: currentState,
              timestamp: Date.now(),
            })
            hadHistory = true
          }
        } catch { /* Redis unavailable — skip */ }
      }

      // 5. No state anywhere → Redis TTL expired or assembly hasn't run yet.
      //    Re-trigger assembly from the MongoDB stage document.
      if (!hadHistory && !reassemblyInFlight.has(stageId)) {
        reassemblyInFlight.add(stageId)
        getDb()
          .then(async db => {
            const stage = await db.collection(COLLECTIONS.stages).findOne({ stageId })
            if (!stage) return
            const parsedIntent = JSON.parse(JSON.stringify(stage.parsedIntent))
            const ctx = buildMergedContext(stageId, stage.participants ?? [], parsedIntent)
            logger.info('[sse] re-triggering assembly', { stageId })
            return assembleStage(ctx)
          })
          .catch(err => logger.error('[sse] re-assembly failed', err, { stageId }))
          .finally(() => reassemblyInFlight.delete(stageId))
      }

      // 6. Keepalive comment every 25s — prevents proxy/browser timeouts
      const keepAlive = setInterval(() => sendComment('keepalive'), 25000)

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
