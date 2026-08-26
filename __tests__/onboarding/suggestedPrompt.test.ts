export {}

import { buildSuggestedPrompt } from '@/lib/onboarding/suggestPrompt'
import type { ActivityType } from '@/lib/intent/types'

const NONE: ActivityType[] = []

describe('buildSuggestedPrompt()', () => {
  it('uses the destination the user actually entered', () => {
    const p = buildSuggestedPrompt({ destination: 'Tokyo', travelStyle: 'solo', activities: NONE })
    expect(p).toContain('Tokyo')
  })

  it('falls back to a real destination when none was given', () => {
    // Onboarding lets people skip destinations, and a prompt reading
    // "3 nights in undefined" is worse than no suggestion at all.
    const p = buildSuggestedPrompt({ travelStyle: 'solo', activities: NONE })
    expect(p).not.toMatch(/undefined|null|\{\}/)
    expect(p).toMatch(/^\d+ nights in \w+/)
  })

  it('ignores a whitespace-only destination', () => {
    const p = buildSuggestedPrompt({ destination: '   ', travelStyle: 'solo', activities: NONE })
    expect(p).not.toMatch(/in\s{2,}/)
    expect(p).toMatch(/in \w+/)
  })

  it('reflects who is travelling', () => {
    expect(buildSuggestedPrompt({ destination: 'Rome', travelStyle: 'couple', activities: NONE }))
      .toContain('for two')
    expect(buildSuggestedPrompt({ destination: 'Rome', travelStyle: 'group', activities: NONE }))
      .toContain('group of four')
  })

  it('says nothing about companions for a solo traveller', () => {
    const p = buildSuggestedPrompt({ destination: 'Rome', travelStyle: 'solo', activities: NONE })
    expect(p).not.toMatch(/for two|group of/)
  })

  it('gives a group a longer trip than a solo traveller', () => {
    const solo = buildSuggestedPrompt({ destination: 'Rome', travelStyle: 'solo', activities: NONE })
    const group = buildSuggestedPrompt({ destination: 'Rome', travelStyle: 'group', activities: NONE })
    expect(solo).toContain('3 nights')
    expect(group).toContain('4 nights')
  })

  it('names the interests the user picked', () => {
    const p = buildSuggestedPrompt({
      destination: 'Lisbon',
      travelStyle: 'couple',
      activities: ['restaurants', 'experiences'],
    })
    expect(p).toContain('dinner reservations')
    expect(p).toContain('things to do')
  })

  it('mentions only the interests that were picked', () => {
    const p = buildSuggestedPrompt({
      destination: 'Lisbon',
      travelStyle: 'solo',
      activities: ['restaurants'],
    })
    expect(p).toContain('dinner reservations')
    expect(p).not.toContain('things to do')
  })

  it('omits the trailing clause when no relevant interest was picked', () => {
    const p = buildSuggestedPrompt({
      destination: 'Lisbon',
      travelStyle: 'solo',
      activities: ['flights', 'weather'],
    })
    expect(p).not.toContain('with')
  })

  it('handles a null travel style without leaking it into the text', () => {
    const p = buildSuggestedPrompt({ destination: 'Oslo', travelStyle: null, activities: NONE })
    expect(p).toBe('3 nights in Oslo')
  })

  it('produces something URL-safe to hand to the home page', () => {
    const p = buildSuggestedPrompt({ destination: 'São Paulo', travelStyle: 'couple', activities: NONE })
    expect(decodeURIComponent(encodeURIComponent(p))).toBe(p)
  })
})
