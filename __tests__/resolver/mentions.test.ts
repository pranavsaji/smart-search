import { extractMentions } from '@/lib/resolver/extractMentions'
import { inferMentionType } from '@/lib/resolver/inferType'

describe('extractMentions', () => {
  it('extracts multiple mentions from text', () => {
    const result = extractMentions('plan a trip with @alex and @sarah')
    expect(result).toContain('alex')
    expect(result).toContain('sarah')
    expect(result).toHaveLength(2)
  })

  it('extracts a single brand mention', () => {
    const result = extractMentions('@nike show me running shoes')
    expect(result).toEqual(['nike'])
  })

  it('returns empty array when no mentions', () => {
    const result = extractMentions('no mentions here')
    expect(result).toEqual([])
  })

  it('lowercases all handles', () => {
    const result = extractMentions('@UPPER and @lower')
    expect(result).toContain('upper')
    expect(result).toContain('lower')
  })

  it('deduplicates the same handle', () => {
    const result = extractMentions('same @handle @handle twice')
    expect(result).toEqual(['handle'])
  })

  it('handles handles with underscores and numbers', () => {
    const result = extractMentions('follow @user_123 today')
    expect(result).toContain('user_123')
  })

  it('handles handles with hyphens', () => {
    const result = extractMentions('check out @my-brand for deals')
    expect(result).toContain('my-brand')
  })

  it('extracts handle at start of string', () => {
    const result = extractMentions('@startatstart helps with things')
    expect(result).toContain('startatstart')
  })

  it('returns correct count for three distinct handles', () => {
    const result = extractMentions('going with @alice @bob @carol')
    expect(result).toHaveLength(3)
  })
})

describe('inferMentionType', () => {
  it('returns person for "plan a trip with @alex"', () => {
    const result = inferMentionType('alex', 'plan a trip with @alex')
    expect(result).toBe('person')
  })

  it('returns person for "for @alex next week"', () => {
    const result = inferMentionType('alex', 'for @alex next week')
    expect(result).toBe('person')
  })

  it('returns person for "me and @alice going to Paris"', () => {
    const result = inferMentionType('alice', 'me and @alice going to Paris')
    expect(result).toBe('person')
  })

  it('returns person for "invite @bob to the stage"', () => {
    const result = inferMentionType('bob', 'invite @bob to the stage')
    expect(result).toBe('person')
  })

  it('returns brand for "@nike shoes" (product noun after handle)', () => {
    const result = inferMentionType('nike', '@nike shoes')
    expect(result).toBe('brand')
  })

  it('returns brand for "@nike" alone', () => {
    const result = inferMentionType('nike', '@nike')
    expect(result).toBe('brand')
  })

  it('returns brand for "buy @adidas jacket"', () => {
    const result = inferMentionType('adidas', 'buy @adidas jacket')
    expect(result).toBe('brand')
  })

  it('returns brand for "shop from @amazon"', () => {
    const result = inferMentionType('amazon', 'shop from @amazon')
    expect(result).toBe('brand')
  })

  it('returns person for "book with @hotel" (with-pattern takes priority over brand patterns)', () => {
    // "with @" matches the person pattern first — brand check would need "book at @hotel"
    const result = inferMentionType('hotel', 'book with @hotel')
    expect(result).toBe('person')
  })

  it('returns brand for "book at @hotel"', () => {
    // No person pattern matches; "book at @" matches brand pattern
    const result = inferMentionType('hotel', 'book at @hotel')
    expect(result).toBe('brand')
  })

  it('returns unknown when no clear pattern matches', () => {
    const result = inferMentionType('alex', 'going to @alex')
    expect(result).toBe('unknown')
  })

  it('returns unknown for generic sentence with handle and no pattern', () => {
    const result = inferMentionType('foo', 'what does @foo think about this')
    expect(result).toBe('unknown')
  })
})
