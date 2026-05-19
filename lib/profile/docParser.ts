import Anthropic from '@anthropic-ai/sdk'
import type { IntentGraph } from '@/lib/intent/types'

const client = new Anthropic()

const EXTRACT_INTENT_TOOL = {
  name: 'extract_intent_graph',
  description: 'Extract structured travel preferences from a document',
  input_schema: {
    type: 'object' as const,
    properties: {
      destinations: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' }, weight: { type: 'number' } }, required: ['name', 'weight'] },
      },
      spendingSignal: { type: 'string', enum: ['budget', 'mid-range', 'premium', 'unspecified'] },
      activityPreferences: {
        type: 'object',
        properties: {
          flights: { type: 'number' },
          stays: { type: 'number' },
          cars: { type: 'number' },
          experiences: { type: 'number' },
          restaurants: { type: 'number' },
          weather: { type: 'number' },
          maps: { type: 'number' },
        },
      },
      travelStyle: { type: 'string', enum: ['solo', 'couple', 'group', 'unspecified'] },
    },
    required: ['destinations', 'spendingSignal', 'activityPreferences', 'travelStyle'],
  },
}

export async function parseDocumentToIntentGraph(
  text: string,
  userId: string
): Promise<Partial<IntentGraph>> {
  const trimmed = text.slice(0, 12000) // ~4k tokens

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [EXTRACT_INTENT_TOOL],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: `Extract travel preferences from this document. For fields with no signal, use null or 'unspecified'. Document:\n\n${trimmed}`,
      },
    ],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    return { userId, updatedAt: new Date() }
  }

  const input = toolUse.input as Record<string, unknown>

  return {
    userId,
    destinations: (input.destinations as { name: string; weight: number }[])?.map(d => ({
      value: d.name,
      weight: d.weight,
      recencyScore: 1,
      lastSeen: new Date(),
    })) ?? [],
    spendingSignal: (input.spendingSignal as IntentGraph['spendingSignal']) ?? 'unspecified',
    activityPreferences: (input.activityPreferences as IntentGraph['activityPreferences']) ?? {
      flights: 0.5, stays: 0.5, cars: 0.5, experiences: 0.5,
      restaurants: 0.5, weather: 0.5, maps: 0.5,
    },
    travelStyle: (input.travelStyle as IntentGraph['travelStyle']) ?? 'unspecified',
    seasonalPatterns: [],
    outcomeHistory: [],
    documentContext: trimmed.slice(0, 2000),
    updatedAt: new Date(),
  }
}

export async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)
    return data.text
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // Plain text fallback
  return buffer.toString('utf-8')
}
