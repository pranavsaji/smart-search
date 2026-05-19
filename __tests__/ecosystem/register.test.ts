export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockFind = jest.fn()
const mockUpdateOne = jest.fn()
const mockReplaceOne = jest.fn()
const mockAggregate = jest.fn()

// Each collection returns its own mock object — keyed by collection name
const collectionMocks: Record<string, ReturnType<typeof makeCollectionMock>> = {}

function makeCollectionMock() {
  return {
    insertOne: mockInsertOne,
    findOne: mockFindOne,
    find: mockFind,
    updateOne: mockUpdateOne,
    replaceOne: mockReplaceOne,
    aggregate: mockAggregate,
  }
}

const mockCollection = jest.fn((name: string) => {
  if (!collectionMocks[name]) collectionMocks[name] = makeCollectionMock()
  return collectionMocks[name]
})

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({ collection: mockCollection })),
  COLLECTIONS: {
    developerAccounts: 'developer_accounts',
    developerKeys:     'developer_keys',
    adapterRegistry:   'adapter_registry',
    adapterRatings:    'adapter_ratings',
  },
}))

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/ecosystem/keys', () => ({
  generateApiKey: jest.fn(() => ({ raw: 'iam_rawkey1234567890ab', hash: 'hashofkey', prefix: 'iam_rawkey1' })),
  generateKeyId: jest.fn(() => 'keyid-abc-123'),
  tierMonthlyLimit: jest.fn((tier: string) => tier === 'free' ? 1000 : 10000),
}))

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mocknanoid12345') }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { POST as registerPOST, GET as registerGET } from '@/app/api/ecosystem/register/route'
import { POST as keysPOST, GET as keysGET } from '@/app/api/ecosystem/keys/route'
import { GET as adapterGET, POST as adapterPOST } from '@/app/api/ecosystem/adapters/route'
import { DELETE as keyDELETE } from '@/app/api/ecosystem/keys/[keyId]/route'
import { POST as ratePOST } from '@/app/api/ecosystem/adapters/[adapterId]/rate/route'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as jest.MockedFunction<(...args: any[]) => any>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body?: unknown, url = 'http://localhost/api/ecosystem/register'): NextRequest {
  return new NextRequest(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockSession(userId = 'user-1') {
  mockAuth.mockResolvedValue({ user: { id: userId, name: 'Dev User', email: 'dev@test.com' } } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
}

function mockNoSession() {
  mockAuth.mockResolvedValue(null)
}

function makeCursor(rows: unknown[]) {
  const toArray = jest.fn().mockResolvedValue(rows)
  const sort = jest.fn().mockReturnValue({ toArray })
  return { sort, toArray }
}

// ─── POST /api/ecosystem/register ────────────────────────────────────────────

describe('POST /api/ecosystem/register', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a developer account and returns 201', async () => {
    mockSession()
    mockFindOne.mockResolvedValue(null) // no existing account
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })

    const req = makeRequest({ name: 'Alice Dev', email: 'alice@example.com' })
    const res = await registerPOST(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.tier).toBe('free')
    expect(body.userId).toBe('user-1')
    expect(body.name).toBe('Alice Dev')
  })

  it('returns 401 when not authenticated', async () => {
    mockNoSession()
    const req = makeRequest({ name: 'Alice Dev', email: 'alice@example.com' })
    const res = await registerPOST(req)
    expect(res.status).toBe(401)
  })

  it('returns 409 if developer account already exists', async () => {
    mockSession()
    mockFindOne.mockResolvedValue({ developerId: 'existing-dev', userId: 'user-1' })

    const req = makeRequest({ name: 'Alice Dev', email: 'alice@example.com' })
    const res = await registerPOST(req)
    expect(res.status).toBe(409)
  })

  it('returns 400 for invalid request body', async () => {
    mockSession()
    const req = makeRequest({ name: 'A' }) // name too short, missing email
    const res = await registerPOST(req)
    expect(res.status).toBe(400)
  })
})

// ─── GET /api/ecosystem/register ─────────────────────────────────────────────

