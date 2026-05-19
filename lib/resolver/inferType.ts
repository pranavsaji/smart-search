import type { MentionType } from './types'

// Patterns that suggest a person mention
const PERSON_PATTERNS = [
  /\bwith\s+@/i,
  /\bfor\s+@/i,
  /\bme\s+and\s+@/i,
  /\bmy\s+(?:friend|partner|colleague|wife|husband|sister|brother)\s+@/i,
  /\binvite\s+@/i,
  /\bring\s+@/i,
  /\btake\s+@/i,
]

// Patterns that suggest a brand
const BRAND_PATTERNS = [
  /@\w+\s+(?:shoes|bag|jacket|shirt|phone|laptop|hotel|flights|car)/i,
  /(?:shop|buy|get|order)\s+(?:from\s+)?@/i,
  /\bfly\s+(?:with\s+)?@/i,
  /\bstay\s+(?:at\s+)?@/i,
  /\bbook\s+(?:with\s+|at\s+|on\s+)?@/i,
]

export function inferMentionType(handle: string, fullText: string): MentionType {
  // Check person patterns
  for (const pattern of PERSON_PATTERNS) {
    if (pattern.test(fullText)) return 'person'
  }

  // Check brand patterns
  for (const pattern of BRAND_PATTERNS) {
    if (pattern.test(fullText)) return 'brand'
  }

  // Handle alone (starts the message or is sole content) → could be brand or destination
  const isAlone = new RegExp(`^@${handle}\\s*$`, 'i').test(fullText.trim())
  if (isAlone) return 'brand' // likely brand mode trigger

  return 'unknown'
}
