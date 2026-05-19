import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError } from '@/lib/api/response'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { getMonthlyUsage } from '@/lib/ecosystem/metering'
import type { DeveloperAccount } from '@/lib/ecosystem/types'

// Returns display format YYYY-MM (distinct from metering.ts which uses YYYYMM for Redis keys)
function currentMonthDisplay(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const db = await getDb()
  const account = await db.collection(COLLECTIONS.developerAccounts).findOne({ userId: session.user.id }) as unknown as DeveloperAccount | null
  if (!account) throw new NotFoundError('Developer account')

  const usage = await getMonthlyUsage(account.developerId)
  return ok({ developerId: account.developerId, usage, month: currentMonthDisplay() })
}, 'GET /api/ecosystem/usage')
