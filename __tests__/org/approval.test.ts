export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockUpdateMany = jest.fn()

// We need two different collections: organisations and approval_requests
const orgCollection = {
  findOne: mockFindOne,
}
const approvalCollection = {
  insertOne: mockInsertOne,
  findOne: jest.fn(),
  find: mockFind,
  findOneAndUpdate: mockFindOneAndUpdate,
  updateMany: mockUpdateMany,
}

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: (name: string) =>
      name === 'organisations' ? orgCollection : approvalCollection,
  })),
  COLLECTIONS: {
    organisations: 'organisations',
    approvalRequests: 'approval_requests',
  },
}))

jest.mock('nanoid', () => ({ nanoid: (n?: number) => 'B'.repeat(n ?? 16) }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  checkNeedsApproval,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  expirePendingRequests,
  getPendingApprovals,
  getApprovalRequest,
  getUserApprovalRequests,
  isApprovalExpired,
} from '@/lib/org/approval'
import type { Organisation, ApprovalRequest } from '@/lib/org/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    orgId: 'org_001',
    name: 'Acme',
    ownerId: 'owner-1',
    members: [
      // admin-1 listed first so find() returns them as the designated approver
      { userId: 'admin-1', email: 'admin@acme.com', role: 'admin', joinedAt: new Date() },
      { userId: 'owner-1', email: 'owner@acme.com', role: 'owner', joinedAt: new Date() },
      { userId: 'member-1', email: 'member@acme.com', role: 'member', joinedAt: new Date() },
    ],
    budgetLimits: [],
    approvalRules: [
      {
        ruleId: 'rule-001',
        thresholdCents: 50000,
        currency: 'GBP',
        approverRole: 'admin',
        isActive: true,
      },
    ],
    consolidatedBilling: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeApprovalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'apr_001',
    orgId: 'org_001',
    requesterId: 'member-1',
    approverId: 'admin-1',
    amountCents: 75000,
    currency: 'GBP',
    description: 'Team offsite booking',
    status: 'pending',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  }
}

// ─── checkNeedsApproval() ────────────────────────────────────────────────────

describe('checkNeedsApproval()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns needsApproval=false when amount is below threshold', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg())
    const result = await checkNeedsApproval('org_001', 'member-1', 30000, 'GBP')
    expect(result.needsApproval).toBe(false)
  })

  it('returns needsApproval=true when amount exceeds threshold', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg())
    const result = await checkNeedsApproval('org_001', 'member-1', 75000, 'GBP')
    expect(result.needsApproval).toBe(true)
    expect(result.ruleId).toBe('rule-001')
    expect(result.approverId).toBe('admin-1')
  })

  it('owners bypass approval entirely', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg())
    const result = await checkNeedsApproval('org_001', 'owner-1', 1000000, 'GBP')
    expect(result.needsApproval).toBe(false)
  })

  it('returns needsApproval=false for wrong currency', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg())
    const result = await checkNeedsApproval('org_001', 'member-1', 75000, 'USD')
    expect(result.needsApproval).toBe(false)
  })

  it('returns needsApproval=false when org not found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const result = await checkNeedsApproval('org_missing', 'member-1', 75000, 'GBP')
    expect(result.needsApproval).toBe(false)
  })

  it('returns needsApproval=false when requester is not a member', async () => {
    mockFindOne.mockResolvedValueOnce(makeOrg())
    const result = await checkNeedsApproval('org_001', 'stranger', 75000, 'GBP')
    expect(result.needsApproval).toBe(false)
  })

  it('returns needsApproval=false when no rules are active', async () => {
    const org = makeOrg()
    org.approvalRules[0].isActive = false
    mockFindOne.mockResolvedValueOnce(org)

    const result = await checkNeedsApproval('org_001', 'member-1', 75000, 'GBP')
    expect(result.needsApproval).toBe(false)
  })
})

// ─── createApprovalRequest() ─────────────────────────────────────────────────

