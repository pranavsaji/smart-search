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
  // Browsers only send the Last-Event-ID header on automatic EventSource reconnects.
  // Manual reconnects (new EventSource from useSSE) carry it as a query param instead.
  const lastEventId =
    req.headers.get('Last-Event-ID') ?? req.nextUrl.searchParams.get('lastEventId')

  if (!stageId) {
    return new Response('Missing stageId', { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: SSEEvent) => {
        try { controller.enqueue(encoder.encode(formatSSE(event))) } catch { /* client disconnected */ }
      }

      // Deliver each event at most once — events can arrive via both the
      // in-process emitter and the Redis poll below.
      const seenIds = new Set<string>()
      let lastTs = 0
      const deliver = (event: SSEEvent) => {
        if (seenIds.has(event.id)) return
        seenIds.add(event.id)
        if (event.timestamp > lastTs) lastTs = event.timestamp
        enqueue(event)
      }

      const sendComment = (text: string) => {
        try { controller.enqueue(encoder.encode(`: ${text}\n\n`)) } catch { /* client disconnected */ }
      }

      // Send an immediate comment so the HTTP connection is established before any async work.
      // This prevents ERR_EMPTY_RESPONSE when early async calls are slow or fail.
      sendComment('connected')

      // 1. Subscribe to in-process emitter FIRST — before replaying history — so we
      //    don't miss events that fire between the replay read and the subscription.
      //    The emitter only reaches connections in the same module graph (in dev,
      //    each route compiles separately), so the Redis poll below is the
      //    delivery guarantee; the emitter is just a zero-latency fast path.
      const unsubscribe = onStageEvent(stageId, deliver)

      // 2. Replay historical events from Redis (best-effort — quota errors return [])
      const replaySince = lastEventId ? parseInt(lastEventId.split('-')[0], 10) : 0
      lastTs = replaySince
      let hadHistory = false
      try {
        const historicalEvents = await getEventsSince(stageId, replaySince)
        for (const e of historicalEvents) deliver(e)
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

      // 6. Poll Redis for new events — the cross-process/cross-bundle delivery
      //    path (Upstash HTTP has no pub/sub here). `lastTs - 1` re-fetches the
      //    last-seen millisecond so same-ms events aren't skipped; dedupe above.
      let polling = false
      const poll = setInterval(async () => {
        if (polling) return
        polling = true
        try {
          const events = await getEventsSince(stageId, Math.max(0, lastTs - 1))
          for (const e of events) deliver(e)
        } catch { /* Redis unavailable — emitter fast path still works */ }
        finally { polling = false }
      }, 500)

      // 7. Keepalive comment every 25s — prevents proxy/browser timeouts
      const keepAlive = setInterval(() => sendComment('keepalive'), 25000)

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        clearInterval(poll)
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
