import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, UnauthorizedError, BadRequestError } from '@/lib/api/response'
import { normalizeBid, storeBid } from '@/lib/vendor/bids'
import { BID } from '@/lib/config/constants'

const schema = z.object({
  vendorType: z.string().min(1),
  bidAmountCents: z.number().int().positive(),
  validUntil: z.string().datetime().transform(s => new Date(s)),
})

function verifyVendorAuth(req: NextRequest): void {
  const secret = process.env.VENDOR_API_KEY
  if (!secret) throw new UnauthorizedError('Vendor API not configured')
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${secret}`) throw new UnauthorizedError()
}

export const POST = withApiHandler(async (req: NextRequest) => {
  verifyVendorAuth(req)

  const body = schema.parse(await req.json())

  const nowMs = Date.now()
  const ttlSecs = Math.floor((body.validUntil.getTime() - nowMs) / 1000)
  if (ttlSecs < BID.MIN_VALID_SECS) {
    throw new BadRequestError(`validUntil must be at least ${BID.MIN_VALID_SECS}s from now`)
  }
  if (ttlSecs > BID.MAX_VALID_DAYS * 86_400) {
    throw new BadRequestError(`validUntil cannot exceed ${BID.MAX_VALID_DAYS} days`)
  }

  const normalized = normalizeBid(body.bidAmountCents)
  await storeBid(body.vendorType, normalized, body.validUntil)

  return ok({ vendorType: body.vendorType, normalized, validUntil: body.validUntil })
}, 'POST /api/vendor/bid')
