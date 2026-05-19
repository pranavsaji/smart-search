// SHARED CONTRACT — frozen after Day 2. Changes require PR with Maaz + Nekha review.

export type BudgetSignal = 'budget' | 'mid-range' | 'premium' | 'unspecified'

export type ActivityType =
  // Travel
  | 'flights'
  | 'stays'
  | 'cars'
  | 'experiences'
  | 'restaurants'
  | 'weather'
  | 'maps'
  // Commerce
  | 'products'
  // Services (Genie-bookable)
  | 'digital_services'
  | 'home_services'
  | 'health_services'
  | 'appointments'

export type TravelStyle = 'solo' | 'couple' | 'group' | 'unspecified'

export interface DateRange {
  start: string           // ISO date string "2025-06-15"
  end: string
  flexibilityDays?: number // 0 = exact, >0 = ±flex window
}

export interface ParsedIntent {
  destination: string           // city/region for travel; service area for local services; "UNKNOWN" for digital/shopping
  origin?: string               // flights only
  dates: DateRange
  participants: Participant[]
  groupSize: number
  activityTypes: ActivityType[]
  budgetSignal: BudgetSignal
  constraints?: string[]        // ["vegetarian", "wheelchair accessible", "same-day delivery"]
  genieServices?: ActivityType[] // subset of activityTypes where Genie should auto-book
  rawPrompt: string
  confidence: number            // 0-1, how confident the parser is
  summary?: string              // short label: "Flight to Tokyo"
  originCity?: string | null
  companions?: string[]
  clarificationNeeded?: boolean
  clarificationMessage?: string | null
  services?: ServiceIntent[]    // per-service params + missingParams
  _phaseA?: PhaseAResult        // debug metadata
}

export interface Participant {
  handle: string                // "@gilson"
  userId: string | null         // null = not yet on platform
  intentGraph: IntentGraph | null
  inviteToken?: string          // set when userId is null
}

export interface WeightedSignal {
  value: string
  weight: number                // booking=1.0, lock=0.4, browse=0.1
  recencyScore: number          // decays over time
  lastSeen: Date
}

export interface SeasonalPattern {
  monthIndex: number            // 0-11
  destination?: string
  activityTypes: ActivityType[]
  count: number
}

export interface OutcomeEvent {
  stageId: string
  activityType: ActivityType
  vendorId: string
  destination: string
  budgetSignal: BudgetSignal
  completedAt: Date
  weight: number                // 1.0 for booking, 0.4 for lock, 0.1 for browse
}

export interface IntentGraph {
  userId: string
  destinations: WeightedSignal[]
  spendingSignal: BudgetSignal
  activityPreferences: Record<ActivityType, number>  // 0-1
  travelStyle: TravelStyle
  seasonalPatterns: SeasonalPattern[]
  outcomeHistory: OutcomeEvent[]
  documentContext?: string      // raw extracted text from uploaded document
  styleProfile?: {
    style: string
    taste: string
    vibes: string
    budget: string
    sizes: string
    visibility: {
      style: boolean; taste: boolean; vibes: boolean; budget: boolean; sizes: boolean
    }
    updatedAt: Date
  }
  isStyleProfilePublic?: boolean
  skipStyleQuestionnaire?: boolean
  updatedAt: Date
}

export interface MergedStageContext {
  stageId: string
  participants: Participant[]
  sharedIntent: ParsedIntent
  mergedGraph: IntentGraph      // averaged/merged across all participants
}

export interface ServiceIntent {
  id: string
  isRequested: boolean
  params: Record<string, unknown>
  missingParams: string[]
}

export interface PhaseAResult {
  summary: string
  services: string[]
  extracted: {
    destination?: string | null
    originCity?: string | null
    departureDate?: string | null
    destination_stage?: string | null
    brand?: string | null
    collaborator?: string | null
  }
}

export interface SearchContext {
  intent: ParsedIntent
  graph: IntentGraph
  stageId: string
}
