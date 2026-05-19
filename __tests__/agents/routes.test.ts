export {}

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockRequireUserId = jest.fn()
jest.mock('@/lib/api/auth', () => ({ requireUserId: (...a: unknown[]) => mockRequireUserId(...a) }))

// ─── Lib mocks ────────────────────────────────────────────────────────────────

const mockCreateTask = jest.fn()
const mockGetUserTasks = jest.fn()
const mockGetTask = jest.fn()
const mockCancelTask = jest.fn()
jest.mock('@/lib/agents/taskRunner', () => ({
  createTask: (...a: unknown[]) => mockCreateTask(...a),
  getUserTasks: (...a: unknown[]) => mockGetUserTasks(...a),
  getTask: (...a: unknown[]) => mockGetTask(...a),
  cancelTask: (...a: unknown[]) => mockCancelTask(...a),
}))

const mockCreateAndRun = jest.fn()
const mockGetUserNegotiations = jest.fn()
const mockGetNegotiation = jest.fn()
class BudgetError extends Error {}
jest.mock('@/lib/agents/negotiation', () => ({
  createAndRunNegotiation: (...a: unknown[]) => mockCreateAndRun(...a),
  getUserNegotiations: (...a: unknown[]) => mockGetUserNegotiations(...a),
  getNegotiation: (...a: unknown[]) => mockGetNegotiation(...a),
  BudgetError,
}))

const mockCreateWatch = jest.fn()
const mockGetUserWatchlist = jest.fn()
const mockGetWatch = jest.fn()
const mockDeactivateWatch = jest.fn()
const mockDeleteWatch = jest.fn()
jest.mock('@/lib/agents/watchlist', () => ({
  createWatch: (...a: unknown[]) => mockCreateWatch(...a),
  getUserWatchlist: (...a: unknown[]) => mockGetUserWatchlist(...a),
  getWatch: (...a: unknown[]) => mockGetWatch(...a),
  deactivateWatch: (...a: unknown[]) => mockDeactivateWatch(...a),
  deleteWatch: (...a: unknown[]) => mockDeleteWatch(...a),
}))

const mockGetUserLifeEvents = jest.fn()
const mockScanForUser = jest.fn()
const mockUpdateStatus = jest.fn()
const mockGetPrefs = jest.fn()
const mockSetPrefs = jest.fn()
jest.mock('@/lib/agents/lifeEvents', () => ({
  getUserLifeEvents: (...a: unknown[]) => mockGetUserLifeEvents(...a),
  scanLifeEventsForUser: (...a: unknown[]) => mockScanForUser(...a),
  updateLifeEventStatus: (...a: unknown[]) => mockUpdateStatus(...a),
  getLifeEventPreferences: (...a: unknown[]) => mockGetPrefs(...a),
  setLifeEventPreferences: (...a: unknown[]) => mockSetPrefs(...a),
}))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { GET as tasksGET, POST as tasksPOST } from '@/app/api/agents/tasks/route'
import { GET as taskGET, DELETE as taskDELETE } from '@/app/api/agents/tasks/[taskId]/route'
import { GET as negsGET, POST as negsPOST } from '@/app/api/agents/negotiations/route'
import { GET as negGET } from '@/app/api/agents/negotiations/[negotiationId]/route'
import { GET as watchGET, POST as watchPOST } from '@/app/api/watchlist/route'
import { GET as watchOneGET, PATCH as watchPATCH, DELETE as watchDELETE } from '@/app/api/watchlist/[watchId]/route'
import { GET as lifeGET, POST as lifePOST } from '@/app/api/life-events/route'
import { PATCH as lifePATCH } from '@/app/api/life-events/[eventId]/route'
import { GET as prefsGET, PUT as prefsPUT } from '@/app/api/life-events/preferences/route'
import type { NextRequest } from 'next/server'

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

const p = <T>(v: T) => Promise.resolve(v)

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireUserId.mockResolvedValue('user-1')
})

// ─── Auth gate (UnauthorizedError → 401 via withApiHandler) ───────────────────

describe('auth', () => {
  it('returns 401 when unauthenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/response')
    mockRequireUserId.mockRejectedValueOnce(new UnauthorizedError())
    const res = await tasksGET(jsonReq('http://localhost/api/agents/tasks', 'GET'))
    expect(res.status).toBe(401)
  })
})

