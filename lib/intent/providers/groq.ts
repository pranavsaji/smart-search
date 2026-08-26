import Groq from 'groq-sdk'
import { env } from '@/lib/config/env'
import { trackLLMCost } from '@/lib/telemetry/costs'

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
  const model = env.GROQ_MODEL_LIGHT()
  const res = await client.chat.completions.create({
    model,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  })
  void trackLLMCost({
    provider: 'groq',
    model,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  })
  return res.choices[0]?.message?.content ?? '{}'
}

export async function groqPhaseB(systemPrompt: string, messages: Message[]): Promise<string> {
  const client = getClient()
  const model = env.GROQ_MODEL()
  const res = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  })
  void trackLLMCost({
    provider: 'groq',
    model,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  })
  return res.choices[0]?.message?.content ?? '{}'
}
