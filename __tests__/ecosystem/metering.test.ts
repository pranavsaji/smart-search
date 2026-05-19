export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockHincrby = jest.fn()
const mockExpirePipe = jest.fn()
const mockExec = jest.fn()
const mockHgetall = jest.fn()

const mockPipeline = jest.fn(() => ({
  hincrby: mockHincrby,
  expire: mockExpirePipe,
  exec: mockExec,
}))

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    pipeline: () => mockPipeline(),
    hgetall: (...a: unknown[]) => mockHgetall(...a),
  },
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { recordApiCall, getMonthlyUsage } from '@/lib/ecosystem/metering'

// ─── recordApiCall() ──────────────────────────────────────────────────────────

describe('recordApiCall()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls pipeline and exec', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-1', 'acme-hotels', 'search')
    expect(mockExec).toHaveBeenCalledTimes(1)
  })

  it('increments total counter', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-1', 'acme-hotels', 'search')
    expect(mockHincrby).toHaveBeenCalledWith(
      expect.stringContaining('dev-1'),
      'total',
      1
    )
  })

  it('increments adapter-specific counter', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-1', 'acme-hotels', 'search')
    expect(mockHincrby).toHaveBeenCalledWith(
      expect.stringContaining('dev-1'),
      'adapter:acme-hotels',
      1
    )
  })

  it('increments endpoint-specific counter', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-1', 'acme-hotels', 'search')
    expect(mockHincrby).toHaveBeenCalledWith(
      expect.stringContaining('dev-1'),
      'endpoint:search',
      1
    )
  })

  it('sets expiry on the usage hash', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-1', 'acme-hotels', 'createOrder')
    expect(mockExpirePipe).toHaveBeenCalledWith(
      expect.stringContaining('dev-1'),
      expect.any(Number)
    )
  })

  it('uses developerId in the Redis key', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-xyz-999', 'some-adapter', 'checkAvailability')
    const hincrbyKey = mockHincrby.mock.calls[0][0]
    expect(hincrbyKey).toContain('dev-xyz-999')
  })

  it('uses current year-month in the Redis key', async () => {
    mockExec.mockResolvedValue([1, 1, 1, 1])
    await recordApiCall('dev-1', 'adapter', 'search')
    const now = new Date()
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const hincrbyKey = mockHincrby.mock.calls[0][0]
    expect(hincrbyKey).toContain(ym)
  })
})

// ─── getMonthlyUsage() ────────────────────────────────────────────────────────

describe('getMonthlyUsage()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns { total: 0 } when no data exists', async () => {
    mockHgetall.mockResolvedValue(null)
    const usage = await getMonthlyUsage('dev-1')
    expect(usage).toEqual({ total: 0 })
  })

  it('parses hash fields into numbers', async () => {
    mockHgetall.mockResolvedValue({
      total: '42',
      'adapter:acme-hotels': '30',
      'endpoint:search': '35',
    })
    const usage = await getMonthlyUsage('dev-1')
    expect(usage.total).toBe(42)
    expect(usage['adapter:acme-hotels']).toBe(30)
    expect(usage['endpoint:search']).toBe(35)
  })

  it('accepts an explicit month parameter', async () => {
    mockHgetall.mockResolvedValue({ total: '5' })
    const usage = await getMonthlyUsage('dev-1', '202601')
    expect(usage.total).toBe(5)
    expect(mockHgetall).toHaveBeenCalledWith(expect.stringContaining('202601'))
  })

  it('uses current month when no month param provided', async () => {
    mockHgetall.mockResolvedValue({ total: '10' })
    await getMonthlyUsage('dev-1')
    const now = new Date()
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    expect(mockHgetall).toHaveBeenCalledWith(expect.stringContaining(ym))
  })
})
