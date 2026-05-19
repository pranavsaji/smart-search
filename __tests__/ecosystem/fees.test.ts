export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

// nanoid uses ESM; mock it so ts-jest can process it
let nanoidCounter = 0
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => `id${++nanoidCounter}`),
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { calculateFeePercent, calculateFee, buildPlatformFeeRecord } from '@/lib/ecosystem/fees'

// ─── calculateFeePercent() ────────────────────────────────────────────────────

describe('calculateFeePercent()', () => {
  it('travel = 5%', () => {
    expect(calculateFeePercent('travel')).toBe(5)
  })

  it('experiences = 8%', () => {
    expect(calculateFeePercent('experiences')).toBe(8)
  })

  it('products = 10%', () => {
    expect(calculateFeePercent('products')).toBe(10)
  })

  it('services = 12%', () => {
    expect(calculateFeePercent('services')).toBe(12)
  })

  it('unknown category defaults to 10%', () => {
    expect(calculateFeePercent('unknown')).toBe(10)
    expect(calculateFeePercent('')).toBe(10)
    expect(calculateFeePercent('foobar')).toBe(10)
  })
})

// ─── calculateFee() ───────────────────────────────────────────────────────────

describe('calculateFee()', () => {
  it('calculates travel fee: 10000 * 5% = 500, net = 9500', () => {
    const result = calculateFee(10000, 'travel')
    expect(result).toEqual({ feePercent: 5, feeAmountCents: 500, netAmountCents: 9500 })
  })

  it('calculates services fee: 10000 * 12% = 1200, net = 8800', () => {
    const result = calculateFee(10000, 'services')
    expect(result).toEqual({ feePercent: 12, feeAmountCents: 1200, netAmountCents: 8800 })
  })

  it('calculates experiences fee: 10000 * 8% = 800, net = 9200', () => {
    const result = calculateFee(10000, 'experiences')
    expect(result).toEqual({ feePercent: 8, feeAmountCents: 800, netAmountCents: 9200 })
  })

  it('calculates products fee: 10000 * 10% = 1000, net = 9000', () => {
    const result = calculateFee(10000, 'products')
    expect(result).toEqual({ feePercent: 10, feeAmountCents: 1000, netAmountCents: 9000 })
  })

  it('rounds fractional cents correctly: 100 * 5% = 5 cents', () => {
    const result = calculateFee(100, 'travel')
    expect(result.feeAmountCents).toBe(5)
    expect(result.netAmountCents).toBe(95)
  })

  it('rounding: 3 cents * 8% = 0 (rounds down)', () => {
    const result = calculateFee(3, 'experiences')
    // 3 * 8 / 100 = 0.24 → rounds to 0
    expect(result.feeAmountCents).toBe(0)
    expect(result.netAmountCents).toBe(3)
  })

  it('fee + net = gross (accounting identity)', () => {
    for (const category of ['travel', 'experiences', 'products', 'services']) {
      const gross = 9999
      const result = calculateFee(gross, category)
      expect(result.feeAmountCents + result.netAmountCents).toBe(gross)
    }
  })

  it('returns correct feePercent in result', () => {
    expect(calculateFee(1000, 'travel').feePercent).toBe(5)
    expect(calculateFee(1000, 'services').feePercent).toBe(12)
  })
})

// ─── buildPlatformFeeRecord() ─────────────────────────────────────────────────

describe('buildPlatformFeeRecord()', () => {
  const base = () =>
    buildPlatformFeeRecord('ord-1', 'acme-hotels', 'dev-abc', 10000, 'GBP', 'travel')

  it('returns correct structure', () => {
    const record = base()
    expect(record.orderId).toBe('ord-1')
    expect(record.adapterId).toBe('acme-hotels')
    expect(record.developerId).toBe('dev-abc')
    expect(record.grossAmountCents).toBe(10000)
    expect(record.currency).toBe('GBP')
    expect(record.feePercent).toBe(5)
    expect(record.feeAmountCents).toBe(500)
    expect(record.netAmountCents).toBe(9500)
  })

  it('feeId starts with "FEE-"', () => {
    const record = base()
    expect(record.feeId).toMatch(/^FEE-/)
  })

  it('createdAt is a Date', () => {
    const record = base()
    expect(record.createdAt).toBeInstanceOf(Date)
  })

  it('gross = fee + net (accounting identity)', () => {
    const record = base()
    expect(record.feeAmountCents + record.netAmountCents).toBe(record.grossAmountCents)
  })

  it('each call generates a unique feeId', () => {
    const r1 = base()
    const r2 = base()
    expect(r1.feeId).not.toBe(r2.feeId)
  })

  it('works for services category at 12%', () => {
    const record = buildPlatformFeeRecord('ord-2', 'plumbing', 'dev-xyz', 5000, 'USD', 'services')
    expect(record.feePercent).toBe(12)
    expect(record.feeAmountCents).toBe(600)
    expect(record.netAmountCents).toBe(4400)
    expect(record.feeAmountCents + record.netAmountCents).toBe(5000)
  })
})
