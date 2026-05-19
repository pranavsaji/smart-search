import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { ok, withApiHandler, UnauthorizedError, ForbiddenError } from '@/lib/api/response'
import { createProduct, getVendorProducts, getVendorById } from '@/lib/vendor/portal'

type Ctx = { params: Promise<{ vendorId: string }> }

const createProductSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().min(10).max(2000),
  price: z.number().int().positive(),       // minor units
  currency: z.string().length(3).default('GBP'),
  stock: z.number().int().min(0),
  imageUrls: z.array(z.string().url()).min(1).max(8),
  category: z.string().min(1),
  tags: z.array(z.string()).max(20).default([]),
})

// GET /api/vendor/[vendorId]/products — list products for a vendor
export const GET = withApiHandler(async (_req: NextRequest, ctx?: Ctx) => {
  const { vendorId } = await ctx!.params
  const products = await getVendorProducts(vendorId)
  return ok({ products })
}, 'GET /api/vendor/[vendorId]/products')

// POST /api/vendor/[vendorId]/products — vendor lists a new product
export const POST = withApiHandler(async (req: NextRequest, ctx?: Ctx) => {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()

  const { vendorId } = await ctx!.params

  // Vendor must be approved before listing products
  const vendor = await getVendorById(vendorId)
  if (!vendor) throw new ForbiddenError('Vendor not found')
  if (vendor.status !== 'approved') throw new ForbiddenError('Vendor not approved')

  const body = createProductSchema.parse(await req.json())
  const product = await createProduct({ vendorId, ...body })
  return ok({ product }, 201)
}, 'POST /api/vendor/[vendorId]/products')
