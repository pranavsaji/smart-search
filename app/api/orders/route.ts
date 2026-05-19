import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError } from '@/lib/api/response'
import { getUserOrders } from '@/lib/orders/orders'

// GET /api/orders — authenticated user's order history
export const GET = withApiHandler(async (_req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const orders = await getUserOrders(session.user.id)
  return ok({ orders })
}, 'GET /api/orders')
