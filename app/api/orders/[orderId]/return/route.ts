import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, BadRequestError } from '@/lib/api/response'
import { initiateReturn } from '@/lib/orders/returns'

type Ctx = { params: Promise<{ orderId: string }> }

const schema = z.object({
  reason: z.string().min(10).max(500),
})

// POST /api/orders/[orderId]/return — user initiates a return request
export const POST = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()

  const { orderId } = await ctx!.params
  const body = schema.parse(await req.json())

  try {
    const returnRequest = await initiateReturn({
      orderId,
      userId: session.user.id,
      reason: body.reason,
    })
    return ok({ returnRequest }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'ORDER_NOT_FOUND') throw new BadRequestError('Order not found')
    if (message === 'RETURN_WINDOW_EXPIRED') throw new BadRequestError('Return window has expired (14 days from delivery)')
    if (message === 'RETURN_INVALID_STATUS') throw new BadRequestError('Order is not eligible for return')
    if (message === 'RETURN_ALREADY_REQUESTED') throw new BadRequestError('A return request is already in progress')
    throw err
  }
}, 'POST /api/orders/[orderId]/return')
