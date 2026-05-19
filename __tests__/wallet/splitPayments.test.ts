export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()
const mockUpdateOne = jest.fn()
const mockFind = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      findOneAndUpdate: mockFindOneAndUpdate,
      updateOne: mockUpdateOne,
      find: () => ({ sort: () => ({ limit: () => ({ toArray: mockFind }) }) }),
    }),
  })),
  COLLECTIONS: { splitRequests: 'split_requests' },
}))

const mockDebitWallet = jest.fn()
jest.mock('@/lib/wallet/wallet', () => ({
  debitWallet: (...a: unknown[]) => mockDebitWallet(...a),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

let idCounter = 0
jest.mock('nanoid', () => ({ nanoid: () => `TESTID${String(++idCounter).padStart(4, '0')}` }))

import {
  createSplitRequest,
  approveAndSettle,
  declineSplit,
  cancelSplit,
  getSplitRequest,
  getUserSplits,
} from '@/lib/wallet/splitPayments'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeParticipants() {
  return [
    { userId: 'alice', handle: '@alice', ratioPercent: 60 },
    { userId: 'bob', handle: '@bob', ratioPercent: 40 },
  ]
}

function makeCreateInput(overrides = {}) {
  return {
    stageId: 'stage-1',
    requesterId: 'alice',
    requesterHandle: '@alice',
    totalAmountCents: 10000,
    currency: 'GBP',
    description: 'Paris trip costs',
    participants: makeParticipants(),
    ...overrides,
  }
}

function makeSplit(overrides = {}) {
  return {
    splitId: 'SPL-TESTID0001',
    stageId: 'stage-1',
    requesterId: 'alice',
    requesterHandle: '@alice',
    totalAmountCents: 10000,
    currency: 'GBP',
    description: 'Paris trip costs',
    participants: [
      { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'pending' },
      { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
    ],
    status: 'pending',
    expiresAt: new Date('2026-12-31'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  idCounter = 0
  mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
  mockFindOne.mockResolvedValue(null)
  mockFindOneAndUpdate.mockResolvedValue(null)
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })
  mockFind.mockResolvedValue([])
  mockDebitWallet.mockResolvedValue({ balanceCents: 0 })
})

// ─── createSplitRequest ───────────────────────────────────────────────────────

describe('createSplitRequest', () => {
  it('creates split with 60/40 ratio correctly', async () => {
    const split = await createSplitRequest(makeCreateInput())
    expect(split.participants[0].amountCents).toBe(6000)  // 60% of 10000
    expect(split.participants[1].amountCents).toBe(4000)  // 40% of 10000
    expect(split.status).toBe('pending')
  })

  it('persists to DB via insertOne', async () => {
    await createSplitRequest(makeCreateInput())
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: 'stage-1', totalAmountCents: 10000 })
    )
  })

  it('throws INVALID_RATIOS when ratios sum to < 100', async () => {
    const input = makeCreateInput({ participants: [
      { userId: 'alice', handle: '@alice', ratioPercent: 50 },
      { userId: 'bob', handle: '@bob', ratioPercent: 40 },  // sums to 90
    ]})
    await expect(createSplitRequest(input)).rejects.toThrow('INVALID_RATIOS')
  })

  it('throws INVALID_RATIOS when ratios sum to > 100', async () => {
    const input = makeCreateInput({ participants: [
      { userId: 'alice', handle: '@alice', ratioPercent: 60 },
      { userId: 'bob', handle: '@bob', ratioPercent: 50 },  // sums to 110
    ]})
    await expect(createSplitRequest(input)).rejects.toThrow('INVALID_RATIOS')
  })

  it('throws SPLIT_REQUIRES_TWO_PARTICIPANTS for single participant', async () => {
    const input = makeCreateInput({ participants: [
      { userId: 'alice', handle: '@alice', ratioPercent: 100 },
    ]})
    await expect(createSplitRequest(input)).rejects.toThrow('SPLIT_REQUIRES_TWO_PARTICIPANTS')
  })

  it('throws SPLIT_MINIMUM_100 for amounts < 100', async () => {
    await expect(createSplitRequest(makeCreateInput({ totalAmountCents: 99 }))).rejects.toThrow('SPLIT_MINIMUM_100')
  })

  it('sets expiresAt to 48 hours from creation', async () => {
    const before = Date.now()
    const split = await createSplitRequest(makeCreateInput())
    const expiryMs = split.expiresAt.getTime()
    const expectedMs = before + 48 * 3600 * 1000
    // Allow 5 second tolerance for test execution time
    expect(Math.abs(expiryMs - expectedMs)).toBeLessThan(5000)
  })

  it('sets initial participant status to pending', async () => {
    const split = await createSplitRequest(makeCreateInput())
    split.participants.forEach(p => expect(p.status).toBe('pending'))
  })

  it('handles equal 3-way split (33/33/34)', async () => {
    const input = makeCreateInput({
      participants: [
        { userId: 'a', handle: '@a', ratioPercent: 33 },
        { userId: 'b', handle: '@b', ratioPercent: 33 },
        { userId: 'c', handle: '@c', ratioPercent: 34 },
      ],
      totalAmountCents: 9900,
    })
    const split = await createSplitRequest(input)
    expect(split.participants).toHaveLength(3)
  })
})

