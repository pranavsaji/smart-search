// Phase 9.4 — OpenAI TTS (text-to-speech)
// ElevenLabs can be swapped in by replacing the provider implementation below.

import type { TTSOptions } from './types'

const TTS_URL = 'https://api.openai.com/v1/audio/speech'

export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? 'tts-1',
      input: text,
      voice: options.voice ?? 'nova',
      speed: clampSpeed(options.speed ?? 1.0),
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`TTS API ${res.status}: ${errBody}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function clampSpeed(speed: number): number {
  return Math.min(4.0, Math.max(0.25, speed))
}

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token, TTS charges per 1K chars
  return Math.ceil(text.length / 4)
}