// ─── Tasks ──────────────────────────────────────────────────────────────────

describe('agent tasks routes', () => {
  it('GET lists tasks', async () => {
    mockGetUserTasks.mockResolvedValue([{ taskId: 't1' }])
    const res = await tasksGET(jsonReq('http://localhost/api/agents/tasks', 'GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).tasks).toHaveLength(1)
  })

  it('POST creates a task', async () => {
    mockCreateTask.mockResolvedValue({ taskId: 't1', status: 'pending' })
    const res = await tasksPOST(jsonReq('http://localhost/api/agents/tasks', 'POST', {
      kind: 'find_cheapest', goal: 'cheap flight to Tokyo', constraints: { maxPriceCents: 50000 },
    }))
    expect(res.status).toBe(201)
    expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', kind: 'find_cheapest' }))
  })

  it('POST rejects an invalid kind (zod 400)', async () => {
    const res = await tasksPOST(jsonReq('http://localhost/api/agents/tasks', 'POST', { kind: 'bogus', goal: 'x' }))
    expect(res.status).toBe(400)
  })

  it('GET [taskId] returns 404 for missing task', async () => {
    mockGetTask.mockResolvedValue(null)
    const res = await taskGET(jsonReq('http://localhost/api/agents/tasks/t1', 'GET'), { params: p({ taskId: 't1' }) })
    expect(res.status).toBe(404)
  })

  it('GET [taskId] returns 403 for another user\'s task', async () => {
    mockGetTask.mockResolvedValue({ taskId: 't1', userId: 'someone-else' })
    const res = await taskGET(jsonReq('http://localhost/api/agents/tasks/t1', 'GET'), { params: p({ taskId: 't1' }) })
    expect(res.status).toBe(403)
  })

  it('DELETE cancels a task', async () => {
    mockCancelTask.mockResolvedValue(true)
    const res = await taskDELETE(jsonReq('http://localhost/api/agents/tasks/t1', 'DELETE'), { params: p({ taskId: 't1' }) })
    expect(res.status).toBe(200)
  })

  it('DELETE returns 404 when nothing was cancelled', async () => {
    mockCancelTask.mockResolvedValue(false)
    const res = await taskDELETE(jsonReq('http://localhost/api/agents/tasks/t1', 'DELETE'), { params: p({ taskId: 't1' }) })
    expect(res.status).toBe(404)
  })
})

// ─── Negotiations ─────────────────────────────────────────────────────────────

describe('negotiation routes', () => {
  it('POST runs a negotiation', async () => {
    mockCreateAndRun.mockResolvedValue({ negotiationId: 'n1', status: 'accepted' })
    const res = await negsPOST(jsonReq('http://localhost/api/agents/negotiations', 'POST', {
      vendorId: 'v1', vendorType: 'experiences', itemRef: 'o1', listPriceCents: 20000, maxBudgetCents: 15000,
    }))
    expect(res.status).toBe(201)
  })

  it('POST maps BudgetError to 400', async () => {
    mockCreateAndRun.mockRejectedValueOnce(new BudgetError('bad budget'))
    const res = await negsPOST(jsonReq('http://localhost/api/agents/negotiations', 'POST', {
      vendorId: 'v1', vendorType: 'experiences', itemRef: 'o1', listPriceCents: 20000, maxBudgetCents: 15000,
    }))
    expect(res.status).toBe(400)
  })

  it('GET lists negotiations', async () => {
    mockGetUserNegotiations.mockResolvedValue([{ negotiationId: 'n1' }])
    const res = await negsGET(jsonReq('http://localhost/api/agents/negotiations', 'GET'))
    expect((await res.json()).negotiations).toHaveLength(1)
  })

  it('GET [id] enforces ownership', async () => {
    mockGetNegotiation.mockResolvedValue({ negotiationId: 'n1', userId: 'other' })
    const res = await negGET(jsonReq('http://localhost/api/agents/negotiations/n1', 'GET'), { params: p({ negotiationId: 'n1' }) })
    expect(res.status).toBe(403)
  })
})

// ─── Watchlist ─────────────────────────────────────────────────────────────────

describe('watchlist routes', () => {
  it('POST creates a watch', async () => {
    mockCreateWatch.mockResolvedValue({ watchId: 'w1' })
    const res = await watchPOST(jsonReq('http://localhost/api/watchlist', 'POST', {
      target: { itemType: 'products', label: 'Headphones', query: {}, currency: 'GBP' },
      targetPriceCents: 9999,
    }))
    expect(res.status).toBe(201)
  })

  it('POST rejects an invalid itemType', async () => {
    const res = await watchPOST(jsonReq('http://localhost/api/watchlist', 'POST', {
      target: { itemType: 'spaceships', label: 'X', query: {} }, targetPriceCents: 100,
    }))
    expect(res.status).toBe(400)
  })

  it('GET lists watches with active filter', async () => {
    mockGetUserWatchlist.mockResolvedValue([{ watchId: 'w1' }])
    const res = await watchGET(jsonReq('http://localhost/api/watchlist?active=true', 'GET'))
    expect(res.status).toBe(200)
    expect(mockGetUserWatchlist).toHaveBeenCalledWith('user-1', { activeOnly: true })
  })

  it('PATCH deactivates a watch', async () => {
    mockDeactivateWatch.mockResolvedValue(true)
    const res = await watchPATCH(jsonReq('http://localhost/api/watchlist/w1', 'PATCH'), { params: p({ watchId: 'w1' }) })
    expect(res.status).toBe(200)
    expect((await res.json()).active).toBe(false)
  })

  it('DELETE removes a watch', async () => {
    mockDeleteWatch.mockResolvedValue(true)
    const res = await watchDELETE(jsonReq('http://localhost/api/watchlist/w1', 'DELETE'), { params: p({ watchId: 'w1' }) })
    expect(res.status).toBe(200)
  })

  it('GET [watchId] enforces ownership', async () => {
    mockGetWatch.mockResolvedValue({ watchId: 'w1', userId: 'other' })
    const res = await watchOneGET(jsonReq('http://localhost/api/watchlist/w1', 'GET'), { params: p({ watchId: 'w1' }) })
    expect(res.status).toBe(403)
  })
})

// ─── Life events ────────────────────────────────────────────────────────────

describe('life event routes', () => {
  it('GET lists events', async () => {
    mockGetUserLifeEvents.mockResolvedValue([{ eventId: 'e1' }])
    const res = await lifeGET(jsonReq('http://localhost/api/life-events', 'GET'))
    expect((await res.json()).events).toHaveLength(1)
  })

  it('POST scan triggers a scan', async () => {
    mockScanForUser.mockResolvedValue({ detected: 1, created: 1 })
    const res = await lifePOST(jsonReq('http://localhost/api/life-events', 'POST', { action: 'scan' }))
    expect(res.status).toBe(200)
    expect(mockScanForUser).toHaveBeenCalledWith('user-1')
  })

  it('PATCH updates status', async () => {
    mockUpdateStatus.mockResolvedValue(true)
    const res = await lifePATCH(jsonReq('http://localhost/api/life-events/e1', 'PATCH', { status: 'acknowledged' }), { params: p({ eventId: 'e1' }) })
    expect(res.status).toBe(200)
  })

  it('PATCH 404 when event missing', async () => {
    mockUpdateStatus.mockResolvedValue(false)
    const res = await lifePATCH(jsonReq('http://localhost/api/life-events/e1', 'PATCH', { status: 'dismissed' }), { params: p({ eventId: 'e1' }) })
    expect(res.status).toBe(404)
  })

  it('GET preferences (opt-in default)', async () => {
    mockGetPrefs.mockResolvedValue({ userId: 'user-1', enabled: false, disabledTypes: [] })
    const res = await prefsGET(jsonReq('http://localhost/api/life-events/preferences', 'GET'))
    expect((await res.json()).enabled).toBe(false)
  })

  it('PUT preferences enables', async () => {
    mockSetPrefs.mockResolvedValue({ userId: 'user-1', enabled: true, disabledTypes: [] })
    const res = await prefsPUT(jsonReq('http://localhost/api/life-events/preferences', 'PUT', { enabled: true }))
    expect((await res.json()).enabled).toBe(true)
  })
})
