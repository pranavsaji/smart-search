// Phase 11.2 — Negotiation Agent.
//
// Genie negotiates price with a vendor on the user's behalf, within a hard
// budget cap. Two invariants are enforced architecturally:
//
//   1. The agent NEVER offers or agrees to a price above `maxBudgetCents`.
//   2. Every offer (agent and vendor) is recorded in an append-only audit log
//      shown to the user before they accept.
//
// The vendor transport is pluggable (`VendorNegotiator`). The default is a
// deterministic mock that concedes toward the agent; production wires the
// ecosystem `/negotiate` endpoint via lib/ecosystem/proxy.ts.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'
import type {
  NegotiationSession,
  NegotiationOffer,
  NegotiationStatus,
  VendorNegotiator,
  VendorNegotiationReply,
} from './types'

export type {
  NegotiationSession,
  NegotiationOffer,
  NegotiationStatus,
  VendorNegotiator,
}

const DEFAULT_MAX_ROUNDS = 5

export interface CreateNegotiationInput {
  userId: string
  vendorId: string
  vendorType: string
  itemRef: string
  currency: string
  listPriceCents: number
  maxBudgetCents: number
  targetPriceCents?: number     // defaults to 85% of budget
  maxRounds?: number
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

// ─── Session construction ───────────────────────────────────────────────────

export function buildSession(input: CreateNegotiationInput): NegotiationSession {
  if (input.maxBudgetCents <= 0) throw new BudgetError('maxBudgetCents must be positive')
  if (input.listPriceCents <= 0) throw new BudgetError('listPriceCents must be positive')

  // Target defaults to 85% of budget, but never above budget.
  const target = Math.min(
    input.targetPriceCents ?? Math.floor(input.maxBudgetCents * 0.85),
    input.maxBudgetCents,
  )
  const now = new Date()

  return {
    negotiationId: `neg_${nanoid(16)}`,
    userId: input.userId,
    vendorId: input.vendorId,
    vendorType: input.vendorType,
    itemRef: input.itemRef,
    currency: input.currency,
    listPriceCents: input.listPriceCents,
    maxBudgetCents: input.maxBudgetCents,
    targetPriceCents: target,
    maxRounds: input.maxRounds ?? DEFAULT_MAX_ROUNDS,
    status: 'in_progress',
    offers: [],
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Concession schedule ────────────────────────────────────────────────────
// The agent opens low (80% of target) and concedes linearly toward the budget
// ceiling across rounds — but the offer is HARD-CLAMPED to maxBudgetCents.

export function agentOfferForRound(session: NegotiationSession, round: number): number {
  const opening = Math.floor(session.targetPriceCents * 0.8)
  const ceiling = session.maxBudgetCents
  const span = Math.max(0, ceiling - opening)
  const frac = session.maxRounds <= 1 ? 1 : (round - 1) / (session.maxRounds - 1)
  const offer = Math.round(opening + span * frac)
  return Math.min(offer, ceiling) // never exceed budget — enforced
}

// ─── Pure negotiation loop ──────────────────────────────────────────────────
// Deterministic given the negotiator. Mutates a copy of the session and returns
// it; no I/O. The DB wrapper persists the result.

export async function negotiate(
  session: NegotiationSession,
  negotiator: VendorNegotiator,
): Promise<NegotiationSession> {
  const s: NegotiationSession = { ...session, offers: [...session.offers] }
  const now = () => new Date()

  for (let round = 1; round <= s.maxRounds; round++) {
    const agentOffer = agentOfferForRound(s, round)

    // Invariant guard — defensive; agentOfferForRound already clamps.
    if (agentOffer > s.maxBudgetCents) {
      throw new BudgetError(`Agent offer ${agentOffer} exceeds budget ${s.maxBudgetCents}`)
    }

    s.offers.push({ round, party: 'agent', priceCents: agentOffer, at: now() })

    let reply: VendorNegotiationReply
    try {
      reply = await negotiator.negotiate(s, agentOffer)
    } catch (err) {
      logger.error('[negotiation] vendor transport error', err, { negotiationId: s.negotiationId })
      s.status = 'failed'
      s.updatedAt = now()
      return s
    }

    if (reply.accept) {
      // Vendor accepts our offer — guaranteed ≤ budget.
      s.agreedPriceCents = agentOffer
      s.status = 'accepted'
      s.offers.push({ round, party: 'vendor', priceCents: agentOffer, message: reply.message ?? 'accepted', at: now() })
      s.updatedAt = now()
      return s
    }

    const counter = reply.counterPriceCents ?? s.listPriceCents
    s.offers.push({ round, party: 'vendor', priceCents: counter, message: reply.message, at: now() })

    // Accept the vendor counter if it lands within budget AND at/under our
    // willingness for this round (we don't overpay early).
    if (counter <= s.maxBudgetCents && counter <= agentOffer) {
      s.agreedPriceCents = counter
      s.status = 'accepted'
      s.updatedAt = now()
      return s
    }

    // Last round: take the counter only if it fits the budget.
    if (round === s.maxRounds && counter <= s.maxBudgetCents) {
      s.agreedPriceCents = counter
      s.status = 'accepted'
      s.updatedAt = now()
      return s
    }
  }

  // Rounds exhausted without agreement within budget.
  s.status = 'rejected'
  s.updatedAt = now()
  return s
}

// ─── Default mock vendor ────────────────────────────────────────────────────
// Vendor has a floor (won't sell below floorRatio × list). It accepts any agent
// offer ≥ floor; otherwise it concedes halfway between its last price and the
// agent's offer, never below floor.

export class MockVendorNegotiator implements VendorNegotiator {
  constructor(private floorRatio = 0.65) {}

  async negotiate(
    session: NegotiationSession,
    agentOfferCents: number,
  ): Promise<VendorNegotiationReply> {
    const floor = Math.round(session.listPriceCents * this.floorRatio)
    if (agentOfferCents >= floor) {
      return { accept: true, message: 'Deal — we can do that.' }
    }
    const lastVendor =
      [...session.offers].reverse().find(o => o.party === 'vendor')?.priceCents ??
      session.listPriceCents
    const counter = Math.max(floor, Math.round((lastVendor + agentOfferCents) / 2))
    return { accept: false, counterPriceCents: counter, message: `Best we can do is ${counter}.` }
  }
}

// ─── DB-backed orchestration ────────────────────────────────────────────────

export async function createAndRunNegotiation(
  input: CreateNegotiationInput,
  negotiator: VendorNegotiator = new MockVendorNegotiator(),
): Promise<NegotiationSession> {
  const session = buildSession(input)
  const completed = await negotiate(session, negotiator)

  const db = await getDb()
  await db.collection(COLLECTIONS.negotiations).insertOne({ ...completed })
  return completed
}

export async function getNegotiation(negotiationId: string): Promise<NegotiationSession | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.negotiations).findOne({ negotiationId })
  return doc as unknown as NegotiationSession | null
}

export async function getUserNegotiations(
  userId: string,
  limit = 50,
): Promise<NegotiationSession[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.negotiations)
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return docs as unknown as NegotiationSession[]
}
