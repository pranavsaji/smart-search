import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, ConflictError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import type { DeveloperAccount } from '@/lib/ecosystem/types'

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const body = schema.parse(await req.json())
  const db = await getDb()

  const existing = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id })
  if (existing) throw new ConflictError('Developer account already exists for this user')

  const now = new Date()
  const account: DeveloperAccount = {
    developerId: nanoid(16),
    userId: session.user.id,
    name: body.name,
    email: body.email,
    tier: 'free',
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COLLECTIONS.developerAccounts).insertOne({ _id: new ObjectId(), ...account })
  return ok(account, 201)
}, 'POST /api/ecosystem/register')

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const db = await getDb()
  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id })
  if (!account) return ok({ account: null })
  return ok({ account })
}, 'GET /api/ecosystem/register')
