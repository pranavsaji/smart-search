export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockDeleteOne = jest.fn()

const mockCollection = jest.fn((_name: string) => ({
  insertOne: mockInsertOne,
  findOne: mockFindOne,
  deleteOne: mockDeleteOne,
}))

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({ collection: mockCollection })),
  COLLECTIONS: {
    oauthApps: 'oauth_apps',
    oauthTokens: 'oauth_tokens',
  },
}))

const mockRedisSet = jest.fn()
const mockRedisGet = jest.fn()
const mockRedisDel = jest.fn()

jest.mock('@/lib/cache/redis', () => ({
  redis: {
    set: (...a: unknown[]) => mockRedisSet(...a),
    get: (...a: unknown[]) => mockRedisGet(...a),
    del: (...a: unknown[]) => mockRedisDel(...a),
  },
  RedisKeys: jest.requireActual('@/lib/cache/redis').RedisKeys,
}))

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mockednanoid12345') }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import {
  registerOAuthApp,
  getOAuthApp,
  issueAuthCode,
  exchangeCodeForTokens,
  refreshAccessToken,
  validateAccessToken,
  revokeToken,
} from '@/lib/ecosystem/oauth'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(t: string): string {
  return crypto.createHash('sha256').update(t).digest('hex')
}

function makePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// ─── registerOAuthApp() ───────────────────────────────────────────────────────

describe('registerOAuthApp()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('inserts the app and returns raw clientSecret (not hashed)', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const { app, clientSecret } = await registerOAuthApp(
      'dev-1', 'My App', ['https://example.com/cb'], ['profile.read']
    )

    expect(typeof clientSecret).toBe('string')
    expect(clientSecret.length).toBeGreaterThan(10)
    // clientSecret is the raw value — app stores the hash
    expect(app.clientSecret).not.toBe(clientSecret)
    expect(app.clientSecret).toBe(hashToken(clientSecret))
  })

  it('inserts with correct developer and scopes', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const { app } = await registerOAuthApp(
      'dev-42', 'Test App', ['https://test.com/cb'], ['bookings.read', 'checkout.write']
    )

    expect(app.developerId).toBe('dev-42')
    expect(app.scopes).toEqual(['bookings.read', 'checkout.write'])
    expect(app.isActive).toBe(true)
  })

  it('app.clientSecret is a SHA-256 hex hash of clientSecret', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const { app, clientSecret } = await registerOAuthApp(
      'dev-1', 'App', ['https://x.com/cb'], ['profile.read']
    )
    expect(app.clientSecret).toMatch(/^[a-f0-9]{64}$/)
    expect(app.clientSecret).toBe(hashToken(clientSecret))
  })

  it('clientSecret is not stored in plain text in DB', async () => {
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    const { clientSecret } = await registerOAuthApp(
      'dev-1', 'App', ['https://x.com/cb'], ['profile.read']
    )
    const insertedDoc = mockInsertOne.mock.calls[0][0]
    expect(insertedDoc.clientSecret).not.toBe(clientSecret)
  })
})

// ─── getOAuthApp() ────────────────────────────────────────────────────────────

describe('getOAuthApp()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns app when found', async () => {
    const fakeApp = { clientId: 'client-1', isActive: true, name: 'Test App' }
    mockFindOne.mockResolvedValue(fakeApp)
    const app = await getOAuthApp('client-1')
    expect(app?.name).toBe('Test App')
  })

  it('returns null for unknown clientId', async () => {
    mockFindOne.mockResolvedValue(null)
    const app = await getOAuthApp('nonexistent')
    expect(app).toBeNull()
  })

  it('queries with isActive: true filter', async () => {
    mockFindOne.mockResolvedValue(null)
    await getOAuthApp('client-x')
    expect(mockFindOne).toHaveBeenCalledWith({ clientId: 'client-x', isActive: true })
  })
})

// ─── issueAuthCode() ─────────────────────────────────────────────────────────

