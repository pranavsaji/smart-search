// Phase 9.4 — Voice transcription endpoint
// Accepts audio blob (multipart), returns transcribed text via Whisper.

import { type NextRequest, NextResponse } from 'next/server'
import { withApiHandler, BadRequestError, ok } from '@/lib/api/response'
import { transcribeAudio, isSupportedMimeType } from '@/lib/voice/transcribe'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024  // 25 MB (Whisper limit)

export const POST = withApiHandler(async (req: NextRequest) => {
  const formData = await req.formData()
  const audioFile = formData.get('audio')

  if (!audioFile || typeof audioFile === 'string') {
    throw new BadRequestError('audio field (file) is required')
  }

  const blob = audioFile as File
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new BadRequestError(`Audio file too large — max ${MAX_AUDIO_BYTES / 1024 / 1024} MB`)
  }

  const mimeType = blob.type || 'audio/webm'
  if (!isSupportedMimeType(mimeType)) {
    throw new BadRequestError(`Unsupported audio format: ${mimeType}`)
  }

  const language = formData.get('language')?.toString()
  const buffer = Buffer.from(await blob.arrayBuffer())
  const result = await transcribeAudio(buffer, mimeType, language)

  return ok(result)
}, 'POST /api/voice/transcribe')

export const config = { api: { bodyParser: false } }
