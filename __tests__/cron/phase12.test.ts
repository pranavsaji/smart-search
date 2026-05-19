export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRollup = jest.fn()
jest.mock('@/lib/analytics/intentSignals', () => ({ computeDailyRollup: (...a: unknown[]) => mockRollup(...a) }))

const mockScanInsights = jest.fn()
jest.mock('@/lib/insights/generate', () => ({ scanAllWeeklyInsights: (...a: unknown[]) => mockScanInsights(...a) }))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { GET as rollupGET } from '@/app/api/cron/analytics-rollup/route'
import { GET as insightsCronGET } from '@/app/api/cron/weekly-insights/route'
import type { NextRequest } from 'next/server'

function cronReq(secret?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (secret) headers.Authorization = `Bearer ${secret}`
  return new Request('http://localhost/api/cron', { headers }) as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  mockRollup.mockResolvedValue({ scopes: 3 })
  mockScanInsights.mockResolvedValue({ users: 2, sent: 1 })
})

describe('cron auth', () => {
  it('analytics-rollup rejects a bad secret', async () => {
    const res = await rollupGET(cronReq('wrong'))
    expect(res.status).toBe(401)
    expect(mockRollup).not.toHaveBeenCalled()
  })

  it('weekly-insights rejects a missing secret', async () => {
    const res = await insightsCronGET(cronReq())
    expect(res.status).toBe(401)
    expect(mockScanInsights).not.toHaveBeenCalled()
  })
})

describe('analytics-rollup cron', () => {
  it('rolls up the previous day with the right secret', async () => {
    const res = await rollupGET(cronReq('test-secret'))
    expect(res.status).toBe(200)
    expect((await res.json()).scopes).toBe(3)
    expect(mockRollup).toHaveBeenCalledTimes(1)
    expect(mockRollup.mock.calls[0][0]).toBeInstanceOf(Date)
  })

  it('returns 500 on failure', async () => {
    mockRollup.mockRejectedValueOnce(new Error('boom'))
    const res = await rollupGET(cronReq('test-secret'))
    expect(res.status).toBe(500)
  })
})

describe('weekly-insights cron', () => {
  it('scans all users with the right secret', async () => {
    const res = await insightsCronGET(cronReq('test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toBe(2)
    expect(body.sent).toBe(1)
  })

  it('returns 500 on failure', async () => {
    mockScanInsights.mockRejectedValueOnce(new Error('boom'))
    const res = await insightsCronGET(cronReq('test-secret'))
    expect(res.status).toBe(500)
  })
})
