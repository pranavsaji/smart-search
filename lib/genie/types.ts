import type { ScoredCard } from '@/lib/ranking/types'
import type { IntentGraph } from '@/lib/intent/types'

export interface GenieBookInput {
  stageId: string
  card: ScoredCard
  userId: string
  userEmail: string
  userName: string
  intentGraph: IntentGraph
}

export interface GenieResult {
  confirmed: boolean
  confirmationCode?: string
  deepLinkUrl?: string
  slot?: string
  errorMessage?: string
}

// Typed payload used in Claude's confirm_booking tool response
export interface GenieBookingResult {
  success: boolean
  confirmationCode?: string
  deepLinkUrl?: string
  slot?: string
  error?: string
}

// Typed payload used in Claude's check_availability tool response
export interface GenieAvailabilityResult {
  available: boolean
  confirmedSlot?: string
  allSlots: string[]
}
