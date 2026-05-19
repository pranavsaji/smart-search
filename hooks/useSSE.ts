'use client'
import { useEffect, useRef, useCallback } from 'react'
import type { SSEEventType } from '@/lib/sse/broadcast'
import { useStageStore } from '@/stores/stageStore'
import { useCartStore } from '@/stores/cartStore'
import { useParticipantStore } from '@/stores/participantStore'
import { rankCards } from '@/lib/ranking/ranker'
import type { MergedStageContext, ActivityType } from '@/lib/intent/types'
import type { ServiceResult } from '@/lib/services/types'
import type { ScoredCard } from '@/lib/ranking/types'
import { SSE_BACKOFF_MS } from '@/lib/config/constants'

export interface GenieUpdate {
  serviceType: string
  cardId: string
  genieStatus: 'searching' | 'confirmed' | 'failed'
  message: string
  slot?: string
  nextStep?: string
  confirmationCode?: string
  deepLinkUrl?: string
}

interface SSEHookOptions {
  stageId: string
  stageContext?: MergedStageContext
  onConfirmation?: (data: unknown) => void
  onGenieUpdate?: (update: GenieUpdate) => void
}

const BACKOFF = SSE_BACKOFF_MS

export function useSSE({ stageId, stageContext, onConfirmation, onGenieUpdate }: SSEHookOptions) {
  const esRef = useRef<EventSource | null>(null)
  const retryRef = useRef(0)
  const lastEventIdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  const { setRowResult, setReady } = useStageStore()
  const { addItem, removeItem, items: cartItems } = useCartStore()
  const { addParticipant } = useParticipantStore()

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const url = new URL(`/api/stage/sse`, window.location.origin)
    url.searchParams.set('stageId', stageId)
    if (lastEventIdRef.current) url.searchParams.set('lastEventId', lastEventIdRef.current)

    const es = new EventSource(url.toString())
    esRef.current = es

    es.onopen = () => {
      retryRef.current = 0
    }

    es.addEventListener('row_update', (e: MessageEvent) => {
      const { serviceType, result } = JSON.parse(e.data) as { serviceType: string; result: ServiceResult }
      const ranked = stageContext ? rankCards(result.cards, stageContext) : result.cards.map(c => ({ ...c, scores: { intentFit: 0.5, userFit: 0.5, outcomeHistory: 0.5, bid: 0, final: 0.5 }, passedGate: true })) as ScoredCard[]
      setRowResult(serviceType as ActivityType, result, ranked)
      if (e.lastEventId) lastEventIdRef.current = e.lastEventId
    })

    es.addEventListener('stage_ready', (e: MessageEvent) => {
      try {
        // Hydrate all rows from cached state if assembly already completed
        const data = JSON.parse(e.data)
        if (data?.results && typeof data.results === 'object') {
          Object.entries(data.results).forEach(([type, result]) => {
            const r = result as ServiceResult
            const ranked = stageContext ? rankCards(r.cards, stageContext) : r.cards.map(c => ({ ...c, scores: { intentFit: 0.5, userFit: 0.5, outcomeHistory: 0.5, bid: 0, final: 0.5 }, passedGate: true })) as ScoredCard[]
            setRowResult(type as ActivityType, r, ranked)
          })
        }
      } catch { /* no state payload — that's fine */ }
      setReady()
    })

    es.addEventListener('lock_update', (e: MessageEvent) => {
      const { item } = JSON.parse(e.data)
      addItem(item)
      if (e.lastEventId) lastEventIdRef.current = e.lastEventId
    })

    es.addEventListener('participant_joined', (e: MessageEvent) => {
      addParticipant(JSON.parse(e.data))
    })

    es.addEventListener('confirmation', (e: MessageEvent) => {
      onConfirmation?.(JSON.parse(e.data))
    })

    es.addEventListener('offer_expired', (e: MessageEvent) => {
      const { cardId } = JSON.parse(e.data) as { cardId: string }
      // Find the cartItem whose service card matches the expired cardId and evict it.
      const expired = cartItems.find(i => i.cardId === cardId)
      if (expired) removeItem(expired.id)
    })

    es.addEventListener('genie_update', (e: MessageEvent) => {
      onGenieUpdate?.(JSON.parse(e.data) as GenieUpdate)
    })

    es.onerror = () => {
      es.close()
      if (!mountedRef.current) return
      const delay = BACKOFF[Math.min(retryRef.current, BACKOFF.length - 1)]
      retryRef.current++
      setTimeout(connect, delay)
    }
  }, [stageId, stageContext, setRowResult, addItem, removeItem, cartItems, addParticipant, setReady, onConfirmation, onGenieUpdate])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      esRef.current?.close()
    }
  }, [connect])
}
