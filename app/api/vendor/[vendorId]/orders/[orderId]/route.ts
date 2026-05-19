import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError, ForbiddenError, BadRequestError } from '@/lib/api/response'
import { getOrderById, updateOrderStatus, orderBelongsToVendor } from '@/lib/orders/orders'

type Ctx = { params: Promise<{ vendorId: string; orderId: string }> }

const updateSchema = z.object({
  status: z.enum(['confirmed', 'shipped', 'delivered', 'cancelled']),
  trackingUrl: z.string().url().optional(),
})

// PATCH /api/vendor/[vendorId]/orders/[orderId] — vendor marks order shipped/delivered/etc.
export const PATCH = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()

  const { vendorId, orderId } = await ctx!.params

  const order = await getOrderById(orderId)
  if (!order) throw new NotFoundError('Order')
  if (!orderBelongsToVendor(order, vendorId)) throw new ForbiddenError()

  const body = updateSchema.parse(await req.json())

  // Guard against invalid status transitions
  const allowedTransitions: Record<string, string[]> = {
    pending:   ['confirmed', 'cancelled'],
    confirmed: ['shipped', 'cancelled'],
    shipped:   ['delivered'],
    delivered: [],
    returned:  [],
    cancelled: [],
    disputed:  [],
  }
  if (!allowedTransitions[order.status]?.includes(body.status)) {
    throw new BadRequestError(`Cannot transition from '${order.status}' to '${body.status}'`)
  }

  const updated = await updateOrderStatus(orderId, body.status, { trackingUrl: body.trackingUrl })
  return ok({ order: updated })
}, 'PATCH /api/vendor/[vendorId]/orders/[orderId]')