describe('GET /api/ecosystem/register', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns existing account for authenticated user', async () => {
    mockSession()
    const account = { developerId: 'dev-1', userId: 'user-1', name: 'Alice Dev', tier: 'free' }
    mockFindOne.mockResolvedValue(account)

    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/register')
    const res = await registerGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.account.developerId).toBe('dev-1')
  })

  it('returns { account: null } when no account found', async () => {
    mockSession()
    mockFindOne.mockResolvedValue(null)

    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/register')
    const res = await registerGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.account).toBeNull()
  })

  it('returns 401 when not authenticated', async () => {
    mockNoSession()
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/register')
    const res = await registerGET(req)
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/ecosystem/keys ─────────────────────────────────────────────────

describe('POST /api/ecosystem/keys', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a key and returns rawKey once', async () => {
    mockSession()
    mockFindOne.mockResolvedValue({ developerId: 'dev-1', tier: 'free' })
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    mockFind.mockReturnValue(makeCursor([]))

    const req = makeRequest({ name: 'Production' }, 'http://localhost/api/ecosystem/keys')
    const res = await keysPOST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.rawKey).toBe('iam_rawkey1234567890ab')
    expect(body.keyHash).toBeUndefined() // hash stripped
    expect(body.prefix).toBe('iam_rawkey1')
  })

  it('returns 401 when not authenticated', async () => {
    mockNoSession()
    const req = makeRequest({ name: 'Production' }, 'http://localhost/api/ecosystem/keys')
    const res = await keysPOST(req)
    expect(res.status).toBe(401)
  })

  it('returns 404 when developer account does not exist', async () => {
    mockSession()
    mockFindOne.mockResolvedValue(null) // no dev account
    const req = makeRequest({ name: 'Production' }, 'http://localhost/api/ecosystem/keys')
    const res = await keysPOST(req)
    expect(res.status).toBe(404)
  })
})

// ─── GET /api/ecosystem/keys ─────────────────────────────────────────────────

describe('GET /api/ecosystem/keys', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns list of keys without keyHash', async () => {
    mockSession()
    mockFindOne.mockResolvedValue({ developerId: 'dev-1', tier: 'free' })
    const keys = [
      { keyId: 'k1', developerId: 'dev-1', name: 'Prod', keyHash: 'secrethash', prefix: 'iam_abc1' },
    ]
    mockFind.mockReturnValue(makeCursor(keys))

    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/keys')
    const res = await keysGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].keyHash).toBeUndefined()
    expect(body[0].prefix).toBe('iam_abc1')
  })
})

// ─── DELETE /api/ecosystem/keys/[keyId] ──────────────────────────────────────

