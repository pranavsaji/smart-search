// Phase 11 — AI Agents & Autonomous Operations
// Shared types for long-running tasks, negotiation, watchlist, and life events.

import type { ActivityType } from '@/lib/intent/types'

// ─── 11.1 Long-Running Agent Tasks ──────────────────────────────────────────

/** A task "kind" maps 1:1 to a registered TaskExecutor (mirrors ServiceAdapter). */
export type AgentTaskKind =
  | 'find_cheapest'      // search repeatedly, surface the best price found
  | 'book_when_available' // poll availability, auto-book first qualifying slot/offer
  | 'watch_price'        // bridge a task to a watchlist item (price alert)
  | 'custom'             // developer/ecosystem-supplied executor

export type AgentTaskStatus =
  | 'pending'        // created, not yet run
  | 'running'        // a runner is actively executing (lock held)
  | 'awaiting_user'  // blocked on user input/confirmation
  | 'succeeded'      // goal met — terminal
  | 'failed'         // exhausted retries / hard error — terminal
  | 'cancelled'      // user-cancelled — terminal

export const TERMINAL_TASK_STATUSES: readonly AgentTaskStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
]

export function isTerminalStatus(status: AgentTaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status)
}

/** One executor iteration's audit entry. Append-only — never mutated. */
export interface TaskStep {
  stepNumber: number
  at: Date
  action: string                       // human-readable, e.g. "Searched flights LON→TYO"
  outcome: 'ok' | 'no_match' | 'error' | 'booked' | 'escalated'
  detail?: string
  data?: Record<string, unknown>       // structured payload (price found, offerId, etc.)
}

/** Bounded, validated constraints. Money is always minor units (cents). */
export interface TaskConstraints {
  serviceType?: ActivityType
  maxPriceCents?: number               // never spend above this (hard cap for autonomous booking)
  currency?: string
  destination?: string
  origin?: string
  earliestDate?: string                // ISO date
  latestDate?: string                  // ISO date
  /** Free-form params handed verbatim to the executor's price/search lookup. */
  query?: Record<string, unknown>
}

export interface AgentTask {
  taskId: string
  userId: string
  kind: AgentTaskKind
  goal: string                         // natural-language goal as stated by the user
  constraints: TaskConstraints
  status: AgentTaskStatus
  steps: TaskStep[]
  attempts: number                     // total executor invocations
  maxAttempts: number                  // give up (failed) after this many
  pollIntervalMinutes: number          // cadence between runs while non-terminal
  scheduledAt: Date                    // earliest time the first run may happen
  nextRunAt: Date                      // when the runner should next pick this up
  lastRunAt?: Date
  result?: Record<string, unknown>     // final structured output on success
  failureReason?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateAgentTaskInput {
  userId: string
  kind: AgentTaskKind
  goal: string
  constraints?: TaskConstraints
  maxAttempts?: number
  pollIntervalMinutes?: number
  scheduledAt?: Date
}

/** What an executor returns after one iteration. */
export interface TaskExecutionResult {
  status: 'succeeded' | 'failed' | 'retry' | 'awaiting_user'
  step: Omit<TaskStep, 'stepNumber' | 'at'>
  result?: Record<string, unknown>     // set when status === 'succeeded'
  failureReason?: string               // set when status === 'failed'
}

// ─── 11.2 Negotiation Agent ─────────────────────────────────────────────────

export type NegotiationStatus =
  | 'in_progress'
  | 'accepted'      // a price ≤ maxBudgetCents was agreed
  | 'rejected'      // vendor wouldn't come within budget
  | 'expired'
  | 'failed'

export type OfferParty = 'agent' | 'vendor'

export interface NegotiationOffer {
  round: number
  party: OfferParty
  priceCents: number
  message?: string
  at: Date
}

export interface NegotiationSession {
  negotiationId: string
  userId: string
  vendorId: string
  vendorType: string
  itemRef: string                      // offerId / productId / listing being negotiated
  currency: string
  listPriceCents: number               // vendor's opening / list price
  maxBudgetCents: number               // HARD CAP — agent must never agree above this
  targetPriceCents: number             // what the agent aims for (≤ maxBudgetCents)
  maxRounds: number
  status: NegotiationStatus
  offers: NegotiationOffer[]
  agreedPriceCents?: number
  createdAt: Date
  updatedAt: Date
}

/** A vendor's reply to a counter-offer. Returned by VendorNegotiator. */
export interface VendorNegotiationReply {
  accept: boolean                      // vendor accepts the agent's last offer
  counterPriceCents?: number           // vendor's counter (when !accept)
  message?: string
}

/** Pluggable vendor negotiation transport (real ecosystem /negotiate or mock). */
export interface VendorNegotiator {
  negotiate(
    session: NegotiationSession,
    agentOfferCents: number,
  ): Promise<VendorNegotiationReply>
}

// ─── 11.3 Watchlist & Price Alerts ──────────────────────────────────────────

export type WatchItemType = ActivityType

export interface WatchTarget {
  itemType: WatchItemType
  /** Stable identifier for product-style items; optional for search-style items. */
  itemRef?: string
  label: string                        // display name, e.g. "Flight LON→TYO Aug"
  query: Record<string, unknown>       // params used to re-price (search context, sku, etc.)
  currency: string
}

export interface WatchlistItem {
  watchId: string
  userId: string
  target: WatchTarget
  targetPriceCents: number             // alert when current ≤ this
  currentPriceCents?: number           // last observed price
  lowestSeenCents?: number
  pollIntervalMinutes: number          // 60 products, 360 flights, etc.
  active: boolean
  alertSent: boolean                   // true after an alert fires; re-armed when price rises
  lastCheckedAt?: Date
  lastAlertAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreateWatchlistInput {
  userId: string
  target: WatchTarget
  targetPriceCents: number
  pollIntervalMinutes?: number
}

/** Result of polling a single watch item. */
export interface PriceCheckResult {
  watchId: string
  checked: boolean
  priceCents?: number
  alertFired: boolean
  reason?: string
}

// ─── Price provider (shared by tasks + watchlist) ───────────────────────────

export interface PriceQuote {
  priceCents: number
  currency: string
  vendorId: string
  vendorType: string
  label: string
  isBookable: boolean
  bookingPayload?: unknown
  fetchedAt: Date
}

/** Pluggable price lookup. Default impl queries adapters; tests inject fakes. */
export interface PriceProvider {
  lookup(target: WatchTarget): Promise<PriceQuote | null>
}

// ─── 11.4 Life Events Engine ────────────────────────────────────────────────

export type LifeEventType =
  | 'moving_cities'
  | 'new_baby'
  | 'wedding_planning'
  | 'new_job'
  | 'travel_season'

export type LifeEventStatus = 'detected' | 'acknowledged' | 'dismissed' | 'acted'

export interface LifeEventSignal {
  source: string                       // 'booking_history' | 'intent_graph' | 'search'
  description: string
  weight: number                       // 0–1 contribution to confidence
}

export interface LifeEvent {
  eventId: string
  userId: string
  type: LifeEventType
  confidence: number                   // 0–1, sum of signal weights (capped)
  signals: LifeEventSignal[]
  title: string
  body: string
  suggestedIntents: string[]           // pre-fillable intent strings for curated Stages
  status: LifeEventStatus
  detectedAt: Date
  acknowledgedAt?: Date
  updatedAt: Date
}

export interface LifeEventPreferences {
  userId: string
  enabled: boolean                     // master opt-in (default false — privacy by default)
  disabledTypes: LifeEventType[]
  updatedAt: Date
}
