/**
 * /api/cron/expire-offers — unit tests.
 * MongoDB and SSE are mocked; cron secret auth is verified.
 */
export {}

const mockNotifyOfferExpired = jest.fn()
const mockFind = jest.fn()
const mockUpdateOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      find: mockFind,
      updateOne: mockUpdateOne,
    }),
  })),
  COLLECTIONS: { stageCarts: 'stageCarts' },
}))

jest.mock('@/lib/sse/notify', () => ({
  notifyOfferExpired: (...args: unknown[]) => mockNotifyOfferExpired(...args),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

function makeRequest(secret: string | null): Request {
  return new Request('http://localhost/api/cron/expire-offers', {
    method: 'GET',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  })
}

describe('GET /api/cron/expire-offers', () => {
  const CRON_SECRET = 'test-cron-secret'

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('returns 401 with wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/expire-offers/route')
    const req = makeRequest('wrong-secret')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
    expect(mockNotifyOfferExpired).not.toHaveBeenCalled()
  })

  it('returns 401 with no Authorization header', async () => {
    const { GET } = await import('@/app/api/cron/expire-offers/route')
    const req = makeRequest(null)
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns expired: 0 when no carts have expired items', async () => {
    mockFind.mockReturnValue({ toArray: async () => [] })

    const { GET } = await import('@/app/api/cron/expire-offers/route')
    const req = makeRequest(CRON_SECRET)
    const res = await GET(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expired).toBe(0)
    expect(mockNotifyOfferExpired).not.toHaveBeenCalled()
  })

  it('notifies and evicts expired items from active carts', async () => {
    const past = new Date(Date.now() - 60_000)   // 1 minute ago
    const future = new Date(Date.now() + 60_000)  // 1 minute from now

    const carts = [
      {
        stageId: 'stage-1',
        items: [
          { id: 'item-a', cardId: 'card-a', offerExpiresAt: past },
          { id: 'item-b', cardId: 'card-b', offerExpiresAt: future },
        ],
      },
      {
        stageId: 'stage-2',
        items: [
          { id: 'item-c', cardId: 'card-c', offerExpiresAt: past },
        ],
      },
    ]

    mockFind.mockReturnValue({ toArray: async () => carts })
    mockUpdateOne.mockResolvedValue({})

    jest.resetModules()
    const { GET } = await import('@/app/api/cron/expire-offers/route')
    const req = makeRequest(CRON_SECRET)
    const res = await GET(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expired).toBe(2)

    // Only the truly expired items are notified
    expect(mockNotifyOfferExpired).toHaveBeenCalledTimes(2)
    expect(mockNotifyOfferExpired).toHaveBeenCalledWith('stage-1', 'card-a')
    expect(mockNotifyOfferExpired).toHaveBeenCalledWith('stage-2', 'card-c')

    // One updateOne per cart to pull expired items
    expect(mockUpdateOne).toHaveBeenCalledTimes(2)
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { stageId: 'stage-1' },
      expect.objectContaining({ $pull: expect.anything() })
    )
  })

  it('continues evicting other carts if one notification fails', async () => {
    const past = new Date(Date.now() - 60_000)

    const carts = [
      { stageId: 'stage-fail', items: [{ id: 'item-x', cardId: 'card-x', offerExpiresAt: past }] },
      { stageId: 'stage-ok',   items: [{ id: 'item-y', cardId: 'card-y', offerExpiresAt: past }] },
    ]

    mockFind.mockReturnValue({ toArray: async () => carts })
    mockUpdateOne.mockResolvedValue({})
    mockNotifyOfferExpired
      .mockRejectedValueOnce(new Error('Redis timeout'))
      .mockResolvedValueOnce(undefined)

    jest.resetModules()
    const { GET } = await import('@/app/api/cron/expire-offers/route')
    const req = makeRequest(CRON_SECRET)
    const res = await GET(req as never)
    const body = await res.json()

    // Both carts still get evicted even though one notification failed
    expect(body.expired).toBe(2)
    expect(mockUpdateOne).toHaveBeenCalledTimes(2)
  })
})
