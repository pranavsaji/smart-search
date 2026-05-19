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

  setStageId: (id) => set({ stageId: id, rows: defaultRows(), isAssembling: true, isReady: false }),

  setRowLoading: (type) =>
    set(s => ({ rows: { ...s.rows, [type]: { ...s.rows[type], isLoading: true } } })),

  setRowResult: (type, result, ranked) =>
    set(s => ({ rows: { ...s.rows, [type]: { result, rankedCards: ranked, isLoading: false } } })),

  setRowError: (type, error) =>
    set(s => ({ rows: { ...s.rows, [type]: { ...s.rows[type], isLoading: false, error } } })),

  setReady: () => set({ isAssembling: false, isReady: true }),

  reset: () => set({ stageId: null, rows: defaultRows(), isAssembling: false, isReady: false }),
}))
