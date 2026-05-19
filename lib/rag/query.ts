// Retrieves the most relevant memory chunks for a given query.

import { getPinecone, INDEX_NAME, EMBED_MODEL } from './client'

interface RetrievedChunk {
  text: string
  type: string
  score: number
  weight: number
}

export async function queryUserMemory(
  userId: string,
  query: string,
  topK = 8,
): Promise<RetrievedChunk[]> {
  const pc = getPinecone()
  const index = pc.index(INDEX_NAME).namespace(`user-${userId}`)

  const embedResult = await pc.inference.embed({
    model: EMBED_MODEL,
    inputs: [query],
    parameters: { inputType: 'query', truncate: 'END' },
  })
  const vector = (embedResult.data[0] as unknown as { values: number[] }).values

  const results = await index.query({
    vector,
    topK,
    includeMetadata: true,
  })

  return (results.matches ?? [])
    .filter(m => (m.score ?? 0) > 0.3) // discard weak matches
    .map(m => ({
      text: (m.metadata?.text as string) ?? '',
      type: (m.metadata?.type as string) ?? 'unknown',
      score: m.score ?? 0,
      weight: (m.metadata?.weight as number) ?? 0.5,
    }))
    // Re-rank: combine vector similarity + author-assigned weight
    .sort((a, b) => (b.score * 0.7 + b.weight * 0.3) - (a.score * 0.7 + a.weight * 0.3))
}

// Format retrieved chunks into a prompt-ready context block
export function formatMemoryContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''

  const byType: Record<string, string[]> = {}
  for (const c of chunks) {
    if (!byType[c.type]) byType[c.type] = []
    byType[c.type].push(c.text)
  }

  const sections: string[] = []
  const ORDER = ['booking', 'destination', 'preference', 'style', 'seasonal', 'document']
  for (const type of ORDER) {
    if (!byType[type]) continue
    const label = {
      booking: 'Past bookings',
      destination: 'Destination preferences',
      preference: 'Activity preferences',
      style: 'Style & budget',
      seasonal: 'Seasonal travel patterns',
      document: 'From uploaded documents',
    }[type] ?? type
    sections.push(`**${label}:**\n${byType[type].join('\n')}`)
  }

  return sections.join('\n\n')
}
