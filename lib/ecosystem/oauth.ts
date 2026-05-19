import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { redis, RedisKeys } from '@/lib/cache/redis'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import type { OAuthApp, OAuthToken, OAuthScope } from './types'

export type { OAuthApp, OAuthToken, OAuthScope }

const CODE_TTL_SECS = 600             // 10 minutes
const ACCESS_TOKEN_TTL_SECS = 3600   // 1 hour
const REFRESH_TOKEN_TTL_DAYS = 30

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const codeKey = RedisKeys.oauthCode

// ─── App Registration ─────────────────────────────────────────────────────────

export async function registerOAuthApp(
  developerId: string,
  name: string,
  redirectUris: string[],
  scopes: OAuthScope[]
): Promise<{ app: OAuthApp; clientSecret: string }> {
  const db = await getDb()
  const rawSecret = crypto.randomBytes(32).toString('base64url')
  const app: OAuthApp = {
    clientId: nanoid(20),
    clientSecret: hashToken(rawSecret),
    developerId,
    name,
    redirectUris,
    scopes,
    isActive: true,
    createdAt: new Date(),
  }
  await db.collection(COLLECTIONS.oauthApps).insertOne({ _id: new ObjectId(), ...app })
  return { app, clientSecret: rawSecret }
}

export async function getOAuthApp(clientId: string): Promise<OAuthApp | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.oauthApps).findOne({ clientId, isActive: true })
  return doc as unknown as OAuthApp | null
}

// ─── Authorization Code Flow (PKCE) ──────────────────────────────────────────

export interface AuthCodePayload {
  userId: string
  clientId: string
  scopes: OAuthScope[]
  codeChallenge: string
  redirectUri: string
}

export async function issueAuthCode(payload: AuthCodePayload): Promise<string> {
  const code = crypto.randomBytes(32).toString('base64url')
  await redis.set(codeKey(code), JSON.stringify(payload), { ex: CODE_TTL_SECS })
  return code
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
  scopes: OAuthScope[]
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenPair> {
  const raw = await redis.get<string>(codeKey(code))
  if (!raw) throw new Error('invalid_grant')

  const payload: AuthCodePayload = JSON.parse(raw)
  if (payload.redirectUri !== redirectUri) throw new Error('invalid_grant')

  // PKCE: verify S256 code challenge
  const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  if (challenge !== payload.codeChallenge) throw new Error('invalid_grant')

  // Consume code — one-time use
  await redis.del(codeKey(code))

  return createTokenPair(payload.userId, payload.clientId, payload.scopes)
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const db = await getDb()
  const hash = hashToken(refreshToken)
  const record = await db.collection(COLLECTIONS.oauthTokens).findOne({
    refreshTokenHash: hash,
    expiresAt: { $gt: new Date() },
  }) as unknown as OAuthToken | null
  if (!record) throw new Error('invalid_grant')

  return createTokenPair(record.userId, record.clientId, record.scopes)
}

async function createTokenPair(
  userId: string,
  clientId: string,
  scopes: OAuthScope[]
): Promise<TokenPair> {
  const db = await getDb()

  const accessToken = crypto.randomBytes(32).toString('base64url')
  const refreshToken = crypto.randomBytes(40).toString('base64url')

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000)

  const record: OAuthToken = {
    tokenId: nanoid(16),
    userId,
    clientId,
    scopes,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
    createdAt: new Date(),
  }
  await db.collection(COLLECTIONS.oauthTokens).insertOne({ _id: new ObjectId(), ...record })

  // Cache access token in Redis for fast validation
  await redis.set(RedisKeys.oauthAccess(hashToken(accessToken)), JSON.stringify({ userId, scopes, clientId }), {
    ex: ACCESS_TOKEN_TTL_SECS,
  })

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECS, scopes }
}

export async function validateAccessToken(
  token: string
): Promise<{ userId: string; scopes: OAuthScope[]; clientId: string } | null> {
  const hash = hashToken(token)
  const cached = await redis.get<string>(RedisKeys.oauthAccess(hash))
  if (cached) return JSON.parse(cached)
  // Fallback: DB lookup
  const db = await getDb()
  const record = await db.collection(COLLECTIONS.oauthTokens).findOne({
    accessTokenHash: hash,
    expiresAt: { $gt: new Date() },
  }) as unknown as OAuthToken | null
  if (!record) return null
  return { userId: record.userId, scopes: record.scopes, clientId: record.clientId }
}

export async function revokeToken(token: string): Promise<void> {
  const db = await getDb()
  const hash = hashToken(token)
  await Promise.all([
    redis.del(RedisKeys.oauthAccess(hash)),
    db.collection(COLLECTIONS.oauthTokens).deleteOne({
      $or: [{ accessTokenHash: hash }, { refreshTokenHash: hash }],
    }),
  ])
}
