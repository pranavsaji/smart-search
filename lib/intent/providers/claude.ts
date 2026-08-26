import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/config/env'
import { trackLLMCost } from '@/lib/telemetry/costs'

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() })
  }
  return _client
}

interface Message { role: 'user' | 'assistant' | 'system'; content: string }

export async function claudePhaseA(systemPrompt: string, messages: Message[]): Promise<string> {
  const client = getClient()
  const userMessages = messages.filter(m => m.role !== 'system')
  const model = 'claude-haiku-4-5-20251001'
  const res = await client.messages.create({
    model,
    max_tokens: 512,
    system: systemPrompt,
    messages: userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  })
  // Not awaited — spend telemetry must not add latency to the intent pipeline.
  void trackLLMCost({
    provider: 'anthropic',
    model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  })
  const textBlock = res.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : '{}'
}

export async function claudePhaseB(systemPrompt: string, messages: Message[]): Promise<string> {
  const client = getClient()
  const userMessages = messages.filter(m => m.role !== 'system')
  const model = 'claude-sonnet-4-6'
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  })
  void trackLLMCost({
    provider: 'anthropic',
    model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  })
  const textBlock = res.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : '{}'
}
