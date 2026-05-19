// Phase 9.6 — Approval workflow
// Purchases over the org threshold require manager sign-off before checkout.
// 48-hour expiry enforced; expired requests block checkout and require re-submission.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import { getOrg } from './org'
import type { ApprovalRequest, ApprovalStatus } from './types'

export type { ApprovalRequest, ApprovalStatus }

const APPROVAL_TTL_MS = 48 * 60 * 60 * 1000  // 48 hours

// ─── Approval check ───────────────────────────────────────────────────────────

export interface ApprovalCheckResult {
  needsApproval: boolean
  ruleId?: string
  approverId?: string
}

export async function checkNeedsApproval(
  orgId: string,
  requesterId: string,
  amountCents: number,
  currency: string,
  department?: string
): Promise<ApprovalCheckResult> {
  const org = await getOrg(orgId)
  if (!org) return { needsApproval: false }

  const member = org.members.find(m => m.userId === requesterId)
  if (!member) return { needsApproval: false }

  // Owners bypass approval
  if (member.role === 'owner') return { needsApproval: false }

  const effectiveDept = department ?? member.department

  // Find the most restrictive applicable active rule (lowest threshold first)
  const applicableRules = org.approvalRules
    .filter(r =>
      r.isActive &&
      r.currency === currency &&
      amountCents > r.thresholdCents &&
      (!r.department || r.department === effectiveDept)
    )
    .sort((a, b) => a.thresholdCents - b.thresholdCents)

  if (applicableRules.length === 0) return { needsApproval: false }

  const rule = applicableRules[0]

  // Find a suitable approver (must be a different user with sufficient role)
  const approver = org.members.find(m =>
    m.userId !== requesterId &&
    (rule.approverRole === 'admin'
      ? m.role === 'admin' || m.role === 'owner'
      : m.role === 'owner')
  )

  return {
    needsApproval: true,
    ruleId: rule.ruleId,
    approverId: approver?.userId,
  }
}

// ─── Create request ───────────────────────────────────────────────────────────

export interface CreateApprovalInput {
  orgId: string
  requesterId: string
  approverId?: string
  amountCents: number
  currency: string
  description: string
  stageId?: string
  orderId?: string
}

export async function createApprovalRequest(
  input: CreateApprovalInput
): Promise<ApprovalRequest> {
  const db = await getDb()
  const now = new Date()

  const request: ApprovalRequest = {
    requestId: `apr_${nanoid(16)}`,
    orgId: input.orgId,
    requesterId: input.requesterId,
    approverId: input.approverId,
    stageId: input.stageId,
    orderId: input.orderId,
    amountCents: input.amountCents,
    currency: input.currency,
    description: input.description,
    status: 'pending',
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    createdAt: now,
  }

  await db.collection(COLLECTIONS.approvalRequests).insertOne({ ...request })
  return request
}

// ─── Review ───────────────────────────────────────────────────────────────────

export async function approveRequest(
  requestId: string,
  approverId: string,
  note?: string
): Promise<ApprovalRequest | null> {
  return updateRequestStatus(requestId, approverId, 'approved', note)
}

export async function rejectRequest(
  requestId: string,
  approverId: string,
  note: string
): Promise<ApprovalRequest | null> {
  return updateRequestStatus(requestId, approverId, 'rejected', note)
}

async function updateRequestStatus(
  requestId: string,
  approverId: string,
  status: 'approved' | 'rejected',
  note?: string
): Promise<ApprovalRequest | null> {
  const db = await getDb()
  const now = new Date()

  // Only the designated approver or an org owner can review
  const result = await db.collection(COLLECTIONS.approvalRequests).findOneAndUpdate(
    {
      requestId,
      status: 'pending',
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status,
        approverId,
        reviewNote: note,
        reviewedAt: now,
      },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as ApprovalRequest | null
}

// ─── Expiry ───────────────────────────────────────────────────────────────────

export async function expirePendingRequests(): Promise<number> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.approvalRequests).updateMany(
    { status: 'pending', expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired' as ApprovalStatus } }
  )
  return result.modifiedCount
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPendingApprovals(
  approverId: string,
  orgId?: string
): Promise<ApprovalRequest[]> {
  const db = await getDb()
  const filter: Record<string, unknown> = {
    approverId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }
  if (orgId) filter.orgId = orgId

  const docs = await db
    .collection(COLLECTIONS.approvalRequests)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
  return docs as unknown as ApprovalRequest[]
}

export async function getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.approvalRequests).findOne({ requestId })
  return doc as unknown as ApprovalRequest | null
}

export async function getUserApprovalRequests(
  userId: string,
  orgId?: string
): Promise<ApprovalRequest[]> {
  const db = await getDb()
  const filter: Record<string, unknown> = { requesterId: userId }
  if (orgId) filter.orgId = orgId

  const docs = await db
    .collection(COLLECTIONS.approvalRequests)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
  return docs as unknown as ApprovalRequest[]
}

export function isApprovalExpired(request: ApprovalRequest): boolean {
  return request.expiresAt < new Date()
}
