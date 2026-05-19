import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { getOrderById, orderBelongsToUser } from '@/lib/orders/orders'

type Ctx = { params: Promise<{ orderId: string }> }

// GET /api/orders/[orderId] — order details (owner only)
export const GET = withApiHandler(async (_req: NextRequest, ctx?: Ctx) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const { orderId } = await ctx!.params
  const order = await getOrderById(orderId)
  if (!order) throw new NotFoundError('Order')
  if (!orderBelongsToUser(order, session.user.id)) throw new ForbiddenError()

  return ok({ order })
}, 'GET /api/orders/[orderId]')
