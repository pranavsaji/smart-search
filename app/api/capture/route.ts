// Phase 9.2 — Browser extension capture endpoint
// Receives page context from the extension, creates a capture record,
// and returns a Stage URL for the extension to open.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, withApiHandler, BadRequestError } from '@/lib/api/response'
import { processCapturedPage } from '@/lib/capture/capture'
import { auth } from '@/lib/auth'

const capturedDataSchema = z.object({
  productName: z.string().optional(),
  price: z.string().optional(),
  currency: z.string().optional(),
  availability: z.string().optional(),
  imageUrl: z.string().url().optional(),
  hotelName: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  roomType: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  airline: z.string().optional(),
  rawText: z.string().max(500).optional(),
  structuredData: z.record(z.string()).optional(),
})

const schema = z.object({
  sourceUrl: z.string().url(),
  pageTitle: z.string().max(200).optional(),
  capturedData: capturedDataSchema,
  sessionToken: z.string().optional(),
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = schema.parse(await req.json())

  // Check for authenticated session (optional — extension may be unauthenticated)
  const session = await auth()
  const userId = session?.user?.id

  if (!userId && !body.sessionToken) {
    throw new BadRequestError('Authentication required — please sign in to Smart Search')
  }

  const result = await processCapturedPage(body, userId)
  return ok(result, 201)
}, 'POST /api/capture')
