// Phase 9.2 — Browser capture handler
// Turns captured page context into a natural-language intent string,
// stores the capture record, and returns a Stage URL for the extension to open.

import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import { nanoid } from 'nanoid'
import type { CapturedIntent, CapturedPageData, CaptureRequest, CaptureResponse } from './types'

export type { CapturedIntent, CapturedPageData, CaptureRequest, CaptureResponse }

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function processCapturedPage(
  input: CaptureRequest,
  userId?: string
): Promise<CaptureResponse> {
  const db = await getDb()
  const captureId = `cap_${nanoid(16)}`
  const sourceDomain = extractDomain(input.sourceUrl)

  const intentPrompt = buildIntentPrompt(input.capturedData, sourceDomain, input.pageTitle)

  // URL-encode the intent prompt for passing to the Stage creation flow
  const stageUrl = `/stage/new?intent=${encodeURIComponent(intentPrompt)}&captureId=${captureId}`

  const capture: CapturedIntent = {
    captureId,
    userId,
    sessionToken: input.sessionToken,
    sourceUrl: input.sourceUrl,
    sourceDomain,
    pageTitle: input.pageTitle,
    capturedData: input.capturedData,
    stageId: undefined,
    status: 'pending',
    createdAt: new Date(),
  }

  await db.collection(COLLECTIONS.capturedIntents).insertOne({ ...capture })

  return {
    captureId,
    stageUrl,
    intentSummary: intentPrompt.slice(0, 120),
  }
}

export async function markCaptureProcessed(
  captureId: string,
  stageId: string
): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.capturedIntents).updateOne(
    { captureId },
    { $set: { stageId, status: 'processed' } }
  )
}

export async function getCapturedIntent(captureId: string): Promise<CapturedIntent | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.capturedIntents).findOne({ captureId })
  return doc as unknown as CapturedIntent | null
}

// ─── Intent prompt construction ───────────────────────────────────────────────

export function buildIntentPrompt(
  data: CapturedPageData,
  domain: string,
  pageTitle?: string
): string {
  const parts: string[] = []

  // Product
  if (data.productName) {
    const price = data.price ? ` for ${data.price}${data.currency ? ` ${data.currency}` : ''}` : ''
    parts.push(`Buy ${data.productName}${price}`)
  }

  // Hotel
  if (data.hotelName) {
    const dates =
      data.checkIn && data.checkOut
        ? ` from ${data.checkIn} to ${data.checkOut}`
        : ''
    const room = data.roomType ? ` (${data.roomType})` : ''
    parts.push(`Stay at ${data.hotelName}${room}${dates}`)
  }

  // Flight
  if (data.origin && data.destination) {
    const departure = data.departureDate ? ` on ${data.departureDate}` : ''
    const returnFlight = data.returnDate ? ` returning ${data.returnDate}` : ''
    const airline = data.airline ? ` with ${data.airline}` : ''
    parts.push(`Flight from ${data.origin} to ${data.destination}${departure}${returnFlight}${airline}`)
  }

  // Fallback to page title
  if (parts.length === 0 && pageTitle) {
    parts.push(`I found "${pageTitle}" on ${domain}`)
  }

  // Fallback to raw text snippet
  if (parts.length === 0 && data.rawText) {
    parts.push(data.rawText.slice(0, 200))
  }

  if (parts.length === 0) {
    parts.push(`Show me what's available from ${domain}`)
  }

  return parts.join('. ')
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
