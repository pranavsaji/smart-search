// Phase 9.6 — B2B Organisation types

export type OrgMemberRole = 'owner' | 'admin' | 'member'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'expired'

export interface OrgMember {
  userId: string
  email: string
  role: OrgMemberRole
  department?: string
  joinedAt: Date
}

export interface BudgetLimit {
  limitId: string
  department?: string       // null = applies to all departments
  periodType: 'monthly' | 'quarterly' | 'annual'
  limitCents: number
  currency: string
  currentSpendCents: number
  periodStart: Date
  alertThresholdPercent: number  // 0–100; alert sent at this usage level
}

export interface ApprovalRule {
  ruleId: string
  department?: string       // null = applies to all departments
  thresholdCents: number    // purchases above this require approval
  currency: string
  approverRole: 'admin' | 'owner'
  isActive: boolean
}

export interface Organisation {
  orgId: string
  name: string
  domain?: string           // e.g. 'acme.com' — auto-enroll users with matching email domain
  ownerId: string
  members: OrgMember[]
  budgetLimits: BudgetLimit[]
  approvalRules: ApprovalRule[]
  stripeCustomerId?: string
  consolidatedBilling: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ApprovalRequest {
  requestId: string
  orgId: string
  requesterId: string
  approverId?: string
  stageId?: string
  orderId?: string
  amountCents: number
  currency: string
  description: string
  status: ApprovalStatus
  reviewNote?: string
  expiresAt: Date           // 48h TTL — auto-rejects after expiry
  createdAt: Date
  reviewedAt?: Date
}

export interface BudgetCheckResult {
  allowed: boolean
  remainingCents: number
  limitCents: number
  periodType: BudgetLimit['periodType']
  alertTriggered: boolean   // true when spend just crossed alertThresholdPercent
}
