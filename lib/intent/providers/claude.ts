import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/config/env'

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
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  })
  const textBlock = res.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : '{}'
}

export async function claudePhaseB(systemPrompt: string, messages: Message[]): Promise<string> {
  const client = getClient()
  const userMessages = messages.filter(m => m.role !== 'system')
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: userMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  })
  const textBlock = res.content.find(b => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : '{}'
}