describe('issueAuthCode()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('stores code in Redis with correct TTL', async () => {
    mockRedisSet.mockResolvedValue('OK')
    const { challenge } = makePKCE()

    const code = await issueAuthCode({
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['profile.read'],
      codeChallenge: challenge,
      redirectUri: 'https://example.com/cb',
    })

    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(10)
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining(code),
      expect.any(String),
      { ex: 600 } // 10 min TTL
    )
  })

  it('stores payload JSON in Redis', async () => {
    mockRedisSet.mockResolvedValue('OK')
    const { challenge } = makePKCE()

    await issueAuthCode({
      userId: 'user-99',
      clientId: 'client-99',
      scopes: ['bookings.read'],
      codeChallenge: challenge,
      redirectUri: 'https://example.com/cb',
    })

    const storedValue = mockRedisSet.mock.calls[0][1]
    const parsed = JSON.parse(storedValue)
    expect(parsed.userId).toBe('user-99')
    expect(parsed.clientId).toBe('client-99')
  })
})

// ─── exchangeCodeForTokens() ──────────────────────────────────────────────────

describe('exchangeCodeForTokens()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns tokens when code + verifier + redirectUri match', async () => {
    const { verifier, challenge } = makePKCE()
    const payload = {
      userId: 'u1', clientId: 'c1', scopes: ['profile.read'],
      codeChallenge: challenge, redirectUri: 'https://example.com/cb',
    }
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(payload))
    mockRedisDel.mockResolvedValue(1)
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    mockRedisSet.mockResolvedValue('OK')

    const tokens = await exchangeCodeForTokens('valid-code', verifier, 'https://example.com/cb')
    expect(tokens.accessToken).toBeTruthy()
    expect(tokens.refreshToken).toBeTruthy()
    expect(tokens.expiresIn).toBe(3600)
    expect(tokens.scopes).toEqual(['profile.read'])
  })

  it('throws invalid_grant when code not found', async () => {
    mockRedisGet.mockResolvedValue(null)
    await expect(
      exchangeCodeForTokens('bad-code', 'verifier', 'https://example.com/cb')
    ).rejects.toThrow('invalid_grant')
  })

  it('throws invalid_grant when PKCE challenge fails', async () => {
    const { challenge } = makePKCE()
    const payload = {
      userId: 'u1', clientId: 'c1', scopes: ['profile.read'],
      codeChallenge: challenge, redirectUri: 'https://example.com/cb',
    }
    mockRedisGet.mockResolvedValue(JSON.stringify(payload))

    await expect(
      exchangeCodeForTokens('valid-code', 'wrong-verifier', 'https://example.com/cb')
    ).rejects.toThrow('invalid_grant')
  })

  it('throws invalid_grant when redirectUri mismatches', async () => {
    const { verifier, challenge } = makePKCE()
    const payload = {
      userId: 'u1', clientId: 'c1', scopes: ['profile.read'],
      codeChallenge: challenge, redirectUri: 'https://example.com/cb',
    }
    mockRedisGet.mockResolvedValue(JSON.stringify(payload))

    await expect(
      exchangeCodeForTokens('valid-code', verifier, 'https://DIFFERENT.com/cb')
    ).rejects.toThrow('invalid_grant')
  })

  it('deletes code from Redis (one-time use)', async () => {
    const { verifier, challenge } = makePKCE()
    const payload = {
      userId: 'u1', clientId: 'c1', scopes: ['profile.read'],
      codeChallenge: challenge, redirectUri: 'https://example.com/cb',
    }
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(payload))
    mockRedisDel.mockResolvedValue(1)
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    mockRedisSet.mockResolvedValue('OK')

    await exchangeCodeForTokens('used-code', verifier, 'https://example.com/cb')
    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining('used-code'))
  })
})

// ─── refreshAccessToken() ─────────────────────────────────────────────────────

