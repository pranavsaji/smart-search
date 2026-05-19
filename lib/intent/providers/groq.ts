import Groq from 'groq-sdk'
import { env } from '@/lib/config/env'

let _client: Groq | null = null

function getClient(): Groq {
  if (!_client) {
    const apiKey = env.GROQ_API_KEY()
    if (!apiKey) throw new Error('GROQ_API_KEY not configured')
    _client = new Groq({ apiKey })
  }
  return _client
}

interface Message { role: 'user' | 'assistant' | 'system'; content: string }

export async function groqPhaseA(systemPrompt: string, messages: Message[]): Promise<string> {
  const client = getClient()
  const res = await client.chat.completions.create({
    model: env.GROQ_MODEL_LIGHT(),
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  })
  return res.choices[0]?.message?.content ?? '{}'
}

export async function groqPhaseB(systemPrompt: string, messages: Message[]): Promise<string> {
  const client = getClient()
  const res = await client.chat.completions.create({
    model: env.GROQ_MODEL(),
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  })
  return res.choices[0]?.message?.content ?? '{}'
}
