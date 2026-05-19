// Phase 9.2 — Browser Extension capture types

export interface CapturedIntent {
  captureId: string
  userId?: string           // null if extension user is not authenticated
  sessionToken?: string     // extension session token for auth
  sourceUrl: string         // URL of the page the extension was on
  sourceDomain: string
  pageTitle?: string
  capturedData: CapturedPageData
  stageId?: string          // set after Stage is created
  status: 'pending' | 'processed' | 'failed'
  createdAt: Date
}

export interface CapturedPageData {
  // Product pages
  productName?: string
  price?: string
  currency?: string
  availability?: string
  imageUrl?: string

  // Hotel/accommodation pages
  hotelName?: string
  checkIn?: string
  checkOut?: string
  roomType?: string

  // Flight pages
  origin?: string
  destination?: string
  departureDate?: string
  returnDate?: string
  airline?: string

  // Generic
  rawText?: string          // extracted page text (max 500 chars)
  structuredData?: Record<string, string>  // schema.org / OG meta tags
}

export interface CaptureRequest {
  sourceUrl: string
  pageTitle?: string
  capturedData: CapturedPageData
  sessionToken?: string
}

export interface CaptureResponse {
  captureId: string
  stageUrl: string          // redirect URL to open in iAM
  intentSummary?: string    // short description of what was understood
}