describe('DELETE /api/ecosystem/keys/[keyId]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('revokes key when ownership matches', async () => {
    mockSession()
    // findOne called twice: once for account, once for key
    mockFindOne
      .mockResolvedValueOnce({ developerId: 'dev-1', userId: 'user-1' }) // account
      .mockResolvedValueOnce({ keyId: 'k1', developerId: 'dev-1', isActive: true }) // key
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })

    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/keys/k1')
    const res = await keyDELETE(req, { params: Promise.resolve({ keyId: 'k1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revoked).toBe(true)
  })

  it('returns 403 when key belongs to another developer', async () => {
    mockSession()
    mockFindOne
      .mockResolvedValueOnce({ developerId: 'dev-1', userId: 'user-1' }) // account
      .mockResolvedValueOnce({ keyId: 'k1', developerId: 'dev-OTHER' }) // key belongs to someone else
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/keys/k1')
    const res = await keyDELETE(req, { params: Promise.resolve({ keyId: 'k1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when key does not exist', async () => {
    mockSession()
    mockFindOne
      .mockResolvedValueOnce({ developerId: 'dev-1', userId: 'user-1' })
      .mockResolvedValueOnce(null) // key not found
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/keys/nope')
    const res = await keyDELETE(req, { params: Promise.resolve({ keyId: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('returns 401 when not authenticated', async () => {
    mockNoSession()
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/keys/k1')
    const res = await keyDELETE(req, { params: Promise.resolve({ keyId: 'k1' }) })
    expect(res.status).toBe(401)
  })
})

// ─── GET /api/ecosystem/adapters ─────────────────────────────────────────────

describe('GET /api/ecosystem/adapters', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns approved adapters with auth secrets stripped', async () => {
    const adapters = [
      {
        adapterId: 'acme-hotels-abc123', name: 'Acme Hotels', status: 'approved',
        auth: { type: 'bearer', token: 'super-secret' }, category: 'travel',
      },
    ]
    mockFind.mockReturnValue(makeCursor(adapters))

    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/adapters')
    const res = await adapterGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].auth.token).toBeUndefined() // secret stripped
    expect(body[0].auth.type).toBe('bearer')
  })

  it('does not require authentication', async () => {
    mockNoSession()
    mockFind.mockReturnValue(makeCursor([]))
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/adapters')
    const res = await adapterGET(req)
    expect(res.status).toBe(200)
  })

  it('filters by category when provided', async () => {
    mockFind.mockReturnValue(makeCursor([]))
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/adapters?category=travel')
    await adapterGET(req)
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', category: 'travel' })
    )
  })

  it('filters by featured=true when param provided', async () => {
    mockFind.mockReturnValue(makeCursor([]))
    const req = makeRequest(undefined, 'http://localhost/api/ecosystem/adapters?featured=true')
    await adapterGET(req)
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ featured: true })
    )
  })
})

// ─── POST /api/ecosystem/adapters ────────────────────────────────────────────

describe('POST /api/ecosystem/adapters', () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    name: 'Acme Hotels',
    description: 'A hotel search and booking adapter for iAM',
    category: 'travel',
    endpoints: {
      search: 'https://api.acme.com/search',
      createOrder: 'https://api.acme.com/order',
    },
    auth: { type: 'bearer', token: 'my-secret-token' },
  }

  it('registers adapter with status=pending and returns 201', async () => {
    mockSession()
    mockFindOne.mockResolvedValue({ developerId: 'dev-1', userId: 'user-1' })
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })

    const req = makeRequest(validBody, 'http://localhost/api/ecosystem/adapters')
    const res = await adapterPOST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.auth.token).toBeUndefined() // secrets stripped
    expect(body.developerId).toBe('dev-1')
  })

  it('returns 401 when not authenticated', async () => {
    mockNoSession()
    const req = makeRequest(validBody, 'http://localhost/api/ecosystem/adapters')
    const res = await adapterPOST(req)
    expect(res.status).toBe(401)
  })

  it('returns 404 when no developer account exists', async () => {
    mockSession()
    mockFindOne.mockResolvedValue(null)
    const req = makeRequest(validBody, 'http://localhost/api/ecosystem/adapters')
    const res = await adapterPOST(req)
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid body (missing required fields)', async () => {
    mockSession()
    // Account must exist so the handler reaches Zod validation
    mockFindOne.mockResolvedValue({ developerId: 'dev-1', userId: 'user-1' })
    // Send incomplete body — missing description, endpoints, auth
    const req = makeRequest({ name: 'X' }, 'http://localhost/api/ecosystem/adapters')
    const res = await adapterPOST(req)
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/ecosystem/adapters/[adapterId]/rate ────────────────────────────

describe('POST /api/ecosystem/adapters/[adapterId]/rate', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upserts rating and updates aggregate', async () => {
    mockSession()
    mockFindOne.mockResolvedValue({ adapterId: 'acme-hotels', status: 'approved' })
    mockReplaceOne.mockResolvedValue({ upsertedCount: 1 })
    const aggToArray = jest.fn().mockResolvedValue([{ _id: null, avg: 4.5, count: 3 }])
    mockAggregate.mockReturnValue({ toArray: aggToArray })
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })

    const req = makeRequest({ score: 5, comment: 'Great adapter!' }, 'http://localhost/api/ecosystem/adapters/acme-hotels/rate')
    const res = await ratePOST(req, { params: Promise.resolve({ adapterId: 'acme-hotels' }) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.score).toBe(5)
    expect(body.adapterId).toBe('acme-hotels')
  })

  it('returns 401 when not authenticated', async () => {
    mockNoSession()
    const req = makeRequest({ score: 4 }, 'http://localhost/api/ecosystem/adapters/acme-hotels/rate')
    const res = await ratePOST(req, { params: Promise.resolve({ adapterId: 'acme-hotels' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when adapter not found or not approved', async () => {
    mockSession()
    mockFindOne.mockResolvedValue(null)
    const req = makeRequest({ score: 3 }, 'http://localhost/api/ecosystem/adapters/nonexistent/rate')
    const res = await ratePOST(req, { params: Promise.resolve({ adapterId: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid score (out of 1-5 range)', async () => {
    mockSession()
    const req = makeRequest({ score: 6 }, 'http://localhost/api/ecosystem/adapters/acme-hotels/rate')
    const res = await ratePOST(req, { params: Promise.resolve({ adapterId: 'acme-hotels' }) })
    expect(res.status).toBe(400)
  })

  it('uses upsert so one rating per user per adapter', async () => {
    mockSession()
    mockFindOne.mockResolvedValue({ adapterId: 'acme-hotels', status: 'approved' })
    mockReplaceOne.mockResolvedValue({ upsertedCount: 1 })
    const aggToArray = jest.fn().mockResolvedValue([{ _id: null, avg: 3.0, count: 1 }])
    mockAggregate.mockReturnValue({ toArray: aggToArray })
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 })

    const req = makeRequest({ score: 3 }, 'http://localhost/api/ecosystem/adapters/acme-hotels/rate')
    await ratePOST(req, { params: Promise.resolve({ adapterId: 'acme-hotels' }) })
    expect(mockReplaceOne).toHaveBeenCalledWith(
      { adapterId: 'acme-hotels', userId: 'user-1' },
      expect.any(Object),
      { upsert: true }
    )
  })
})
