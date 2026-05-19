import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { generateApiKey, generateKeyId, tierMonthlyLimit } from '@/lib/ecosystem/keys'
import type { DeveloperAccount, DeveloperKey } from '@/lib/ecosystem/types'

async function getDeveloperAccount(userId: string): Promise<DeveloperAccount> {
  const db = await getDb()
  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')
  return account
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
})

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  const account = await getDeveloperAccount(session.user.id)

  const db = await getDb()
  const keys = await db.collection(COLLECTIONS.developerKeys)
    .find({ developerId: account.developerId })
    .sort({ createdAt: -1 })
    .toArray() as unknown as DeveloperKey[]

  // Never return the full hash — only prefix for display
  return ok(keys.map(k => ({ ...k, keyHash: undefined })))
}, 'GET /api/ecosystem/keys')

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  const account = await getDeveloperAccount(session.user.id)

  const body = createSchema.parse(await req.json())
  const { raw, hash, prefix } = generateApiKey()
  const db = await getDb()

  const key: DeveloperKey = {
    keyId: generateKeyId(),
    developerId: account.developerId,
    name: body.name,
    keyHash: hash,
    prefix,
    tier: account.tier,
    monthlyLimit: tierMonthlyLimit(account.tier),
    isActive: true,
    createdAt: new Date(),
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
  }
  await db.collection(COLLECTIONS.developerKeys).insertOne({ _id: new ObjectId(), ...key })

  // Return raw key ONCE — never again
  return ok({ ...key, keyHash: undefined, rawKey: raw }, 201)
}, 'POST /api/ecosystem/keys')
