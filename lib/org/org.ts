// Phase 9.6 — Organisation CRUD

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import type {
  Organisation,
  OrgMember,
  OrgMemberRole,
  BudgetLimit,
  ApprovalRule,
} from './types'

export type { Organisation, OrgMember, OrgMemberRole, BudgetLimit, ApprovalRule }

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateOrgInput {
  name: string
  ownerId: string
  ownerEmail: string
  domain?: string
}

export async function createOrg(input: CreateOrgInput): Promise<Organisation> {
  const db = await getDb()
  const now = new Date()

  const org: Organisation = {
    orgId: `org_${nanoid(16)}`,
    name: input.name,
    domain: input.domain,
    ownerId: input.ownerId,
    members: [
      {
        userId: input.ownerId,
        email: input.ownerEmail,
        role: 'owner',
        joinedAt: now,
      },
    ],
    budgetLimits: [],
    approvalRules: [],
    consolidatedBilling: false,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.organisations).insertOne({ ...org })
  return org
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getOrg(orgId: string): Promise<Organisation | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.organisations).findOne({ orgId })
  return doc as unknown as Organisation | null
}

export async function getOrgByDomain(domain: string): Promise<Organisation | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.organisations).findOne({ domain })
  return doc as unknown as Organisation | null
}

export async function getUserOrgs(userId: string): Promise<Organisation[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.organisations)
    .find({ 'members.userId': userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()
  return docs as unknown as Organisation[]
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateOrgName(
  orgId: string,
  name: string
): Promise<Organisation | null> {
  const db = await getDb()
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId },
    { $set: { name, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

// ─── Member management ────────────────────────────────────────────────────────

export async function addMember(
  orgId: string,
  member: OrgMember
): Promise<Organisation | null> {
  const db = await getDb()
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId, 'members.userId': { $ne: member.userId } },
    {
      $push: { members: member },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

export async function removeMember(
  orgId: string,
  userId: string
): Promise<Organisation | null> {
  const db = await getDb()
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId },
    {
      $pull: { members: { userId } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgMemberRole
): Promise<Organisation | null> {
  const db = await getDb()
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId, 'members.userId': userId },
    {
      $set: { 'members.$.role': role, updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

// ─── Approval rules ───────────────────────────────────────────────────────────

export async function addApprovalRule(
  orgId: string,
  rule: Omit<ApprovalRule, 'ruleId'>
): Promise<Organisation | null> {
  const db = await getDb()
  const fullRule: ApprovalRule = { ruleId: `rule_${nanoid(10)}`, ...rule }
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId },
    {
      $push: { approvalRules: fullRule },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

export async function removeApprovalRule(
  orgId: string,
  ruleId: string
): Promise<Organisation | null> {
  const db = await getDb()
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId },
    {
      $pull: { approvalRules: { ruleId } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

// ─── Budget limits ────────────────────────────────────────────────────────────

export async function addBudgetLimit(
  orgId: string,
  limit: Omit<BudgetLimit, 'limitId' | 'currentSpendCents' | 'periodStart'>
): Promise<Organisation | null> {
  const db = await getDb()
  const now = new Date()
  const fullLimit: BudgetLimit = {
    limitId: `lim_${nanoid(10)}`,
    currentSpendCents: 0,
    periodStart: now,
    ...limit,
  }
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId },
    {
      $push: { budgetLimits: fullLimit },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

export async function removeBudgetLimit(
  orgId: string,
  limitId: string
): Promise<Organisation | null> {
  const db = await getDb()
  const result = await db.collection<Organisation>(COLLECTIONS.organisations).findOneAndUpdate(
    { orgId },
    {
      $pull: { budgetLimits: { limitId } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  )
  return result as unknown as Organisation | null
}

// ─── Role checks ──────────────────────────────────────────────────────────────

export function isOrgMember(org: Organisation, userId: string): boolean {
  return org.members.some(m => m.userId === userId)
}

export function getMemberRole(
  org: Organisation,
  userId: string
): OrgMemberRole | null {
  return org.members.find(m => m.userId === userId)?.role ?? null
}

export function canManageOrg(org: Organisation, userId: string): boolean {
  const role = getMemberRole(org, userId)
  return role === 'owner' || role === 'admin'
}
