export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsertOne = jest.fn()
const mockFindOne = jest.fn()
const mockUpdateOne = jest.fn()

jest.mock('@/lib/db/mongo', () => ({
  getDb: jest.fn(async () => ({
    collection: () => ({
      insertOne: mockInsertOne,
      findOne: mockFindOne,
      updateOne: mockUpdateOne,
    }),
  })),
  COLLECTIONS: { capturedIntents: 'captured_intents' },
}))

jest.mock('nanoid', () => ({ nanoid: (n?: number) => 'C'.repeat(n ?? 16) }))

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  processCapturedPage,
  buildIntentPrompt,
  extractDomain,
  markCaptureProcessed,
  getCapturedIntent,
} from '@/lib/capture/capture'
import type { CapturedPageData } from '@/lib/capture/types'

// ─── processCapturedPage() ────────────────────────────────────────────────────

describe('processCapturedPage()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates capture record and returns captureId + stageUrl', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })

    const result = await processCapturedPage({
      sourceUrl: 'https://amazon.co.uk/product/123',
      pageTitle: 'Sony WH-1000XM5',
      capturedData: { productName: 'Sony WH-1000XM5', price: '£279.99', currency: 'GBP' },
    })

    expect(result.captureId).toMatch(/^cap_/)
    expect(result.stageUrl).toContain('/stage/new?intent=')
    expect(result.stageUrl).toContain('captureId=')
    expect(result.intentSummary).toBeTruthy()
    expect(mockInsertOne).toHaveBeenCalledTimes(1)
  })

  it('associates capture with authenticated user when userId provided', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })

    await processCapturedPage(
      {
        sourceUrl: 'https://booking.com/hotel/paris',
        capturedData: { hotelName: 'Hotel Le Marais' },
      },
      'user-123'
    )

    const savedCapture = mockInsertOne.mock.calls[0][0]
    expect(savedCapture.userId).toBe('user-123')
    expect(savedCapture.status).toBe('pending')
  })

  it('URL-encodes the intent prompt in stageUrl', async () => {
    mockInsertOne.mockResolvedValueOnce({ acknowledged: true })

    const result = await processCapturedPage({
      sourceUrl: 'https://kayak.com',
      capturedData: { origin: 'London', destination: 'Paris', departureDate: '2026-07-01' },
    })

    // Encoded URL should be decodable back to the intent
    const url = new URL(`https://iam.app${result.stageUrl}`)
    const decoded = decodeURIComponent(url.searchParams.get('intent') ?? '')
    expect(decoded).toContain('London')
    expect(decoded).toContain('Paris')
  })
})

// ─── buildIntentPrompt() ─────────────────────────────────────────────────────

describe('buildIntentPrompt()', () => {
  it('builds product prompt with price', () => {
    const data: CapturedPageData = { productName: 'MacBook Pro', price: '£2,499', currency: 'GBP' }
    const prompt = buildIntentPrompt(data, 'apple.com')
    expect(prompt).toContain('MacBook Pro')
    expect(prompt).toContain('£2,499')
    expect(prompt).toContain('GBP')
  })

  it('builds product prompt without price', () => {
    const data: CapturedPageData = { productName: 'Kindle Paperwhite' }
    const prompt = buildIntentPrompt(data, 'amazon.co.uk')
    expect(prompt).toBe('Buy Kindle Paperwhite')
  })

  it('builds hotel prompt with check-in/check-out dates', () => {
    const data: CapturedPageData = {
      hotelName: 'The Ritz Paris',
      checkIn: '2026-07-01',
      checkOut: '2026-07-05',
      roomType: 'Deluxe',
    }
    const prompt = buildIntentPrompt(data, 'booking.com')
    expect(prompt).toContain('The Ritz Paris')
    expect(prompt).toContain('2026-07-01')
    expect(prompt).toContain('Deluxe')
  })

  it('builds hotel prompt without dates', () => {
    const data: CapturedPageData = { hotelName: 'Hilton London' }
    const prompt = buildIntentPrompt(data, 'hilton.com')
    expect(prompt).toContain('Hilton London')
    expect(prompt).not.toContain('undefined')
  })

  it('builds flight prompt with all fields', () => {
    const data: CapturedPageData = {
      origin: 'London Heathrow',
      destination: 'Tokyo',
      departureDate: '2026-08-10',
      returnDate: '2026-08-20',
      airline: 'British Airways',
    }
    const prompt = buildIntentPrompt(data, 'britishairways.com')
    expect(prompt).toContain('London Heathrow')
    expect(prompt).toContain('Tokyo')
    expect(prompt).toContain('British Airways')
    expect(prompt).toContain('2026-08-10')
    expect(prompt).toContain('2026-08-20')
  })

  it('falls back to page title when no structured data', () => {
    const data: CapturedPageData = {}
    const prompt = buildIntentPrompt(data, 'example.com', 'Check out this deal')
    expect(prompt).toContain('Check out this deal')
  })

  it('falls back to rawText when no title and no structured data', () => {
    const data: CapturedPageData = { rawText: 'Amazing deal on laptops this weekend!' }
    const prompt = buildIntentPrompt(data, 'deals.com')
    expect(prompt).toContain('laptops')
  })

  it('falls back to domain prompt when nothing else available', () => {
    const data: CapturedPageData = {}
    const prompt = buildIntentPrompt(data, 'unknown.com')
    expect(prompt).toContain('unknown.com')
  })
})

// ─── extractDomain() ─────────────────────────────────────────────────────────

describe('extractDomain()', () => {
  it('extracts domain removing www prefix', () => {
    expect(extractDomain('https://www.amazon.co.uk/product')).toBe('amazon.co.uk')
    expect(extractDomain('https://booking.com/hotel')).toBe('booking.com')
  })

  it('handles URLs without www', () => {
    expect(extractDomain('https://kayak.com/flights')).toBe('kayak.com')
  })

  it('returns the input when URL is invalid', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url')
  })
})

// ─── markCaptureProcessed() ──────────────────────────────────────────────────

describe('markCaptureProcessed()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates capture with stageId and processed status', async () => {
    mockUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    await markCaptureProcessed('cap_abc', 'stage-xyz')

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { captureId: 'cap_abc' },
      { $set: { stageId: 'stage-xyz', status: 'processed' } }
    )
  })
})

// ─── getCapturedIntent() ──────────────────────────────────────────────────────

describe('getCapturedIntent()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns capture when found', async () => {
    const fake = { captureId: 'cap_abc', status: 'pending' }
    mockFindOne.mockResolvedValueOnce(fake)
    const result = await getCapturedIntent('cap_abc')
    expect(result?.captureId).toBe('cap_abc')
  })

  it('returns null when not found', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const result = await getCapturedIntent('cap_missing')
    expect(result).toBeNull()
  })
})