describe('refreshAccessToken()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns new tokens when valid refresh token', async () => {
    const refreshToken = crypto.randomBytes(40).toString('base64url')
    const tokenRecord = {
      tokenId: 'tid-1',
      userId: 'u1',
      clientId: 'c1',
      scopes: ['profile.read'],
      accessTokenHash: 'hash',
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 86400 * 1000),
      createdAt: new Date(),
    }
    mockFindOne.mockResolvedValue(tokenRecord)
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    mockRedisSet.mockResolvedValue('OK')

    const tokens = await refreshAccessToken(refreshToken)
    expect(tokens.accessToken).toBeTruthy()
    expect(tokens.refreshToken).toBeTruthy()
    expect(tokens.scopes).toEqual(['profile.read'])
  })

  it('throws invalid_grant for expired/unknown token', async () => {
    mockFindOne.mockResolvedValue(null)
    await expect(
      refreshAccessToken('expired-or-unknown')
    ).rejects.toThrow('invalid_grant')
  })

  it('refresh token is not stored in plain text', async () => {
    const { verifier, challenge } = makePKCE()
    const payload = {
      userId: 'u1', clientId: 'c1', scopes: ['profile.read'],
      codeChallenge: challenge, redirectUri: 'https://example.com/cb',
    }
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(payload))
    mockRedisDel.mockResolvedValue(1)
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    mockRedisSet.mockResolvedValue('OK')

    const tokens = await exchangeCodeForTokens('code', verifier, 'https://example.com/cb')
    const insertedDoc = mockInsertOne.mock.calls[0][0]
    expect(insertedDoc.refreshTokenHash).not.toBe(tokens.refreshToken)
    expect(insertedDoc.refreshTokenHash).toBe(hashToken(tokens.refreshToken))
  })

  it('access token is not stored in plain text', async () => {
    const { verifier, challenge } = makePKCE()
    const payload = {
      userId: 'u1', clientId: 'c1', scopes: ['profile.read'],
      codeChallenge: challenge, redirectUri: 'https://example.com/cb',
    }
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(payload))
    mockRedisDel.mockResolvedValue(1)
    mockInsertOne.mockResolvedValue({ insertedId: 'oid' })
    mockRedisSet.mockResolvedValue('OK')

    const tokens = await exchangeCodeForTokens('code2', verifier, 'https://example.com/cb')
    const insertedDoc = mockInsertOne.mock.calls[0][0]
    expect(insertedDoc.accessTokenHash).not.toBe(tokens.accessToken)
    expect(insertedDoc.accessTokenHash).toBe(hashToken(tokens.accessToken))
  })
})

// ─── validateAccessToken() ────────────────────────────────────────────────────

describe('validateAccessToken()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns user info from Redis cache (fast path)', async () => {
    const cached = { userId: 'u1', scopes: ['profile.read'], clientId: 'c1' }
    mockRedisGet.mockResolvedValue(JSON.stringify(cached))

    const result = await validateAccessToken('some-token')
    expect(result?.userId).toBe('u1')
    expect(result?.scopes).toEqual(['profile.read'])
    expect(result?.clientId).toBe('c1')
  })

  it('returns null for expired/unknown token (Redis miss + DB miss)', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockFindOne.mockResolvedValue(null)

    const result = await validateAccessToken('bad-token')
    expect(result).toBeNull()
  })

  it('falls back to DB when Redis cache misses', async () => {
    mockRedisGet.mockResolvedValue(null)
    const dbRecord = {
      userId: 'u2', clientId: 'c2',
      scopes: ['bookings.read'],
      accessTokenHash: hashToken('db-token'),
      expiresAt: new Date(Date.now() + 3600 * 1000),
    }
    mockFindOne.mockResolvedValue(dbRecord)

    const result = await validateAccessToken('db-token')
    expect(result?.userId).toBe('u2')
  })
})

// ─── revokeToken() ────────────────────────────────────────────────────────────

describe('revokeToken()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deletes from Redis', async () => {
    mockRedisDel.mockResolvedValue(1)
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 })

    await revokeToken('my-token')
    expect(mockRedisDel).toHaveBeenCalledWith(
      expect.stringContaining(hashToken('my-token'))
    )
  })

  it('deletes from MongoDB', async () => {
    mockRedisDel.mockResolvedValue(1)
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 })

    await revokeToken('my-token')
    expect(mockDeleteOne).toHaveBeenCalledWith(
      expect.objectContaining({ $or: expect.any(Array) })
    )
  })

  it('removes by accessTokenHash or refreshTokenHash', async () => {
    mockRedisDel.mockResolvedValue(1)
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 })

    const token = 'test-revoke-token'
    await revokeToken(token)
    const deleteFilter = mockDeleteOne.mock.calls[0][0]
    const hashes = deleteFilter.$or.map((c: Record<string, string>) =>
      Object.values(c)[0]
    )
    expect(hashes).toContain(hashToken(token))
  })
})
