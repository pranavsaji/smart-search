import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/api/response'
import { getVendorById, updateVendorStatus } from '@/lib/vendor/portal'

type Ctx = { params: Promise<{ vendorId: string }> }

// GET /api/vendor/[vendorId]
export const GET = withApiHandler(async (_req: NextRequest, ctx?: Ctx) => {
  const { vendorId } = await ctx!.params
  const vendor = await getVendorById(vendorId)
  if (!vendor) throw new NotFoundError('Vendor')
  return ok({ vendor })
}, 'GET /api/vendor/[vendorId]')

const approveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  stripeConnectId: z.string().optional(),
})

// PATCH /api/vendor/[vendorId] — admin approves/rejects vendor
export const PATCH = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()

  // Only admin users can approve vendors — checked via email allowlist
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  if (!adminEmails.includes(session.user.email ?? '')) throw new ForbiddenError('Admin only')

  const { vendorId } = await ctx!.params
  const body = approveSchema.parse(await req.json())
  const vendor = await updateVendorStatus(vendorId, body.status, body.stripeConnectId)
  if (!vendor) throw new NotFoundError('Vendor')
  return ok({ vendor })
}, 'PATCH /api/vendor/[vendorId]')
