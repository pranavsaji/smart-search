export {}

// ─── Auth mocks ─────────────────────────────────────────────────────────────

const mockRequireUserId = jest.fn()
jest.mock('@/lib/api/auth', () => ({ requireUserId: (...a: unknown[]) => mockRequireUserId(...a) }))

const mockAuth = jest.fn()
jest.mock('@/lib/auth', () => ({ auth: (...a: unknown[]) => mockAuth(...a) }))

// ─── Lib mocks ──────────────────────────────────────────────────────────────

const mockVendorAnalytics = jest.fn()
const mockRealtimeFeed = jest.fn()
const mockCategoryDemand = jest.fn()
jest.mock('@/lib/analytics/intentSignals', () => ({
  vendorAnalytics: (...a: unknown[]) => mockVendorAnalytics(...a),
  realtimeIntentFeed: (...a: unknown[]) => mockRealtimeFeed(...a),
  categoryDemand: (...a: unknown[]) => mockCategoryDemand(...a),
}))

const mockGetUserInsights = jest.fn()
const mockGenerateReport = jest.fn()
jest.mock('@/lib/insights/generate', () => ({
  getUserInsights: (...a: unknown[]) => mockGetUserInsights(...a),
  generateInsightReport: (...a: unknown[]) => mockGenerateReport(...a),
}))

const mockListExperiments = jest.fn()
const mockCreateExperiment = jest.fn()
const mockGetExperiment = jest.fn()
const mockAssignAndExpose = jest.fn()
const mockExperimentResults = jest.fn()
jest.mock('@/lib/ranking/experiments', () => ({
  listExperiments: (...a: unknown[]) => mockListExperiments(...a),
  createExperiment: (...a: unknown[]) => mockCreateExperiment(...a),
  getExperiment: (...a: unknown[]) => mockGetExperiment(...a),
  assignAndExpose: (...a: unknown[]) => mockAssignAndExpose(...a),
  experimentResults: (...a: unknown[]) => mockExperimentResults(...a),
}))

const mockRelated = jest.fn()
const mockComplete = jest.fn()
jest.mock('@/lib/graph/knowledgeGraph', () => ({
  relatedEntities: (...a: unknown[]) => mockRelated(...a),
  completeTheTrip: (...a: unknown[]) => mockComplete(...a),
}))

jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { GET as analyticsGET } from '@/app/api/analytics/route'
import { GET as feedGET } from '@/app/api/analytics/feed/route'
import { GET as insightsGET, POST as insightsPOST } from '@/app/api/insights/route'
import { GET as expGET, POST as expPOST } from '@/app/api/experiments/route'
import { GET as expOneGET } from '@/app/api/experiments/[key]/route'
import { GET as graphGET } from '@/app/api/graph/related/route'
import type { NextRequest } from 'next/server'

function req(url: string, method = 'GET', body?: unknown): NextRequest {
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
  mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'admin@smartsearch.app' } })
})

// ─── /api/analytics ────────────────────────────────────────────────────────────

describe('GET /api/analytics', () => {
  it('401 when unauthenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/response')
    mockRequireUserId.mockRejectedValueOnce(new UnauthorizedError())
    expect((await analyticsGET(req('http://x/api/analytics?vendorId=v1'))).status).toBe(401)
  })

  it('400 without vendorId', async () => {
    expect((await analyticsGET(req('http://x/api/analytics'))).status).toBe(400)
  })

  it('404 when vendor analytics is null', async () => {
    mockVendorAnalytics.mockResolvedValue(null)
    expect((await analyticsGET(req('http://x/api/analytics?vendorId=v1'))).status).toBe(404)
  })

  it('200 with analytics', async () => {
    mockVendorAnalytics.mockResolvedValue({ vendorId: 'v1', category: 'products' })
    const res = await analyticsGET(req('http://x/api/analytics?vendorId=v1'))
    expect(res.status).toBe(200)
    expect((await res.json()).category).toBe('products')
  })
})

// ─── /api/analytics/feed ────────────────────────────────────────────────────────