describe('createApprovalRequest()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates request with correct fields and 48h expiry', async () => {
    approvalCollection.insertOne.mockResolvedValueOnce({ acknowledged: true })
    const request = await createApprovalRequest({
      orgId: 'org_001',
      requesterId: 'member-1',
      approverId: 'admin-1',
      amountCents: 75000,
      currency: 'GBP',
      description: 'Team offsite',
    })

    expect(request.requestId).toMatch(/^apr_/)
    expect(request.status).toBe('pending')
    expect(request.orgId).toBe('org_001')
    expect(request.amountCents).toBe(75000)

    const expiryMs = request.expiresAt.getTime() - request.createdAt.getTime()
    expect(expiryMs).toBeGreaterThanOrEqual(47 * 60 * 60 * 1000)
    expect(expiryMs).toBeLessThanOrEqual(49 * 60 * 60 * 1000)
  })

  it('stores stageId and orderId when provided', async () => {
    approvalCollection.insertOne.mockResolvedValueOnce({ acknowledged: true })
    const request = await createApprovalRequest({
      orgId: 'org_001',
      requesterId: 'member-1',
      amountCents: 75000,
      currency: 'GBP',
      description: 'Test',
      stageId: 'stage-xyz',
    })

    expect(request.stageId).toBe('stage-xyz')
  })
})

// ─── approveRequest() / rejectRequest() ──────────────────────────────────────

describe('approveRequest()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates status to approved with reviewer info', async () => {
    const approved = makeApprovalRequest({ status: 'approved', approverId: 'admin-1' })
    mockFindOneAndUpdate.mockResolvedValueOnce(approved)

    const result = await approveRequest('apr_001', 'admin-1', 'Looks good')
    expect(result?.status).toBe('approved')
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr_001', status: 'pending' }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'approved', approverId: 'admin-1' }) }),
      { returnDocument: 'after' }
    )
  })

  it('returns null when request not found or expired', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(null)
    const result = await approveRequest('apr_missing', 'admin-1')
    expect(result).toBeNull()
  })
})

describe('rejectRequest()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates status to rejected with note', async () => {
    const rejected = makeApprovalRequest({ status: 'rejected' })
    mockFindOneAndUpdate.mockResolvedValueOnce(rejected)

    const result = await rejectRequest('apr_001', 'admin-1', 'Over budget')
    expect(result?.status).toBe('rejected')

    const call = mockFindOneAndUpdate.mock.calls[0]
    expect(call[1].$set.status).toBe('rejected')
    expect(call[1].$set.reviewNote).toBe('Over budget')
  })
})

// ─── expirePendingRequests() ──────────────────────────────────────────────────

describe('expirePendingRequests()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates pending past-expiry requests to expired', async () => {
    mockUpdateMany.mockResolvedValueOnce({ modifiedCount: 3 })
    const count = await expirePendingRequests()
    expect(count).toBe(3)
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { status: 'pending', expiresAt: { $lt: expect.any(Date) } },
      { $set: { status: 'expired' } }
    )
  })
})

// ─── getPendingApprovals() ────────────────────────────────────────────────────

describe('getPendingApprovals()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('filters by approverId and not-expired', async () => {
    const fakeRequests = [makeApprovalRequest()]
    approvalCollection.find.mockReturnValueOnce({
      sort: () => ({ limit: () => ({ toArray: async () => fakeRequests }) }),
    })

    const results = await getPendingApprovals('admin-1')
    expect(results).toHaveLength(1)
    expect(approvalCollection.find).toHaveBeenCalledWith(
      expect.objectContaining({ approverId: 'admin-1', status: 'pending' })
    )
  })

  it('includes orgId filter when provided', async () => {
    approvalCollection.find.mockReturnValueOnce({
      sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
    })

    await getPendingApprovals('admin-1', 'org_001')
    expect(approvalCollection.find).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_001' })
    )
  })
})

// ─── getApprovalRequest() ────────────────────────────────────────────────────

describe('getApprovalRequest()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns request when found', async () => {
    const req = makeApprovalRequest()
    approvalCollection.findOne.mockResolvedValueOnce(req)
    const result = await getApprovalRequest('apr_001')
    expect(result?.requestId).toBe('apr_001')
  })

  it('returns null when not found', async () => {
    approvalCollection.findOne.mockResolvedValueOnce(null)
    const result = await getApprovalRequest('apr_missing')
    expect(result).toBeNull()
  })
})

// ─── isApprovalExpired() ──────────────────────────────────────────────────────

describe('isApprovalExpired()', () => {
  it('returns false for a future expiry', () => {
    const req = makeApprovalRequest({
      expiresAt: new Date(Date.now() + 10000),
    })
    expect(isApprovalExpired(req)).toBe(false)
  })

  it('returns true for a past expiry', () => {
    const req = makeApprovalRequest({
      expiresAt: new Date(Date.now() - 10000),
    })
    expect(isApprovalExpired(req)).toBe(true)
  })
})
