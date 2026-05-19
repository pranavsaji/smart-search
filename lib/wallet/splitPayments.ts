import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { debitWallet } from './wallet'
import { logger } from '@/lib/logger'
import {
  SPLIT_EXPIRY_HOURS,
  type SplitRequest,
  type SplitParticipant,
  type SplitStatus,
} from './types'

export type { SplitRequest, SplitParticipant }

// ─── Create Split Request ──────────────────────────────────────────────────────

export interface CreateSplitInput {
  stageId: string
  requesterId: string
  requesterHandle: string
  totalAmountCents: number
  currency: string
  description: string
  participants: Array<{
    userId: string
    handle: string
    ratioPercent: number
  }>
}

export async function createSplitRequest(input: CreateSplitInput): Promise<SplitRequest> {
  const ratioSum = input.participants.reduce((s, p) => s + p.ratioPercent, 0)
  if (ratioSum !== 100) throw new Error(`INVALID_RATIOS: ratios sum to ${ratioSum}, must be 100`)
  if (input.participants.length < 2) throw new Error('SPLIT_REQUIRES_TWO_PARTICIPANTS')
  if (input.totalAmountCents < 100) throw new Error('SPLIT_MINIMUM_100')

  const now = new Date()
  const expiresAt = new Date(now.getTime() + SPLIT_EXPIRY_HOURS * 3600 * 1000)

  const participants: SplitParticipant[] = input.participants.map(p => ({
    userId: p.userId,
    handle: p.handle,
    amountCents: Math.round(input.totalAmountCents * p.ratioPercent / 100),
    ratioPercent: p.ratioPercent,
    status: 'pending' as const,
  }))

  const split: SplitRequest = {
    splitId: `SPL-${nanoid(10).toUpperCase()}`,
    stageId: input.stageId,
    requesterId: input.requesterId,
    requesterHandle: input.requesterHandle,
    totalAmountCents: input.totalAmountCents,
    currency: input.currency,
    description: input.description,
    participants,
    status: 'pending',
    expiresAt,
    createdAt: now,
    updatedAt: now,
  }

  const db = await getDb()
  await db.collection(COLLECTIONS.splitRequests).insertOne({ _id: new ObjectId(), ...split })

  logger.info('[splits] Split request created', {
    splitId: split.splitId,
    totalAmountCents: split.totalAmountCents,
    participantCount: participants.length,
  })

  return split
}

// ─── Approve and Settle ────────────────────────────────────────────────────────

export type SettlementMethod = 'wallet' | 'card'

export interface ApproveSplitInput {
  splitId: string
  userId: string
  method: SettlementMethod
}

export async function approveAndSettle(input: ApproveSplitInput): Promise<SplitRequest> {
  const db = await getDb()
  const split = await db.collection(COLLECTIONS.splitRequests).findOne({ splitId: input.splitId }) as SplitRequest | null
  if (!split) throw new Error('SPLIT_NOT_FOUND')

  if (split.status === 'expired' || split.status === 'cancelled') throw new Error('SPLIT_NOT_ACTIVE')

  const participant = split.participants.find(p => p.userId === input.userId)
  if (!participant) throw new Error('NOT_A_PARTICIPANT')
  if (participant.status === 'settled') throw new Error('ALREADY_SETTLED')
  if (participant.status === 'declined') throw new Error('ALREADY_DECLINED')

  if (input.method === 'wallet') {
    // Throws INSUFFICIENT_BALANCE if balance is too low
    await debitWallet(input.userId, participant.amountCents, input.splitId, `Split — ${split.description}`)
  }

  const updatedResult = await db.collection(COLLECTIONS.splitRequests).findOneAndUpdate(
    { splitId: input.splitId, 'participants.userId': input.userId },
    {
      $set: {
        'participants.$.status': 'settled',
        'participants.$.settledAt': new Date(),
        'participants.$.paymentMethod': input.method,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  )
  if (!updatedResult) throw new Error('SPLIT_UPDATE_FAILED')

  const updated = updatedResult as unknown as SplitRequest
  const newStatus = computeSplitStatus(updated.participants)

  if (newStatus !== updated.status) {
    await db.collection(COLLECTIONS.splitRequests).updateOne(
      { splitId: input.splitId },
      { $set: { status: newStatus, updatedAt: new Date() } }
    )
    updated.status = newStatus
  }

  logger.info('[splits] Participant settled', { splitId: input.splitId, userId: input.userId, method: input.method })
  return updated
}

// ─── Decline Split ─────────────────────────────────────────────────────────────

export async function declineSplit(splitId: string, userId: string): Promise<SplitRequest> {
  const db = await getDb()
  const split = await db.collection(COLLECTIONS.splitRequests).findOne({ splitId }) as SplitRequest | null
  if (!split) throw new Error('SPLIT_NOT_FOUND')

  const participant = split.participants.find(p => p.userId === userId)
  if (!participant) throw new Error('NOT_A_PARTICIPANT')

  const result = await db.collection(COLLECTIONS.splitRequests).findOneAndUpdate(
    { splitId, 'participants.userId': userId },
    { $set: { 'participants.$.status': 'declined', updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  return result as unknown as SplitRequest
}

// ─── Cancel Split ──────────────────────────────────────────────────────────────

export async function cancelSplit(splitId: string, requesterId: string): Promise<SplitRequest> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.splitRequests).findOneAndUpdate(
    { splitId, requesterId },
    { $set: { status: 'cancelled', updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result) throw new Error('SPLIT_NOT_FOUND_OR_NOT_OWNER')
  return result as unknown as SplitRequest
}

// ─── Queries ───────────────────────────────────────────────────────────────────

export async function getSplitRequest(splitId: string): Promise<SplitRequest | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.splitRequests).findOne({ splitId })
  return doc as unknown as SplitRequest | null
}

export async function getUserSplits(userId: string): Promise<SplitRequest[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.splitRequests)
    .find({ $or: [{ requesterId: userId }, { 'participants.userId': userId }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()
  return docs as unknown as SplitRequest[]
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function computeSplitStatus(participants: SplitParticipant[]): SplitStatus {
  const settled = participants.filter(p => p.status === 'settled').length
  if (settled === participants.length) return 'completed'
  if (settled > 0) return 'partial'
  return 'pending'
}
