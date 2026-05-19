import { type NextRequest } from 'next/server'
import { ok, withApiHandler, UnauthorizedError } from '@/lib/api/response'
import { validateAccessToken } from '@/lib/ecosystem/oauth'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { OAuthScope } from '@/lib/ecosystem/types'

export const GET = withApiHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError()
  const token = authHeader.slice(7)

  const tokenData = await validateAccessToken(token)
  if (!tokenData) throw new UnauthorizedError('Token expired or invalid')

  const db = await getDb()
  const user = await db.collection(COLLECTIONS.users).findOne({ _id: tokenData.userId as unknown as never })
    ?? await db.collection(COLLECTIONS.users).findOne({ _id: { $toString: tokenData.userId } as unknown as never })

  // Build response based on granted scopes
  const scopes = tokenData.scopes
  const response: Record<string, unknown> = { sub: tokenData.userId }

  if (scopes.includes('profile.read' as OAuthScope) && user) {
    response.name = user.displayName
    response.handle = user.handle
    response.email = user.email
  }

  if (scopes.includes('preferences.read' as OAuthScope)) {
    const graph = await db.collection(COLLECTIONS.intentGraphs).findOne({ userId: tokenData.userId })
    if (graph) {
      response.preferences = {
        destinations: graph.destinations,
        activityPreferences: graph.activityPreferences,
        spendingSignal: graph.spendingSignal,
        travelStyle: graph.travelStyle,
      }
    }
  }

  if (scopes.includes('bookings.read' as OAuthScope)) {
    const orders = await db.collection(COLLECTIONS.vendorOrders)
      .find({ userId: tokenData.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray()
    response.recentBookings = orders.map(o => ({
      orderId: o.orderId,
      status: o.status,
      totalAmount: o.totalAmount,
      currency: o.currency,
      createdAt: o.createdAt,
    }))
  }

  return ok(response)
}, 'GET /api/oauth/userinfo')
