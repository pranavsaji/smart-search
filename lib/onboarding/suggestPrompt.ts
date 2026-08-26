// GAP_ANALYSIS 1.2 — the first prompt a newly-onboarded user is shown.
//
// Pure, and kept out of the component so it tests without a renderer (same
// split as the other lib/* helpers).

import type { ActivityType, TravelStyle } from '@/lib/intent/types'

// Used when the user skipped the destinations step. Anything is better than
// interpolating undefined into the one prompt they are most likely to run.
const FALLBACK_DESTINATION = 'Lisbon'

export function buildSuggestedPrompt(opts: {
  destination?: string
  travelStyle: TravelStyle | null
  activities: ActivityType[]
}): string {
  const destination = opts.destination?.trim() || FALLBACK_DESTINATION
  const nights = opts.travelStyle === 'group' ? 4 : 3
  const who =
    opts.travelStyle === 'couple' ? ' for two'
    : opts.travelStyle === 'group' ? ' for a group of four'
    : ''

  // Name the things they actually picked, so the prompt reads like their own.
  const extras: string[] = []
  if (opts.activities.includes('restaurants')) extras.push('dinner reservations')
  if (opts.activities.includes('experiences')) extras.push('things to do')
  const tail = extras.length ? ` with ${extras.join(' and ')}` : ''

  return `${nights} nights in ${destination}${who}${tail}`
}
