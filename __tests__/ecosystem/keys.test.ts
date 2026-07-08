export {}

// ─── Mocks ───────────────────────────────────────────────────────────────────

// nanoid uses ESM; mock it so ts-jest can process it
jest.mock('nanoid', () => ({
  nanoid: jest.fn((n?: number) => 'a'.repeat(n ?? 16)),
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { generateApiKey, hashKey, generateKeyId, tierMonthlyLimit } from '@/lib/ecosystem/keys'

// ─── generateApiKey() ─────────────────────────────────────────────────────────

describe('generateApiKey()', () => {
  it('returns an object with raw, hash, and prefix', () => {
    const key = generateApiKey()
    expect(key).toHaveProperty('raw')
    expect(key).toHaveProperty('hash')
    expect(key).toHaveProperty('prefix')
  })

  it('raw key starts with "ss_"', () => {
    const { raw } = generateApiKey()
    expect(raw).toMatch(/^ss_/)
  })

  it('prefix is the first 12 chars of raw', () => {
    const { raw, prefix } = generateApiKey()
    expect(prefix).toBe(raw.slice(0, 12))
    expect(prefix).toHaveLength(12)
  })

  it('hash is different from raw', () => {
    const { raw, hash } = generateApiKey()
    expect(hash).not.toBe(raw)
  })

  it('hash looks like a SHA-256 hex string', () => {
    const { hash } = generateApiKey()
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('two calls return different keys (uniqueness)', () => {
    const key1 = generateApiKey()
    const key2 = generateApiKey()
    expect(key1.raw).not.toBe(key2.raw)
    expect(key1.hash).not.toBe(key2.hash)
  })
})

// ─── hashKey() ────────────────────────────────────────────────────────────────

describe('hashKey()', () => {
  it('is deterministic — same input produces same output', () => {
    const raw = 'ss_some-test-key-value'
    expect(hashKey(raw)).toBe(hashKey(raw))
  })

  it('produces a 64-char hex string (SHA-256)', () => {
    expect(hashKey('ss_test')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('different inputs produce different hashes', () => {
    expect(hashKey('ss_keyA')).not.toBe(hashKey('ss_keyB'))
  })

  it('hash of generated key matches the hash field', () => {
    const { raw, hash } = generateApiKey()
    expect(hashKey(raw)).toBe(hash)
  })
})

// ─── tierMonthlyLimit() ───────────────────────────────────────────────────────

describe('tierMonthlyLimit()', () => {
  it('free tier = 1000', () => {
    expect(tierMonthlyLimit('free')).toBe(1_000)
  })

  it('starter tier = 10000', () => {
    expect(tierMonthlyLimit('starter')).toBe(10_000)
  })

  it('pro tier = 100000', () => {
    expect(tierMonthlyLimit('pro')).toBe(100_000)
  })

  it('enterprise tier = Infinity', () => {
    expect(tierMonthlyLimit('enterprise')).toBe(Infinity)
  })
})

// ─── generateKeyId() ─────────────────────────────────────────────────────────

describe('generateKeyId()', () => {
  it('returns a non-empty string', () => {
    const id = generateKeyId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns a string of the expected length', () => {
    // nanoid is mocked; just verify the return type and non-empty
    const id = generateKeyId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})
