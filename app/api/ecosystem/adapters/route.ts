import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import type { AdapterManifest, DeveloperAccount } from '@/lib/ecosystem/types'

const endpointsSchema = z.object({
  search: z.string().url(),
  createOrder: z.string().url(),
  checkAvailability: z.string().url().optional(),
})

const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bearer'), token: z.string().min(1) }),
  z.object({ type: z.literal('hmac'), secret: z.string().min(16) }),
])

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(10).max(1000),
  category: z.enum(['travel', 'experiences', 'products', 'services']),
  iconUrl: z.string().url().optional(),
  endpoints: endpointsSchema,
  auth: authSchema,
  revenueSharePercent: z.number().min(0).max(50).optional(),
})

export const GET = withApiHandler(async (req: NextRequest) => {
  const db = await getDb()
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const featured = searchParams.get('featured') === 'true'

  const filter: Record<string, unknown> = { status: 'approved' }
  if (category) filter.category = category
  if (featured) filter.featured = true

  const adapters = await db.collection(COLLECTIONS.adapterRegistry)
    .find(filter)
    .sort({ featured: -1, rating: -1, installCount: -1 })
    .toArray() as unknown as AdapterManifest[]

  // Strip auth secrets before returning
  return ok(adapters.map(a => ({ ...a, auth: { type: a.auth.type } })))
}, 'GET /api/ecosystem/adapters')

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const db = await getDb()
  const account = await db.collection(COLLECTIONS.developerAccounts)
    .findOne({ userId: session.user.id }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')

  const body = registerSchema.parse(await req.json())
  const now = new Date()

  const slug = body.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const adapterId = `${slug}-${nanoid(6)}`

  const manifest: AdapterManifest = {
    adapterId,
    developerId: account.developerId,
    name: body.name,
    description: body.description,
    category: body.category,
    iconUrl: body.iconUrl,
    endpoints: body.endpoints,
    auth: body.auth,
    status: 'pending',
    rating: 0,
    ratingCount: 0,
    installCount: 0,
    featured: false,
    revenueSharePercent: body.revenueSharePercent ?? 10,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection(COLLECTIONS.adapterRegistry).insertOne({ _id: new ObjectId(), ...manifest })
  // Strip auth from response
  return ok({ ...manifest, auth: { type: manifest.auth.type } }, 201)
}, 'POST /api/ecosystem/adapters')
