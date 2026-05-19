import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, ForbiddenError } from '@/lib/api/response'
import { createVendor, getApprovedVendors } from '@/lib/vendor/portal'

const createSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().min(1),
  email: z.string().email(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
})

// GET /api/vendor — list approved vendors (public, optionally filtered by category)
export const GET = withApiHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? undefined
  const vendors = await getApprovedVendors(category)
  return ok({ vendors })
}, 'GET /api/vendor')

// POST /api/vendor — register as a vendor (requires auth)
export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()
  if (!process.env.VENDOR_PORTAL_ENABLED) throw new ForbiddenError('Vendor portal not enabled')

  const body = createSchema.parse(await req.json())
  const vendor = await createVendor(body)
  return ok({ vendor }, 201)
}, 'POST /api/vendor')
