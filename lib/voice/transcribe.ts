// Phase 9.4 — Whisper-based audio transcription
// Falls back gracefully when OPENAI_API_KEY is absent (dev mode).

import type { TranscribeResult } from './types'

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType = 'audio/webm',
  language?: string
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { text: '[transcription unavailable — OPENAI_API_KEY not set]', language: 'en' }
  }

  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType })
  const formData = new FormData()
  formData.append('file', blob, 'audio.webm')
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'verbose_json')
  if (language) formData.append('language', language)

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Whisper API ${res.status}: ${errBody}`)
  }

  const data = await res.json() as {
    text: string
    language?: string
    duration?: number
  }

  return {
    text: data.text,
    language: data.language,
    durationSeconds: data.duration,
  }
}

export function isSupportedMimeType(mimeType: string): boolean {
  const supported = [
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav',
    'audio/ogg', 'audio/flac', 'audio/m4a', 'audio/mp3',
  ]
  return supported.some(t => mimeType.startsWith(t))
}
