export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockFindOneAndUpdate = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      find: mockFind,
      findOneAndUpdate: mockFindOneAndUpdate,
    }),
  })),
  COLLECTIONS: { organisations: 'organisations' },
}))

jest.mock('nanoid', () => ({ nanoid: (n?: number) => 'A'.repeat(n ?? 16) }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  createOrg,
  getOrg,
  getOrgByDomain,
  getUserOrgs,
  updateOrgName,
  addMember,
  removeMember,
  updateMemberRole,
  addApprovalRule,
  removeApprovalRule,
  addBudgetLimit,
  removeBudgetLimit,
  isOrgMember,
  getMemberRole,
  canManageOrg,
} from '@/lib/org/org'
import type { Organisation, OrgMember } from '@/lib/org/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    orgId: 'org_abc',
    name: 'Acme Corp',
    ownerId: 'user-owner',
    members: [
      { userId: 'user-owner', email: 'owner@acme.com', role: 'owner', joinedAt: new Date() },
      { userId: 'user-admin', email: 'admin@acme.com', role: 'admin', joinedAt: new Date() },
      { userId: 'user-member', email: 'member@acme.com', role: 'member', joinedAt: new Date() },
    ],
    budgetLimits: [],
    approvalRules: [],
    consolidatedBilling: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ─── createOrg() ──────────────────────────────────────────────────────────────

describe('createOrg()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates org with owner as first member', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })
    const org = await createOrg({
      name: 'Test Corp',
      ownerId: 'user-1',
      ownerEmail: 'owner@test.com',
    })

    expect(org.orgId).toMatch(/^org_/)
    expect(org.name).toBe('Test Corp')
    expect(org.ownerId).toBe('user-1')
    expect(org.members).toHaveLength(1)
    expect(org.members[0].userId).toBe('user-1')
    expect(org.members[0].role).toBe('owner')
    expect(org.members[0].email).toBe('owner@test.com')
    expect(org.budgetLimits).toEqual([])
    expect(org.approvalRules).toEqual([])
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
  })

  it('stores domain when provided', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })
    const org = await createOrg({
      name: 'Domain Corp',
      ownerId: 'u1',
      ownerEmail: 'ceo@domain.com',
      domain: 'domain.com',
    })
    expect(org.domain).toBe('domain.com')
  })
})

// ─── getOrg() ─────────────────────────────────────────────────────────────────

describe('getOrg()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns organisation when found', async () => {
    const fakeOrg = makeOrg()
    mockFindOne.mockResolvedValueOnce(fakeOrg)

    const result = await getOrg('org_abc')
    expect(result).toEqual(fakeOrg)
    expect(mockFindOne).toHaveBeenCalledWith({ orgId: 'org_abc' })
  })

  it('returns null when not found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const result = await getOrg('org_missing')
    expect(result).toBeNull()
  })
})

// ─── getOrgByDomain() ────────────────────────────────────────────────────────

describe('getOrgByDomain()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('queries by domain field', async () => {
    const fakeOrg = makeOrg({ domain: 'acme.com' })
    mockFindOne.mockResolvedValueOnce(fakeOrg)

    const result = await getOrgByDomain('acme.com')
    expect(result?.domain).toBe('acme.com')
    expect(mockFindOne).toHaveBeenCalledWith({ domain: 'acme.com' })
  })
})

// ─── getUserOrgs() ────────────────────────────────────────────────────────────

describe('getUserOrgs()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('queries for orgs where user is a member', async () => {
    mockFind.mockReturnValueOnce({
      sort: () => ({ limit: () => ({ toArray: async () => [makeOrg()] }) }),
    })

    const result = await getUserOrgs('user-owner')
    expect(result).toHaveLength(1)
    expect(mockFind).toHaveBeenCalledWith({ 'members.userId': 'user-owner' })
  })
})

// ─── updateOrgName() ─────────────────────────────────────────────────────────

describe('updateOrgName()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates the name', async () => {
    const updatedOrg = makeOrg({ name: 'New Name' })
    mockFindOneAndUpdate.mockResolvedValueOnce(updatedOrg)

    const result = await updateOrgName('org_abc', 'New Name')
    expect(result?.name).toBe('New Name')
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { orgId: 'org_abc' },
      expect.objectContaining({ $set: expect.objectContaining({ name: 'New Name' }) }),
      { returnDocument: 'after' }
    )
  })
})

// ─── addMember() / removeMember() ────────────────────────────────────────────

