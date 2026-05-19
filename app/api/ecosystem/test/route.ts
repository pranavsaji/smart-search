import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { DynamicAdapterProxy } from '@/lib/ecosystem/proxy'
import type { AdapterManifest, DeveloperAccount } from '@/lib/ecosystem/types'
import type { ActivityType } from '@/lib/intent/types'

const schema = z.object({
  adapterId: z.string(),
  intent: z.object({
    destination: z.string().default('London'),
    rawPrompt: z.string().default('test'),
    dates: z.object({ start: z.string(), end: z.string() }).default({ start: '2026-06-01', end: '2026-06-07' }),
    activityTypes: z.array(z.string()).default([]),
    budgetSignal: z.string().default('unspecified'),
    participants: z.array(z.unknown()).default([]),
    groupSize: z.number().default(1),
    confidence: z.number().default(0.9),
  }).passthrough(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const body = schema.parse(await req.json())
  const db = await getDb()

  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')

  const adapter = await db.collection(COLLECTIONS.adapterRegistry).findOne({ adapterId: body.adapterId }) as unknown as AdapterManifest | null
  if (!adapter) throw new NotFoundError('Adapter')
  if (adapter.developerId !== account.developerId) throw new ForbiddenError()

  const proxy = new DynamicAdapterProxy(adapter, adapter.category as ActivityType)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await proxy.search({ intent: body.intent as any, graph: {} as any, stageId: 'test' })

  return ok({ result, testedAt: new Date() })
}, 'POST /api/ecosystem/test')
