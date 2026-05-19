import { type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError } from '@/lib/api/response'
import { getVendorOrders } from '@/lib/orders/orders'
import type { OrderStatus } from '@/lib/services/catalog/types'

type Ctx = { params: Promise<{ vendorId: string }> }

const VALID_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled', 'disputed']

// GET /api/vendor/[vendorId]/orders — vendor views their incoming orders
export const GET = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()

  const { vendorId } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status') as OrderStatus | null
  const status = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : undefined

  const orders = await getVendorOrders(vendorId, status)
  return ok({ orders })
}, 'GET /api/vendor/[vendorId]/orders')
