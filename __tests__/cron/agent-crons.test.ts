/**
 * Phase 11 cron routes — auth + delegation tests for:
 *   /api/cron/agent-tasks, /api/cron/watchlist, /api/cron/life-events
 * The underlying lib functions are mocked; we verify cron-secret enforcement
 * and that each route delegates and returns the result.
 */
export {}

const mockRunDueTasks = jest.fn()
const mockScanDueWatches = jest.fn()
const mockScanAllLifeEvents = jest.fn()

jest.mock('@/lib/agents/taskRunner', () => ({ runDueTasks: (...a: unknown[]) => mockRunDueTasks(...a) }))
jest.mock('@/lib/agents/watchlist', () => ({ scanDueWatches: (...a: unknown[]) => mockScanDueWatches(...a) }))
jest.mock('@/lib/agents/lifeEvents', () => ({ scanAllLifeEvents: (...a: unknown[]) => mockScanAllLifeEvents(...a) }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import { GET as agentTasksGET } from '@/app/api/cron/agent-tasks/route'
import { GET as watchlistGET } from '@/app/api/cron/watchlist/route'
import { GET as lifeEventsGET } from '@/app/api/cron/life-events/route'
import type { NextRequest } from 'next/server'

const CRON_SECRET = 'test-cron-secret'

function req(path: string, secret: string | null): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  }) as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  mockRunDueTasks.mockResolvedValue({ picked: 2, succeeded: 1, failed: 0, running: 1, awaiting: 0 })
  mockScanDueWatches.mockResolvedValue({ scanned: 3, alerts: 1 })
  mockScanAllLifeEvents.mockResolvedValue({ users: 5, created: 2 })
})
afterEach(() => { delete process.env.CRON_SECRET })

describe('cron auth', () => {
  it('rejects all three routes without the secret', async () => {
    expect((await agentTasksGET(req('/api/cron/agent-tasks', null))).status).toBe(401)
    expect((await watchlistGET(req('/api/cron/watchlist', 'wrong'))).status).toBe(401)
    expect((await lifeEventsGET(req('/api/cron/life-events', null))).status).toBe(401)
  })

  it('does not call the lib functions when unauthorized', async () => {
    await agentTasksGET(req('/api/cron/agent-tasks', null))
    expect(mockRunDueTasks).not.toHaveBeenCalled()
  })
})

describe('cron delegation', () => {
  it('agent-tasks drains and returns counts', async () => {
    const res = await agentTasksGET(req('/api/cron/agent-tasks', CRON_SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ picked: 2, succeeded: 1, failed: 0, running: 1, awaiting: 0 })
    expect(mockRunDueTasks).toHaveBeenCalled()
  })

  it('watchlist scans and returns counts', async () => {
    const res = await watchlistGET(req('/api/cron/watchlist', CRON_SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ scanned: 3, alerts: 1 })
  })

  it('life-events scans and returns counts', async () => {
    const res = await lifeEventsGET(req('/api/cron/life-events', CRON_SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ users: 5, created: 2 })
  })

  it('returns 500 when the underlying job throws', async () => {
    mockRunDueTasks.mockRejectedValueOnce(new Error('db down'))
    const res = await agentTasksGET(req('/api/cron/agent-tasks', CRON_SECRET))
    expect(res.status).toBe(500)
  })
})