describe('GET /api/analytics/feed', () => {
  it('returns feed + demand', async () => {
    mockRealtimeFeed.mockResolvedValue([{ destination: 'Paris' }])
    mockCategoryDemand.mockResolvedValue([{ activityType: 'flights' }])
    const res = await feedGET(req('http://x/api/analytics/feed?activityType=flights&limit=10'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.feed).toHaveLength(1)
    expect(body.demand).toHaveLength(1)
  })

  it('400 on an invalid activityType', async () => {
    expect((await feedGET(req('http://x/api/analytics/feed?activityType=bogus'))).status).toBe(400)
  })
})

// ─── /api/insights ───────────────────────────────────────────────────────────

describe('/api/insights', () => {
  it('GET returns reports + latest', async () => {
    mockGetUserInsights.mockResolvedValue([{ reportId: 'r1' }, { reportId: 'r2' }])
    const res = await insightsGET(req('http://x/api/insights'))
    const body = await res.json()
    expect(body.reports).toHaveLength(2)
    expect(body.latest.reportId).toBe('r1')
  })

  it('POST force-generates a report', async () => {
    mockGenerateReport.mockResolvedValue({ reportId: 'r1' })
    const res = await insightsPOST(req('http://x/api/insights', 'POST'))
    expect(res.status).toBe(201)
    expect(mockGenerateReport).toHaveBeenCalledWith('user-1', { force: true })
  })
})

// ─── /api/experiments ────────────────────────────────────────────────────────

describe('/api/experiments', () => {
  it('GET lists experiments', async () => {
    mockListExperiments.mockResolvedValue([{ key: 'e1' }])
    const res = await expGET(req('http://x/api/experiments'))
    expect((await res.json()).experiments).toHaveLength(1)
  })

  it('POST is forbidden for non-admins', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'nobody@x.com' } })
    const res = await expPOST(req('http://x/api/experiments', 'POST', {
      key: 'e1', name: 'Exp', variants: [{ name: 'a', allocation: 0.5 }, { name: 'b', allocation: 0.5 }],
    }))
    expect(res.status).toBe(403)
  })

  it('POST creates for an admin', async () => {
    process.env.ADMIN_EMAILS = 'admin@smartsearch.app'
    mockCreateExperiment.mockResolvedValue({ key: 'e1' })
    const res = await expPOST(req('http://x/api/experiments', 'POST', {
      key: 'e1', name: 'Exp', variants: [{ name: 'a', allocation: 0.5 }, { name: 'b', allocation: 0.5 }],
    }))
    expect(res.status).toBe(201)
  })

  it('GET [key] returns 404 for missing experiment', async () => {
    mockGetExperiment.mockResolvedValue(null)
    const res = await expOneGET(req('http://x/api/experiments/e1'), { params: p({ key: 'e1' }) })
    expect(res.status).toBe(404)
  })

  it('GET [key] returns assignment + results', async () => {
    mockGetExperiment.mockResolvedValue({ key: 'e1', active: true })
    mockAssignAndExpose.mockResolvedValue({ name: 'treatment', allocation: 0.5 })
    mockExperimentResults.mockResolvedValue([{ variant: 'treatment', exposures: 1, conversions: 0, conversionRate: 0 }])
    const res = await expOneGET(req('http://x/api/experiments/e1'), { params: p({ key: 'e1' }) })
    const body = await res.json()
    expect(body.assignment.name).toBe('treatment')
    expect(body.results).toHaveLength(1)
  })
})

// ─── /api/graph/related ──────────────────────────────────────────────────────

describe('GET /api/graph/related', () => {
  it('400 without a nodeKey', async () => {
    expect((await graphGET(req('http://x/api/graph/related'))).status).toBe(400)
  })

  it('related mode calls relatedEntities', async () => {
    mockRelated.mockResolvedValue([{ nodeKey: 'activity:stays' }])
    const res = await graphGET(req('http://x/api/graph/related?nodeKey=destination:paris&mode=related'))
    expect(res.status).toBe(200)
    expect(mockRelated).toHaveBeenCalled()
    expect((await res.json()).related).toHaveLength(1)
  })

  it('complete mode calls completeTheTrip', async () => {
    mockComplete.mockResolvedValue([{ nodeKey: 'activity:stays' }])
    const res = await graphGET(req('http://x/api/graph/related?nodeKey=destination:paris&mode=complete'))
    expect(res.status).toBe(200)
    expect(mockComplete).toHaveBeenCalled()
  })
})
