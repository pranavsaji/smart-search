'use client'
import { create } from 'zustand'
import type { ServiceResult } from '@/lib/services/types'
import type { ScoredCard } from '@/lib/ranking/types'
import type { ActivityType } from '@/lib/intent/types'

interface ServiceRowState {
  result: ServiceResult | null
  rankedCards: ScoredCard[]
  isLoading: boolean
  error?: string
}

interface StageStore {
  stageId: string | null
  rows: Record<ActivityType, ServiceRowState>
  isAssembling: boolean
  isReady: boolean

  setStageId: (id: string) => void
  setRowLoading: (type: ActivityType) => void
  setRowResult: (type: ActivityType, result: ServiceResult, ranked: ScoredCard[]) => void
  setRowError: (type: ActivityType, error: string) => void
  setReady: () => void
  reset: () => void
}

const defaultRow = (): ServiceRowState => ({ result: null, rankedCards: [], isLoading: true })

const defaultRows = (): Record<ActivityType, ServiceRowState> => ({
  flights: defaultRow(), stays: defaultRow(), cars: defaultRow(),
  experiences: defaultRow(), restaurants: defaultRow(),
  weather: defaultRow(), maps: defaultRow(),
  products: defaultRow(),
  digital_services: defaultRow(), home_services: defaultRow(),
  health_services: defaultRow(), appointments: defaultRow(),
})

export const useStageStore = create<StageStore>(set => ({
  stageId: null,
  rows: defaultRows(),
  isAssembling: false,
  isReady: false,

  // Idempotent: re-running with the same id (RSC re-render, StrictMode remount)
  // must NOT wipe rows — SSE delivers each event once per connection, so results
  // cleared here would never be re-sent and rows would spin forever.
  setStageId: (id) =>
    set(s => s.stageId === id ? s : { stageId: id, rows: defaultRows(), isAssembling: true, isReady: false }),

  setRowLoading: (type) =>
    set(s => ({ rows: { ...s.rows, [type]: { ...s.rows[type], isLoading: true } } })),

  setRowResult: (type, result, ranked) =>
    set(s => {
      // Multiple adapters can share a type (retail + marketplace both emit
      // 'products'). Replace only cards from the same source (vendorType),
      // keep the other adapter's cards instead of clobbering the whole row.
      const prev = s.rows[type]
      if (prev?.result && prev.result.cards.length > 0 && result.cards.length > 0) {
        const incomingSources = new Set(result.cards.map(c => c.vendorType))
        const keptCards = prev.result.cards.filter(c => !incomingSources.has(c.vendorType))
        if (keptCards.length > 0) {
          const keptRanked = prev.rankedCards.filter(c => !incomingSources.has(c.vendorType))
          result = { ...result, cards: [...keptCards, ...result.cards] }
          ranked = [...keptRanked, ...ranked].sort((a, b) => b.scores.final - a.scores.final)
        }
      }
      // Live data supersedes demo fallbacks: once any live card is in the row,
      // drop mock/demo cards instead of mixing them with real results.
      if (result.cards.some(c => !c.isDemoData) && result.cards.some(c => c.isDemoData)) {
        result = { ...result, cards: result.cards.filter(c => !c.isDemoData) }
        ranked = ranked.filter(c => !c.isDemoData)
      }
      return { rows: { ...s.rows, [type]: { result, rankedCards: ranked, isLoading: false } } }
    }),

  setRowError: (type, error) =>
    set(s => ({ rows: { ...s.rows, [type]: { ...s.rows[type], isLoading: false, error } } })),

  setReady: () => set({ isAssembling: false, isReady: true }),

  reset: () => set({ stageId: null, rows: defaultRows(), isAssembling: false, isReady: false }),
}))
