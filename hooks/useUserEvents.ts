'use client'

import { useEffect, useRef } from 'react'
import { SSE_BACKOFF_MS } from '@/lib/config/constants'

// User-scoped SSE events (broadcast to the `user:{userId}` channel by lib/sse/notify.ts).
export type UserEventType =
  | 'order_update'
  | 'wallet_credited'
  | 'split_request'
  | 'split_settled'
  | 'agent_task_update'
  | 'price_alert'
  | 'life_event'
  | 'insight_ready'

const USER_EVENTS: UserEventType[] = [
  'order_update', 'wallet_credited', 'split_request', 'split_settled',
  'agent_task_update', 'price_alert', 'life_event', 'insight_ready',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (data: any) => void
export type UserEventHandlers = Partial<Record<UserEventType, Handler>>

/**
 * Subscribe to the signed-in user's SSE channel (`user:{userId}`) and dispatch
 * typed events to the supplied handlers. Reconnects with backoff. Handlers are
 * held in a ref so passing inline objects doesn't tear down the connection on
 * every render — the EventSource is rebuilt only when `userId` changes.
 */
export function useUserEvents(userId: string | undefined, handlers: UserEventHandlers): void {
  const handlersRef = useRef<UserEventHandlers>(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!userId) return

    let es: EventSource | null = null
    let retry = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let warmup: ReturnType<typeof setTimeout> | null = null
    const seen = new Set<string>()

    const connect = () => {
      if (stopped) return
      es = new EventSource(`/api/stage/sse?stageId=user:${encodeURIComponent(userId)}`)

      // The SSE route replays up to an hour of stored events on every fresh
      // connect. Those are historical, not live — pages already load current
      // state on mount — so suppress the initial replay burst to avoid stale
      // toasts. Genuinely live events arrive after this short window.
      let live = false
      if (warmup) clearTimeout(warmup)
      warmup = setTimeout(() => { live = true }, 1200)

      es.onopen = () => { retry = 0 }

      for (const type of USER_EVENTS) {
        es.addEventListener(type, (e: MessageEvent) => {
          if (!live) return
          if (e.lastEventId) {
            if (seen.has(e.lastEventId)) return
            seen.add(e.lastEventId)
          }
          const fn = handlersRef.current[type]
          if (!fn) return
          try { fn(JSON.parse(e.data)) } catch { /* ignore malformed payloads */ }
        })
      }

      es.onerror = () => {
        es?.close()
        if (stopped) return
        const delay = SSE_BACKOFF_MS[Math.min(retry, SSE_BACKOFF_MS.length - 1)]
        retry++
        timer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      if (warmup) clearTimeout(warmup)
      es?.close()
    }
  }, [userId])
}