// ─── approveAndSettle ─────────────────────────────────────────────────────────

describe('approveAndSettle', () => {
  it('debits wallet when method is wallet', async () => {
    mockFindOne.mockResolvedValue(makeSplit())
    const updatedSplit = makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'settled' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
      ],
    })
    mockFindOneAndUpdate.mockResolvedValue(updatedSplit)

    await approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })
    expect(mockDebitWallet).toHaveBeenCalledWith('alice', 6000, 'SPL-1', expect.any(String))
  })

  it('skips wallet debit when method is card', async () => {
    mockFindOne.mockResolvedValue(makeSplit())
    const updatedSplit = makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'settled' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
      ],
    })
    mockFindOneAndUpdate.mockResolvedValue(updatedSplit)

    await approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'card' })
    expect(mockDebitWallet).not.toHaveBeenCalled()
  })

  it('marks split as partial when only some participants settled', async () => {
    const splitWithOnePending = makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'settled' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
      ],
    })
    mockFindOne.mockResolvedValue(makeSplit())
    mockFindOneAndUpdate.mockResolvedValue(splitWithOnePending)

    const result = await approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { splitId: 'SPL-1' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'partial' }) })
    )
    expect(result.status).toBe('partial')
  })

  it('marks split as completed when all settled', async () => {
    const allSettled = makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'settled' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'settled' },
      ],
    })
    mockFindOne.mockResolvedValue(makeSplit())
    mockFindOneAndUpdate.mockResolvedValue(allSettled)

    const result = await approveAndSettle({ splitId: 'SPL-1', userId: 'bob', method: 'wallet' })
    expect(result.status).toBe('completed')
  })

  it('throws SPLIT_NOT_FOUND for unknown splitId', async () => {
    mockFindOne.mockResolvedValue(null)
    await expect(approveAndSettle({ splitId: 'bad', userId: 'alice', method: 'wallet' })).rejects.toThrow('SPLIT_NOT_FOUND')
  })

  it('throws SPLIT_NOT_ACTIVE for expired splits', async () => {
    mockFindOne.mockResolvedValue(makeSplit({ status: 'expired' }))
    await expect(approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })).rejects.toThrow('SPLIT_NOT_ACTIVE')
  })

  it('throws SPLIT_NOT_ACTIVE for cancelled splits', async () => {
    mockFindOne.mockResolvedValue(makeSplit({ status: 'cancelled' }))
    await expect(approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })).rejects.toThrow('SPLIT_NOT_ACTIVE')
  })

  it('throws NOT_A_PARTICIPANT when userId not in participants', async () => {
    mockFindOne.mockResolvedValue(makeSplit())
    await expect(approveAndSettle({ splitId: 'SPL-1', userId: 'carol', method: 'wallet' })).rejects.toThrow('NOT_A_PARTICIPANT')
  })

  it('throws ALREADY_SETTLED on second approval attempt', async () => {
    mockFindOne.mockResolvedValue(makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'settled' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
      ],
    }))
    await expect(approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })).rejects.toThrow('ALREADY_SETTLED')
  })

  it('throws ALREADY_DECLINED when participant already declined', async () => {
    mockFindOne.mockResolvedValue(makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'declined' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
      ],
    }))
    await expect(approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })).rejects.toThrow('ALREADY_DECLINED')
  })

  it('propagates INSUFFICIENT_BALANCE from debitWallet', async () => {
    mockFindOne.mockResolvedValue(makeSplit())
    mockDebitWallet.mockRejectedValue(new Error('INSUFFICIENT_BALANCE'))
    await expect(approveAndSettle({ splitId: 'SPL-1', userId: 'alice', method: 'wallet' })).rejects.toThrow('INSUFFICIENT_BALANCE')
  })
})

