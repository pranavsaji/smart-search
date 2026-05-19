import { extractMentions } from './extractMentions'
import { inferMentionType } from './inferType'
import { classifyMention } from './classifyMention'
import type { ResolvedMention } from './types'

export async function resolveMentions(
  prompt: string,
  ownerUserId?: string
): Promise<ResolvedMention[]> {
  const handles = extractMentions(prompt)
  if (handles.length === 0) return []

  const results = await Promise.allSettled(
    handles.map(async handle => {
      const inferredType = inferMentionType(handle, prompt)
      return classifyMention(handle, inferredType, ownerUserId)
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<ResolvedMention> => r.status === 'fulfilled')
    .map(r => r.value)
}
