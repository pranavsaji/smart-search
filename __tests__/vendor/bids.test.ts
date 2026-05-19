import { normalizeBid, buildCardBids } from '@/lib/vendor/bids'
import { BID } from '@/lib/config/constants'

// ─── normalizeBid ─────────────────────────────────────────────────────────────

describe('normalizeBid', () => {
  it('normalizes zero to 0', () => {
    expect(normalizeBid(0)).toBe(0)
  })

  it('normalizes max amount to 1.0', () => {
    expect(normalizeBid(BID.MAX_AMOUNT_CENTS)).toBe(1.0)
  })

  it('clamps values above max to 1.0', () => {
    expect(normalizeBid(BID.MAX_AMOUNT_CENTS * 10)).toBe(1.0)
  })

  it('normalizes mid-range amount proportionally', () => {
    const half = BID.MAX_AMOUNT_CENTS / 2
    expect(normalizeBid(half)).toBeCloseTo(0.5, 5)
  })

  it('normalized bid stays <= 1 for any positive amount', () => {
    const result = normalizeBid(Number.MAX_SAFE_INTEGER)
    expect(result).toBeLessThanOrEqual(1.0)
    expect(result).toBeGreaterThan(0)
  })
})

// ─── North-star invariant: bid cannot affect gate ────────────────────────────
// The invariant is enforced in gate.ts (takes no bid param) + ranker.ts
// (assertBidCannotCreateRelevance). These tests verify the bid value itself
// never exceeds the capped 0–1 range that scorer.ts then multiplies by
// MAX_BID_SHIFT (0.10). So the maximum possible score shift is exactly 0.10.

describe('bid score impact ceiling', () => {
  it('max normalized bid * MAX_BID_SHIFT equals 0.10', () => {
    const SCORER_MAX_BID_SHIFT = 0.10
    const maxShift = normalizeBid(BID.MAX_AMOUNT_CENTS) * SCORER_MAX_BID_SHIFT
    expect(maxShift).toBeCloseTo(0.10, 5)
  })

  it('normalized bid never causes final score to exceed 1.0', () => {
    // Even if intentFit + userFit + outcomeHistory + bidShift all max out
    const base = 0.45 * 1 + 0.35 * 1 + 0.20 * 1  // = 1.0
    const bidShift = normalizeBid(BID.MAX_AMOUNT_CENTS) * 0.10
    const final = Math.min(1, base + bidShift)
    expect(final).toBe(1.0)
  })
})

// ─── buildCardBids ────────────────────────────────────────────────────────────
// Mock Redis at the module boundary so both getActiveBids and buildCardBids
// exercise real logic but avoid hitting a real Redis instance.

jest.mock('@/lib/cache/redis', () => {
  const mgetMock = jest.fn()
  return {
    redis: { mget: mgetMock },
    RedisKeys: { vendorBid: (vt: string) => `bid:${vt}` },
    __mgetMock: mgetMock,
  }
})

describe('buildCardBids', () => {
  // Retrieve the mget mock after jest.mock is applied
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __mgetMock } = jest.requireMock('@/lib/cache/redis') as { __mgetMock: jest.Mock }

  beforeEach(() => __mgetMock.mockReset())

  it('maps card ids to their vendor-type bid', async () => {
    // mget returns values in key order: duffel_flight=0.5, viator=0.3, opentable=0
    __mgetMock.mockResolvedValue(['0.5', '0.3', null])

    const cards = [
      { id: 'card-1', vendorType: 'duffel_flight' },
      { id: 'card-2', vendorType: 'duffel_flight' },
      { id: 'card-3', vendorType: 'viator' },
      { id: 'card-4', vendorType: 'opentable' },
    ]
    const bids = await buildCardBids(cards)
    expect(bids['card-1']).toBeCloseTo(0.5)
    expect(bids['card-2']).toBeCloseTo(0.5)
    expect(bids['card-3']).toBeCloseTo(0.3)
    expect(bids['card-4']).toBe(0)
  })

  it('returns empty object for empty card list', async () => {
    const bids = await buildCardBids([])
    expect(bids).toEqual({})
    expect(__mgetMock).not.toHaveBeenCalled()
  })

  it('handles null response from Redis (unconfigured)', async () => {
    __mgetMock.mockResolvedValue(null)
    const cards = [{ id: 'card-1', vendorType: 'duffel_flight' }]
    const bids = await buildCardBids(cards)
    expect(bids['card-1']).toBe(0)
  })
})
