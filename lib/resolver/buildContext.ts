import type { ResolvedMention } from './types'

/**
 * Builds an enriched context string from resolved @mentions.
 * Used to augment the Claude prompt with brand/collaborator context.
 * (Distinct from the private buildContext in lib/intent/profileQuery.ts
 * which operates on IntentGraph for profile Q&A.)
 */
export function buildContext(mentions: ResolvedMention[]): string {
  const resolved = mentions.filter(m => m.status === 'resolved' && m.enrichedContext)
  if (resolved.length === 0) return ''
  return resolved.map(m => m.enrichedContext).join('\n')
}