describe('addMember()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pushes member to the org', async () => {
    const updatedOrg = makeOrg()
    mockFindOneAndUpdate.mockResolvedValueOnce(updatedOrg)

    const newMember: OrgMember = {
      userId: 'user-new',
      email: 'new@acme.com',
      role: 'member',
      joinedAt: new Date(),
    }

    const result = await addMember('org_abc', newMember)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { orgId: 'org_abc', 'members.userId': { $ne: 'user-new' } },
      expect.objectContaining({ $push: expect.objectContaining({ members: newMember }) }),
      { returnDocument: 'after' }
    )
    expect(result).toEqual(updatedOrg)
  })
})

describe('removeMember()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pulls member from the org', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(makeOrg())
    await removeMember('org_abc', 'user-member')

    const call = mockFindOneAndUpdate.mock.calls[0]
    expect(call[1].$pull).toMatchObject({ members: { userId: 'user-member' } })
  })
})

// ─── updateMemberRole() ───────────────────────────────────────────────────────

describe('updateMemberRole()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets the member role using positional operator', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(makeOrg())
    await updateMemberRole('org_abc', 'user-member', 'admin')

    const call = mockFindOneAndUpdate.mock.calls[0]
    expect(call[0]).toEqual({ orgId: 'org_abc', 'members.userId': 'user-member' })
    expect(call[1].$set['members.$.role']).toBe('admin')
  })
})

// ─── addApprovalRule() / removeApprovalRule() ─────────────────────────────────

describe('addApprovalRule()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pushes rule with generated ruleId', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(makeOrg())
    await addApprovalRule('org_abc', {
      thresholdCents: 50000,
      currency: 'GBP',
      approverRole: 'admin',
      isActive: true,
    })

    const call = mockFindOneAndUpdate.mock.calls[0]
    const rule = call[1].$push.approvalRules
    expect(rule.ruleId).toMatch(/^rule_/)
    expect(rule.thresholdCents).toBe(50000)
    expect(rule.isActive).toBe(true)
  })
})

describe('removeApprovalRule()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pulls rule by ruleId', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(makeOrg())
    await removeApprovalRule('org_abc', 'rule_xyz')

    const call = mockFindOneAndUpdate.mock.calls[0]
    expect(call[1].$pull.approvalRules).toMatchObject({ ruleId: 'rule_xyz' })
  })
})

// ─── addBudgetLimit() / removeBudgetLimit() ───────────────────────────────────

describe('addBudgetLimit()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pushes limit with generated limitId and zero spend', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(makeOrg())
    await addBudgetLimit('org_abc', {
      periodType: 'monthly',
      limitCents: 100000,
      currency: 'GBP',
      alertThresholdPercent: 80,
    })

    const call = mockFindOneAndUpdate.mock.calls[0]
    const limit = call[1].$push.budgetLimits
    expect(limit.limitId).toMatch(/^lim_/)
    expect(limit.currentSpendCents).toBe(0)
    expect(limit.limitCents).toBe(100000)
    expect(limit.periodStart).toBeInstanceOf(Date)
  })
})

describe('removeBudgetLimit()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pulls limit by limitId', async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(makeOrg())
    await removeBudgetLimit('org_abc', 'lim_xyz')

    const call = mockFindOneAndUpdate.mock.calls[0]
    expect(call[1].$pull.budgetLimits).toMatchObject({ limitId: 'lim_xyz' })
  })
})

// ─── Role check utilities ─────────────────────────────────────────────────────

describe('isOrgMember()', () => {
  const org = makeOrg()

  it('returns true for existing members', () => {
    expect(isOrgMember(org, 'user-owner')).toBe(true)
    expect(isOrgMember(org, 'user-admin')).toBe(true)
    expect(isOrgMember(org, 'user-member')).toBe(true)
  })

  it('returns false for non-members', () => {
    expect(isOrgMember(org, 'user-stranger')).toBe(false)
  })
})

describe('getMemberRole()', () => {
  const org = makeOrg()

  it('returns the correct role for each member', () => {
    expect(getMemberRole(org, 'user-owner')).toBe('owner')
    expect(getMemberRole(org, 'user-admin')).toBe('admin')
    expect(getMemberRole(org, 'user-member')).toBe('member')
  })

  it('returns null for non-members', () => {
    expect(getMemberRole(org, 'stranger')).toBeNull()
  })
})

describe('canManageOrg()', () => {
  const org = makeOrg()

  it('returns true for owner and admin', () => {
    expect(canManageOrg(org, 'user-owner')).toBe(true)
    expect(canManageOrg(org, 'user-admin')).toBe(true)
  })

  it('returns false for regular member and non-member', () => {
    expect(canManageOrg(org, 'user-member')).toBe(false)
    expect(canManageOrg(org, 'user-stranger')).toBe(false)
  })
})
