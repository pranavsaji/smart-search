export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFind = jest.fn()
const mockDeleteOne = jest.fn()
const mockUpdateOne = jest.fn()
const mockFindOneAndUpdate = jest.fn()

const mockCollection = jest.fn((name: string) => {
  void name
  return {
    insertOne: mockInsertOne,
    find: mockFind,
    deleteOne: mockDeleteOne,
    updateOne: mockUpdateOne,
    findOneAndUpdate: mockFindOneAndUpdate,
  }
})

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({ collection: mockCollection })),
  COLLECTIONS: {
    webhookSubscriptions: 'webhook_subscriptions',
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mockid123456789a') }))

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  createWebhookSubscription,
  getWebhooksByDeveloper,
  deleteWebhook,
  dispatchWebhookEvent,
} from '@/lib/ecosystem/webhooks'
import type { WebhookSubscription } from '@/lib/ecosystem/webhooks'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSub(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    webhookId: 'wh-abc',
    developerId: 'dev-1',
    url: 'https://example.com/hooks',
    events: ['booking.confirmed'],
    secret: 'mysecret',
    isActive: true,
    failureCount: 0,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeCursor(rows: unknown[]) {
  const toArray = jest.fn().mockResolvedValue(rows)
  const sort = jest.fn().mockReturnValue({ toArray })
  return { sort, toArray }
}

// ─── createWebhookSubscription() ─────────────────────────────────────────────

describe('createWebhookSubscription()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('inserts a document with correct fields', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const sub = await createWebhookSubscription('dev-1', 'https://example.com/hooks', ['booking.confirmed'])

    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        developerId: 'dev-1',
        url: 'https://example.com/hooks',
        events: ['booking.confirmed'],
        isActive: true,
        failureCount: 0,
      })
    )
    expect(sub.developerId).toBe('dev-1')
    expect(sub.isActive).toBe(true)
  })

  it('generates a random secret (hex string)', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const sub = await createWebhookSubscription('dev-1', 'https://example.com/hooks', ['booking.confirmed'])

    expect(sub.secret).toMatch(/^[a-f0-9]{64}$/)
  })

  it('generates unique secrets across calls', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const sub1 = await createWebhookSubscription('dev-1', 'https://a.com', ['booking.confirmed'])
    const sub2 = await createWebhookSubscription('dev-1', 'https://a.com', ['booking.confirmed'])

    expect(sub1.secret).not.toBe(sub2.secret)
  })
})

// ─── getWebhooksByDeveloper() ─────────────────────────────────────────────────

describe('getWebhooksByDeveloper()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns subscriptions for the developer', async () => {
    const rows = [makeSub(), makeSub({ webhookId: 'wh-xyz' })]
    mockFind.mockReturnValue(makeCursor(rows))

    const subs = await getWebhooksByDeveloper('dev-1')
    expect(subs).toHaveLength(2)
    expect(mockFind).toHaveBeenCalledWith({ developerId: 'dev-1' })
  })

  it('returns empty array when developer has no subscriptions', async () => {
    mockFind.mockReturnValue(makeCursor([]))
    const subs = await getWebhooksByDeveloper('dev-nobody')
    expect(subs).toEqual([])
  })
})

// ─── deleteWebhook() ─────────────────────────────────────────────────────────

describe('deleteWebhook()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('removes webhook when webhookId + developerId match', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 })
    const result = await deleteWebhook('wh-abc', 'dev-1')
    expect(result).toBe(true)
    expect(mockDeleteOne).toHaveBeenCalledWith({ webhookId: 'wh-abc', developerId: 'dev-1' })
  })

  it('returns false when not found or wrong developer', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 0 })
    const result = await deleteWebhook('wh-abc', 'dev-wrong')
    expect(result).toBe(false)
  })
})

// ─── dispatchWebhookEvent() ───────────────────────────────────────────────────

describe('dispatchWebhookEvent()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends POST to active subscribers for that event', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub()]))
    mockFetch.mockResolvedValue({ ok: true })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('booking.confirmed', { orderId: 'ORD-1' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hooks',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sets X-Smart Search-Signature header (HMAC-SHA256)', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub()]))
    mockFetch.mockResolvedValue({ ok: true })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('booking.confirmed', { orderId: 'ORD-1' })
    const fetchCall = mockFetch.mock.calls[0]
    const headers = fetchCall[1].headers
    expect(headers['X-Smart Search-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('skips inactive subscriptions', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub({ isActive: false })]))
    // Query uses { isActive: true } filter, so find returns empty in real code,
    // but here we test that our mock reflects that filter is passed
    await dispatchWebhookEvent('booking.confirmed', { payload: 'data' })
    // If find returns inactive sub, fetch is still called (we're testing the filter is passed to find)
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, events: 'booking.confirmed' })
    )
  })

  it('targets specific developer when targetDeveloperId provided', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub()]))
    mockFetch.mockResolvedValue({ ok: true })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('booking.confirmed', {}, 'dev-1')
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ developerId: 'dev-1' })
    )
  })

  it('retries up to 3 times on delivery failure', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub()]))
    // All fetches fail
    mockFetch.mockRejectedValue(new Error('network error'))
    mockFindOneAndUpdate.mockResolvedValue({ webhookId: 'wh-abc', failureCount: 1 })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('booking.confirmed', {})
    // attempt 0, 1, 2 → 3 total calls
    expect(mockFetch).toHaveBeenCalledTimes(3)
  }, 15_000)

  it('suspends webhook after MAX_CONSECUTIVE_FAILURES (10)', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub({ failureCount: 9 })]))
    mockFetch.mockRejectedValue(new Error('network error'))
    // After retry exhaustion, findOneAndUpdate increments to 10
    mockFindOneAndUpdate.mockResolvedValue({ webhookId: 'wh-abc', failureCount: 10 })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('booking.confirmed', {})
    // Should have called updateOne to set isActive: false
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { webhookId: 'wh-abc' },
      { $set: { isActive: false } }
    )
  }, 15_000)

  it('HMAC signature format is "sha256=<hex>"', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub()]))
    mockFetch.mockResolvedValue({ ok: true })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('order.shipped', { orderId: 'ORD-2' })
    const sig = mockFetch.mock.calls[0][1].headers['X-Smart Search-Signature']
    expect(sig.startsWith('sha256=')).toBe(true)
    const hexPart = sig.slice(7)
    expect(hexPart).toMatch(/^[a-f0-9]{64}$/)
  })

  it('resets failureCount on successful delivery', async () => {
    mockFind.mockReturnValue(makeCursor([makeSub()]))
    mockFetch.mockResolvedValue({ ok: true })
    mockUpdateOne.mockResolvedValue({})

    await dispatchWebhookEvent('booking.confirmed', {})
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { webhookId: 'wh-abc' },
      { $set: expect.objectContaining({ failureCount: 0 }) }
    )
  })
})
