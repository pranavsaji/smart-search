import Anthropic from '@anthropic-ai/sdk'
import { getDb, COLLECTIONS } from '@/lib/db/mongo'
import type { IntentGraph } from './types'

const client = new Anthropic()

export async function* streamProfileAnswer(
  question: string,
  ownerId: string
): AsyncGenerator<string> {
  const db = await getDb()
  const graphDoc = await db.collection(COLLECTIONS.intentGraphs).findOne(
    { userId: ownerId }
  ) as IntentGraph | null

  const context = buildContext(graphDoc)

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are answering questions about a traveler's preferences based on their profile data. Be concise and helpful. Only answer from the provided context — do not invent details.\n\nProfile context:\n${context}`,
    messages: [{ role: 'user', content: question }],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}

function buildContext(graph: IntentGraph | null): string {
  if (!graph) return 'No profile data available.'

  const lines: string[] = []

  if (graph.destinations?.length) {
    const top = graph.destinations
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(d => d.value)
      .join(', ')
    lines.push(`Favorite destinations: ${top}`)
  }

  lines.push(`Spending style: ${graph.spendingSignal}`)
  lines.push(`Travel style: ${graph.travelStyle}`)

  if (graph.activityPreferences) {
    const prefs = Object.entries(graph.activityPreferences)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([k, v]) => `${k} (${Math.round(v * 100)}%)`)
      .join(', ')
    lines.push(`Top activity preferences: ${prefs}`)
  }

  if (graph.documentContext) {
    lines.push(`\nDocument excerpt:\n${graph.documentContext.slice(0, 1000)}`)
  }

  return lines.join('\n')
}