// ─── declineSplit ─────────────────────────────────────────────────────────────

describe('declineSplit', () => {
  it('marks participant as declined', async () => {
    mockFindOne.mockResolvedValue(makeSplit())
    const declined = makeSplit({
      participants: [
        { userId: 'alice', handle: '@alice', amountCents: 6000, ratioPercent: 60, status: 'declined' },
        { userId: 'bob', handle: '@bob', amountCents: 4000, ratioPercent: 40, status: 'pending' },
      ],
    })
    mockFindOneAndUpdate.mockResolvedValue(declined)
    const result = await declineSplit('SPL-1', 'alice')
    expect(result.participants[0].status).toBe('declined')
  })

  it('throws NOT_A_PARTICIPANT for unrelated user', async () => {
    mockFindOne.mockResolvedValue(makeSplit())
    await expect(declineSplit('SPL-1', 'carol')).rejects.toThrow('NOT_A_PARTICIPANT')
  })

  it('throws SPLIT_NOT_FOUND for unknown splitId', async () => {
    mockFindOne.mockResolvedValue(null)
    await expect(declineSplit('bad-id', 'alice')).rejects.toThrow('SPLIT_NOT_FOUND')
  })
})

// ─── cancelSplit ──────────────────────────────────────────────────────────────

describe('cancelSplit', () => {
  it('cancels split when called by requester', async () => {
    const cancelled = makeSplit({ status: 'cancelled' })
    mockFindOneAndUpdate.mockResolvedValue(cancelled)
    const result = await cancelSplit('SPL-1', 'alice')
    expect(result.status).toBe('cancelled')
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { splitId: 'SPL-1', requesterId: 'alice' },
      expect.any(Object),
      expect.any(Object)
    )
  })

  it('throws SPLIT_NOT_FOUND_OR_NOT_OWNER when wrong requester', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)
    await expect(cancelSplit('SPL-1', 'bob')).rejects.toThrow('SPLIT_NOT_FOUND_OR_NOT_OWNER')
  })
})

// ─── getSplitRequest ──────────────────────────────────────────────────────────

describe('getSplitRequest', () => {
  it('returns split by ID', async () => {
    const split = makeSplit()
    mockFindOne.mockResolvedValue(split)
    expect(await getSplitRequest('SPL-1')).toEqual(split)
  })

  it('returns null for unknown ID', async () => {
    mockFindOne.mockResolvedValue(null)
    expect(await getSplitRequest('bad')).toBeNull()
  })
})

// ─── getUserSplits ────────────────────────────────────────────────────────────

describe('getUserSplits', () => {
  it('returns splits where user is requester or participant', async () => {
    const splits = [makeSplit(), makeSplit({ splitId: 'SPL-2' })]
    mockFind.mockResolvedValue(splits)
    const result = await getUserSplits('alice')
    expect(result).toHaveLength(2)
  })

  it('returns empty array when user has no splits', async () => {
    mockFind.mockResolvedValue([])
    expect(await getUserSplits('nobody')).toEqual([])
  })
})
